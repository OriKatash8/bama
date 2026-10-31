import { mockDb, Timestamp } from '../__fixtures__/memoryHelpers';
import { runFeeChargeSweep, FIRST_ATTEMPT_LOOKBACK_MS } from '../feeChargeCron';
import { runStubChargeFor } from '../../lifecycle/charge';
import type { PaymentsConfig } from '../guard';

jest.mock('../../lifecycle/helpers', () => require('../__fixtures__/memoryHelpers').mockHelpers);
jest.mock('../../lifecycle/feeOverdue', () => ({ recomputeFeeBlockSafely: jest.fn(), langOf: async () => 'he' }));
jest.mock('../notices', () => ({ sendChargeNotice: jest.fn(async () => undefined) }));
jest.mock('../../lifecycle/completion', () => ({ settleFee: jest.fn(async () => ({ paid: 1 })) }));
jest.mock('../../lifecycle/charge', () => ({ runStubChargeFor: jest.fn(async () => undefined) }));
jest.mock('firebase-admin', () => ({}));
jest.mock('firebase-functions/v2/scheduler', () => ({ onSchedule: (_o: unknown, fn: unknown) => fn }));

const NOW = Date.now();
const H = 3_600_000;
const cfg = (over: Partial<PaymentsConfig> = {}): PaymentsConfig => ({
  paymentProvider: 'fake', paymentTestUids: ['tester'], chargeMaxAttempts: 3, chargeRetryHours: 24, ...over,
});
const seed = (proj: string, uid: string, over: Record<string, unknown> = {}) =>
  mockDb.seed(`projects/${proj}/fees/${uid}`, {
    professionalId: uid, feeStatus: 'owed', engagementStatus: 'completed', status: 'pending',
    feePaid: false, feeDue: 100, paidAmount: 0, chargeDueAt: Timestamp.fromMillis(NOW - H), ...over,
  });
const card = (uid: string, token = 'tok_ok') => mockDb.seed(`paymentMethods/${uid}`, {
  provider: 'fake', token, last4: '1', brand: 'visa', expMonth: 1, expYear: 2030, status: 'active',
});
const fee = (proj: string, uid: string) => mockDb.read(`projects/${proj}/fees/${uid}`)!;

beforeEach(() => { mockDb.reset(); jest.clearAllMocks(); });

describe('runFeeChargeSweep', () => {
  it("does nothing at all when the provider is 'none'", async () => {
    seed('p1', 'tester'); card('tester');
    expect(await runFeeChargeSweep(NOW, cfg({ paymentProvider: 'none' }))).toEqual({ tried: 0, stub: 0, reconciled: 0, errors: 0 });
    expect(fee('p1', 'tester').chargeState).toBeUndefined();
    expect(runStubChargeFor).not.toHaveBeenCalled();
  });

  it('charges a tester, and routes a non-tester to the untouched stub path', async () => {
    seed('p1', 'tester'); card('tester');
    seed('p2', 'regular'); card('regular');
    const tally = await runFeeChargeSweep(NOW, cfg());
    expect(tally).toMatchObject({ tried: 1, stub: 1, errors: 0 });
    expect(fee('p1', 'tester')).toMatchObject({ chargeState: 'succeeded' });
    expect(fee('p2', 'regular').chargeState).toBeUndefined();   // never claimed
    expect(runStubChargeFor).toHaveBeenCalledWith('p2', 'regular', expect.anything());
  });

  it('does not sweep a backlog older than the first-attempt lookback', async () => {
    seed('old', 'tester', { chargeDueAt: Timestamp.fromMillis(NOW - FIRST_ATTEMPT_LOOKBACK_MS - H) });
    card('tester');
    expect((await runFeeChargeSweep(NOW, cfg())).tried).toBe(0);
    expect(fee('old', 'tester').chargeState).toBeUndefined();
  });

  it('still picks up an old fee that carries state (re-queued after a new card)', async () => {
    seed('old', 'tester', { chargeDueAt: Timestamp.fromMillis(NOW - 60 * 24 * H), chargeState: 'idle', chargeAttempts: 1 });
    card('tester');
    expect((await runFeeChargeSweep(NOW, cfg())).tried).toBe(1);
    expect(fee('old', 'tester').chargeState).toBe('succeeded');
  });

  it('retries a failed fee only once nextChargeAt has passed', async () => {
    seed('p1', 'tester', { chargeState: 'failed', chargeAttempts: 1, nextChargeAt: Timestamp.fromMillis(NOW + H) });
    card('tester');
    await runFeeChargeSweep(NOW, cfg());
    expect(fee('p1', 'tester').chargeState).toBe('failed');
    await runFeeChargeSweep(NOW + 2 * H, cfg());
    expect(fee('p1', 'tester').chargeState).toBe('succeeded');
  });

  it('reconciles a stale claim', async () => {
    seed('p1', 'tester', {
      chargeState: 'charging', chargeAttempts: 1, chargeIdempotencyKey: 'p1_tester_1',
      chargeClaimedAt: Timestamp.fromMillis(NOW - 40 * 60_000),
    });
    mockDb.seed('projects/p1/fees/tester/charges/p1_tester_1', { amount: 100, outcome: 'claimed' });
    mockDb.seed('paymentFake/p1_tester_1', { result: { outcome: 'succeeded', providerRef: 'r' } });
    const tally = await runFeeChargeSweep(NOW, cfg());
    expect(tally.reconciled).toBe(1);
    expect(fee('p1', 'tester').chargeState).toBe('succeeded');
  });

  it('one fee blowing up does not stop the rest of the batch', async () => {
    seed('bad', 'tester'); card('tester');
    seed('good', 'tester2'); card('tester2');
    const orig = mockDb.runTransaction.bind(mockDb);
    let first = true;
    jest.spyOn(mockDb, 'runTransaction').mockImplementation(async (fn: any) => {
      if (first) { first = false; throw new Error('boom'); }
      return orig(fn);
    });
    const tally = await runFeeChargeSweep(NOW, cfg({ paymentTestUids: ['tester', 'tester2'] }));
    expect(tally.errors).toBe(1);
    expect(tally.tried).toBe(1);
  });
});
