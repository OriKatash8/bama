import { mockDb, Timestamp } from '../__fixtures__/memoryHelpers';
import {
  claimFeeForCharge, runCharge, applyChargeResult, reconcileStaleClaim,
} from '../charge';
import { evaluateClaim } from '../chargeLogic';
import { savePaymentMethod } from '../paymentMethods';
import { fakeProvider, fakeResolvePending } from '../fakeProvider';
import { sendChargeNotice } from '../notices';
import type { PaymentsConfig } from '../guard';

jest.mock('../../lifecycle/helpers', () => require('../__fixtures__/memoryHelpers').mockHelpers);
jest.mock('../../lifecycle/feeOverdue', () => ({
  recomputeFeeBlockSafely: jest.fn(async () => undefined),
  langOf: async () => 'he',
}));
jest.mock('../notices', () => ({ sendChargeNotice: jest.fn(async () => undefined) }));
// A faithful miniature of settleFee's confirmed branch: same refusals, same fields.
jest.mock('../../lifecycle/completion', () => {
  const { HttpsError: Err } = require('firebase-functions/v2/https');
  const { mockDb: db } = require('../__fixtures__/memoryHelpers');
  return {
    settleFee: jest.fn(async (p: string, u: string, by: any) => {
      const path = `projects/${p}/fees/${u}`;
      const fee = db.read(path);
      if (!fee || fee.status === 'not_owed') throw new Err('failed-precondition', 'nothing-owed');
      const outstanding = Math.max(0, fee.feeDue ?? 0);
      if (outstanding <= 0) throw new Err('failed-precondition', 'already-paid');
      if (by.source === 'charge' && outstanding !== by.chargedAmount) throw new Err('failed-precondition', 'amount-mismatch');
      await db.doc(path).update({
        paidAmount: (fee.paidAmount ?? 0) + outstanding, feeDue: 0, feePaid: true, status: 'paid',
        paidBy: by.source, ...(by.providerRef ? { providerRef: by.providerRef } : {}),
      });
      return { paid: outstanding };
    }),
  };
});

const P = 'proj1';
const U = 'pro1';
const feePath = `projects/${P}/fees/${U}`;
const NOW = Date.now();
const H = 3_600_000;
const config: PaymentsConfig = {
  paymentProvider: 'fake', paymentTestUids: [U], chargeMaxAttempts: 3, chargeRetryHours: 24,
};

const seedFee = (over: Record<string, unknown> = {}) => mockDb.seed(feePath, {
  professionalId: U, projectId: P, feeStatus: 'owed', engagementStatus: 'completed',
  status: 'pending', feePaid: false, feeDue: 100, paidAmount: 0, baseAmount: 3334,
  chargeDueAt: Timestamp.fromMillis(NOW - 1000), ...over,
});
const seedCard = (token: string, status = 'active') => mockDb.seed(`paymentMethods/${U}`, {
  provider: 'fake', token, last4: '4242', brand: 'visa', expMonth: 1, expYear: 2030, status,
});
const fee = () => mockDb.read(feePath)!;
const notices = () => (sendChargeNotice as jest.Mock).mock.calls.map((c) => c[0]);

beforeEach(() => {
  mockDb.reset();
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

describe('claimFeeForCharge', () => {
  it('two parallel claims: exactly one wins, the other is refused', async () => {
    seedFee();
    const [a, b] = await Promise.all([
      claimFeeForCharge(P, U, config, NOW),
      claimFeeForCharge(P, U, config, NOW),
    ]);
    expect([a.claimed, b.claimed].sort()).toEqual([false, true]);
    const winner = (a.claimed ? a : b) as Extract<typeof a, { claimed: true }>;
    expect(winner.idempotencyKey).toBe(`${P}_${U}_1`);
    expect(winner.amount).toBe(100);
    expect(fee()).toMatchObject({ chargeState: 'charging', chargeAttempts: 1, chargeClaimId: winner.claimId });
    expect(mockDb.read(`${feePath}/charges/${P}_${U}_1`)).toMatchObject({ amount: 100, outcome: 'claimed' });
  });

  it('charges feeDue (net of paidAmount), never base x rate', async () => {
    seedFee({ feeDue: 40, paidAmount: 60 });
    const c = await claimFeeForCharge(P, U, config, NOW);
    expect(c).toMatchObject({ claimed: true, amount: 40 });
  });
});

describe('evaluateClaim refusals', () => {
  const ok = () => ({
    feeStatus: 'owed', engagementStatus: 'completed', feeDue: 50, feePaid: false, status: 'pending',
    chargeDueAt: Timestamp.fromMillis(NOW - 1),
  } as any);
  const verdict = (f: any) => evaluateClaim(f, P, U, config, NOW);

  it('accepts the baseline', () => expect(verdict(ok()).ok).toBe(true));
  it.each([
    ['window still open', { chargeDueAt: Timestamp.fromMillis(NOW + 1000) }, 'window-open'],
    ['disputed engagement', { engagementStatus: 'disputed' }, 'not-completed'],
    ['admin review pending', { adminReviewPending: true }, 'under-review'],
    ['nothing due', { feeDue: 0 }, 'nothing-due'],
    ['already paid', { feePaid: true }, 'settled'],
    ['exempt', { feeStatus: 'exempt' }, 'not-owed'],
    ['already charging', { chargeState: 'charging' }, 'state-charging'],
    ['succeeded', { chargeState: 'succeeded' }, 'state-succeeded'],
    ['needs card', { chargeState: 'needs_card' }, 'state-needs_card'],
    ['retry not yet due', { chargeState: 'failed', nextChargeAt: Timestamp.fromMillis(NOW + H) }, 'retry-not-due'],
    ['attempts spent', { chargeAttempts: 3 }, 'attempts-spent'],
    ['awaiting a human', { chargeReview: { reason: 'settle_mismatch' } }, 'needs-human'],
  ])('refuses: %s', (_n, patch, reason) => {
    expect(verdict({ ...ok(), ...patch })).toEqual({ ok: false, reason });
  });
  it('uses the legacy disputeWindowEndsAt when chargeDueAt is absent', () => {
    const f = { ...ok(), chargeDueAt: undefined, disputeWindowEndsAt: Timestamp.fromMillis(NOW + 1000) };
    expect(verdict(f)).toEqual({ ok: false, reason: 'window-open' });
  });
  it('accepts a failed fee once nextChargeAt has passed', () => {
    const f = { ...ok(), chargeState: 'failed', chargeAttempts: 1, nextChargeAt: Timestamp.fromMillis(NOW - 1) };
    expect(verdict(f)).toMatchObject({ ok: true, attempt: 2, idempotencyKey: `${P}_${U}_2` });
  });
});

describe('runCharge', () => {
  it('is a no-op (no-provider) for none, and for fake with a non-tester', async () => {
    seedFee(); seedCard('tok_ok');
    expect((await runCharge(P, U, { ...config, paymentProvider: 'none' }, NOW)).status).toBe('no-provider');
    expect((await runCharge(P, U, { ...config, paymentTestUids: [] }, NOW)).status).toBe('no-provider');
    expect(fee().chargeState).toBeUndefined();
    expect(fee().feePaid).toBe(false);
  });

  it('success settles through the charge source and marks succeeded', async () => {
    seedFee(); seedCard('tok_ok');
    expect((await runCharge(P, U, config, NOW)).status).toBe('succeeded');
    expect(fee()).toMatchObject({
      chargeState: 'succeeded', feePaid: true, status: 'paid', feeDue: 0, paidAmount: 100,
      paidBy: 'charge', providerRef: `fake_${P}_${U}_1`, chargeClaimId: null,
    });
    expect(notices()).toEqual([]);
  });

  it('partial paidAmount: charges only the remainder and totals correctly', async () => {
    seedFee({ feeDue: 40, paidAmount: 60 }); seedCard('tok_ok');
    await runCharge(P, U, config, NOW);
    expect(fee()).toMatchObject({ paidAmount: 100, feeDue: 0, feePaid: true });
    expect(mockDb.read(`projects/${P}/fees/${U}/charges/${P}_${U}_1`)!.amount).toBe(40);
  });

  it('retryable failure: failed + nextChargeAt, one push, not retried early, retried later', async () => {
    seedFee(); seedCard('tok_retry');
    expect((await runCharge(P, U, config, NOW)).status).toBe('failed');
    expect(fee()).toMatchObject({ chargeState: 'failed', chargeAttempts: 1, chargeClaimId: null });
    expect(fee().nextChargeAt.toMillis()).toBe(NOW + 24 * H);
    expect(fee().lastChargeError).toMatchObject({ code: 'fake_declined', class: 'retryable' });
    expect(notices().map((n) => n)).toEqual(['charge_retry']);

    expect(await runCharge(P, U, config, NOW + 1 * H)).toEqual({ status: 'skipped', reason: 'retry-not-due' });
    expect((await runCharge(P, U, config, NOW + 25 * H)).status).toBe('failed');
    expect(fee().chargeAttempts).toBe(2);
    expect(mockDb.read(`projects/${P}/fees/${U}/charges/${P}_${U}_2`)).toBeDefined();
  });

  it('exhausts after chargeMaxAttempts: flagged for an admin, never tried again', async () => {
    seedFee(); seedCard('tok_retry');
    for (let i = 0; i < 3; i++) await runCharge(P, U, config, NOW + i * 25 * H);
    expect(fee()).toMatchObject({ chargeState: 'failed', chargeExhausted: true, chargeAttempts: 3, nextChargeAt: null });
    expect(fee().chargeReview).toMatchObject({ reason: 'attempts_exhausted' });
    expect(fee().chargeNeedsAdmin).toBe(true);
    expect(notices()).toEqual(['charge_retry', 'charge_retry', 'charge_exhausted']);
    expect((await runCharge(P, U, config, NOW + 200 * H)).status).toBe('skipped');
    expect(fee().chargeAttempts).toBe(3);
  });

  it('final failure: card invalidated, needs_card, push; a new card re-queues and then succeeds', async () => {
    seedFee(); seedCard('tok_dead');
    expect((await runCharge(P, U, config, NOW)).status).toBe('failed');
    expect(fee()).toMatchObject({ chargeState: 'needs_card', chargeClaimId: null });
    expect(mockDb.read(`paymentMethods/${U}`)).toMatchObject({ status: 'invalid', invalidReason: 'fake_card_expired' });
    expect(notices()).toEqual(['charge_needs_card']);

    // Nothing charges while the dead card is on file.
    expect((await runCharge(P, U, config, NOW + 2 * H)).status).toBe('skipped');

    await savePaymentMethod(U, 'fake', { token: 'tok_ok', last4: '1111', brand: 'visa', expMonth: 1, expYear: 2031 });
    expect(fee().chargeState).toBe('idle');
    expect(mockDb.read(`paymentMethods/${U}`)).toMatchObject({ status: 'active', last4: '1111' });
    expect((await runCharge(P, U, config, NOW + 3 * H)).status).toBe('succeeded');
    expect(fee()).toMatchObject({ feePaid: true, chargeAttempts: 2 });
  });

  it('no card at due time: needs_card without spending an attempt, one push only', async () => {
    seedFee();
    expect((await runCharge(P, U, config, NOW)).status).toBe('needs_card');
    expect(fee()).toMatchObject({ chargeState: 'needs_card' });
    expect(fee().chargeAttempts).toBeUndefined();
    expect(fee().lastChargeError).toMatchObject({ class: 'no_card' });
    await runCharge(P, U, config, NOW + H);
    expect(notices()).toEqual(['charge_no_card']);
  });

  it('an invalidated card counts as no card', async () => {
    seedFee(); seedCard('tok_ok', 'invalid');
    expect((await runCharge(P, U, config, NOW)).status).toBe('needs_card');
    expect(fee().feePaid).toBe(false);
  });

  it('a provider call that throws leaves the claim for reconciliation, charges nothing twice', async () => {
    seedFee(); seedCard('tok_ok');
    jest.spyOn(fakeProvider, 'chargeToken').mockRejectedValueOnce(new Error('socket hang up'));
    expect((await runCharge(P, U, config, NOW)).status).toBe('unknown');
    expect(fee()).toMatchObject({ chargeState: 'charging', chargeAttempts: 1 });
    // A second sweep must not start another charge on top.
    expect(await runCharge(P, U, config, NOW + 1000)).toEqual({ status: 'skipped', reason: 'state-charging' });
  });
});

describe('webhook-style results (applyChargeResult)', () => {
  const key = `${P}_${U}_1`;

  it('pending keeps the claim; the later success settles exactly once, replays are inert', async () => {
    seedFee(); seedCard('tok_pending');
    expect((await runCharge(P, U, config, NOW)).status).toBe('pending');
    expect(fee()).toMatchObject({ chargeState: 'charging', feePaid: false });

    const evt: any = await fakeResolvePending(key, 'succeeded');
    await applyChargeResult(P, U, key, evt, config, NOW);
    await applyChargeResult(P, U, key, evt, config, NOW); // replay
    expect(fee()).toMatchObject({ chargeState: 'succeeded', feePaid: true, paidAmount: 100, paidBy: 'charge' });
    const { settleFee } = require('../../lifecycle/completion');
    expect(settleFee).toHaveBeenCalledTimes(1);
    expect(fee().chargeReview).toBeUndefined();
  });

  it('a pending charge that later fails retryably is retried like any failure', async () => {
    seedFee(); seedCard('tok_pending');
    await runCharge(P, U, config, NOW);
    const evt: any = await fakeResolvePending(key, 'failed', 'retryable');
    await applyChargeResult(P, U, key, evt, config, NOW);
    expect(fee()).toMatchObject({ chargeState: 'failed' });
    expect(fee().nextChargeAt.toMillis()).toBe(NOW + 24 * H);
  });

  it('out of order: a failure arriving after success never moves the fee back', async () => {
    seedFee(); seedCard('tok_pending');
    await runCharge(P, U, config, NOW);
    await applyChargeResult(P, U, key, { outcome: 'succeeded', providerRef: 'r1' }, config, NOW);
    await applyChargeResult(P, U, key, { outcome: 'failed', failureClass: 'final', failureCode: 'late' }, config, NOW);
    expect(fee()).toMatchObject({ chargeState: 'succeeded', feePaid: true });
    expect(mockDb.read(`paymentMethods/${U}`)!.status).toBe('active');
    expect(notices()).toEqual([]);
  });

  it('a stale failure for an older attempt does not disturb the attempt now in flight', async () => {
    seedFee(); seedCard('tok_retry');
    await runCharge(P, U, config, NOW);                       // attempt 1 fails
    seedCard('tok_pending');
    await runCharge(P, U, config, NOW + 25 * H);              // attempt 2 pending
    expect(fee()).toMatchObject({ chargeState: 'charging', chargeAttempts: 2 });
    await applyChargeResult(P, U, key, { outcome: 'failed', failureClass: 'final', failureCode: 'dup' }, config, NOW + 26 * H);
    expect(fee().chargeState).toBe('charging');
    expect(mockDb.read(`paymentMethods/${U}`)!.status).toBe('active');
  });

  it('a success that no longer matches the balance is flagged, not recorded against it', async () => {
    seedFee(); seedCard('tok_pending');
    await runCharge(P, U, config, NOW);
    mockDb.seed(feePath, { ...fee(), feeDue: 60 });           // e.g. re-priced after the charge was sent
    await applyChargeResult(P, U, key, { outcome: 'succeeded', providerRef: 'r9' }, config, NOW);
    expect(fee()).toMatchObject({ chargeState: 'succeeded', feePaid: false, feeDue: 60 });
    expect(fee().chargeReview).toMatchObject({
      reason: 'settle_mismatch', chargedAmount: 100, feeDueAtReview: 60, providerRef: 'r9',
    });
    expect(fee().chargeNeedsAdmin).toBe(true);
  });

  it('a second success (duplicate charge) is flagged for a refund, balance untouched', async () => {
    seedFee(); seedCard('tok_ok');
    await runCharge(P, U, config, NOW);
    mockDb.seed(`${feePath}/charges/${P}_${U}_2`, { amount: 100, outcome: 'claimed' });
    await applyChargeResult(P, U, `${P}_${U}_2`, { outcome: 'succeeded', providerRef: 'dup' }, config, NOW);
    expect(fee()).toMatchObject({ feePaid: true, paidAmount: 100 });
    expect(fee().chargeReview).toMatchObject({ reason: 'settle_mismatch', providerRef: 'dup' });
  });

  it('ignores a result for an attempt it never made', async () => {
    seedFee();
    await applyChargeResult(P, U, `${P}_${U}_9`, { outcome: 'succeeded' }, config, NOW);
    expect(fee().feePaid).toBe(false);
  });
});

describe('reconcileStaleClaim', () => {
  const key = `${P}_${U}_1`;
  const stale = (over = {}) => seedFee({
    chargeState: 'charging', chargeAttempts: 1, chargeIdempotencyKey: key, chargeClaimId: 'c1',
    chargeClaimedAt: Timestamp.fromMillis(NOW - 31 * 60_000), ...over,
  });
  beforeEach(() => mockDb.seed(`${feePath}/charges/${key}`, { amount: 100, outcome: 'claimed', idempotencyKey: key }));

  it('leaves a fresh claim alone', async () => {
    stale({ chargeClaimedAt: Timestamp.fromMillis(NOW - 60_000) });
    expect(await reconcileStaleClaim(P, U, config, NOW)).toBe('skipped');
  });
  it('asks the provider and settles a charge that actually succeeded', async () => {
    stale();
    mockDb.seed(`paymentFake/${key}`, { result: { outcome: 'succeeded', providerRef: 'r1' } });
    expect(await reconcileStaleClaim(P, U, config, NOW)).toBe('resolved');
    expect(fee()).toMatchObject({ chargeState: 'succeeded', feePaid: true });
  });
  it('leaves a still-pending charge held', async () => {
    stale();
    mockDb.seed(`paymentFake/${key}`, { result: { outcome: 'pending' } });
    expect(await reconcileStaleClaim(P, U, config, NOW)).toBe('pending');
    expect(fee().chargeState).toBe('charging');
  });
  it('releases the claim only when the provider has no record of the key', async () => {
    stale();
    expect(await reconcileStaleClaim(P, U, config, NOW)).toBe('released');
    expect(fee()).toMatchObject({ chargeState: 'failed', chargeClaimId: null });
    expect(fee().feePaid).toBe(false);
  });
  it('flags for a human when the provider cannot be asked', async () => {
    stale();
    const original = fakeProvider.lookupCharge;
    (fakeProvider as { lookupCharge?: unknown }).lookupCharge = undefined;
    try {
      expect(await reconcileStaleClaim(P, U, config, NOW)).toBe('flagged');
    } finally {
      fakeProvider.lookupCharge = original;
    }
    expect(fee().chargeReview).toMatchObject({ reason: 'unresolved_claim' });
    expect(fee().chargeNeedsAdmin).toBe(true);
    expect(fee().chargeState).toBe('charging');
  });
});

