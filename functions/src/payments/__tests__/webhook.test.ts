import { mockDb, Timestamp } from '../__fixtures__/memoryHelpers';
import { processWebhookEvent } from '../webhookCore';
import { runCharge } from '../charge';
import { sendChargeNotice } from '../notices';
import { settleFee } from '../../lifecycle/completion';
import type { PaymentsConfig } from '../guard';
import type { WebhookEvent } from '../types';

jest.mock('../../lifecycle/helpers', () => require('../__fixtures__/memoryHelpers').mockHelpers);
jest.mock('../../lifecycle/feeOverdue', () => ({ recomputeFeeBlockSafely: jest.fn(), langOf: async () => 'he' }));
jest.mock('../notices', () => ({ sendChargeNotice: jest.fn(async () => undefined) }));
jest.mock('../../lifecycle/completion', () => ({
  settleFee: jest.fn(async (p: string, u: string, by: any) => {
    const { mockDb: db } = require('../__fixtures__/memoryHelpers');
    const path = `projects/${p}/fees/${u}`;
    const fee = db.read(path);
    if ((fee.feeDue ?? 0) <= 0) throw new (require('firebase-functions/v2/https').HttpsError)('failed-precondition', 'already-paid');
    await db.doc(path).update({ paidAmount: fee.feeDue, feeDue: 0, feePaid: true, status: 'paid', paidBy: by.source });
    return { paid: fee.feeDue };
  }),
}));

const P = 'proj1';
const U = 'pro1';
const feePath = `projects/${P}/fees/${U}`;
const key = `${P}_${U}_1`;
const NOW = Date.now();
const config: PaymentsConfig = { paymentProvider: 'fake', paymentTestUids: [U], chargeMaxAttempts: 3, chargeRetryHours: 24 };
const fee = () => mockDb.read(feePath)!;

const charge = (eventId: string, outcome: 'succeeded' | 'failed' | 'pending', extra: object = {}): WebhookEvent => ({
  type: 'charge', providerEventId: eventId, idempotencyKey: key, outcome, ...extra,
} as WebhookEvent);

async function pendingCharge() {
  mockDb.seed(feePath, {
    professionalId: U, feeStatus: 'owed', engagementStatus: 'completed', status: 'pending', feePaid: false,
    feeDue: 100, paidAmount: 0, chargeDueAt: Timestamp.fromMillis(NOW - 1000),
  });
  mockDb.seed(`paymentMethods/${U}`, { provider: 'fake', token: 'tok_pending', status: 'active' });
  await runCharge(P, U, config, NOW);
}

beforeEach(() => { mockDb.reset(); jest.clearAllMocks(); });

describe('processWebhookEvent', () => {
  it('settles a pending charge and records the event', async () => {
    await pendingCharge();
    expect(await processWebhookEvent(charge('evt1', 'succeeded', { providerRef: 'r1' }), config, NOW)).toBe('processed');
    expect(fee()).toMatchObject({ chargeState: 'succeeded', feePaid: true, paidBy: 'charge' });
    expect(mockDb.read('paymentEvents/evt1')).toMatchObject({ status: 'processed', result: 'processed' });
  });

  it('replay of the same event id is a no-op', async () => {
    await pendingCharge();
    await processWebhookEvent(charge('evt1', 'succeeded'), config, NOW);
    expect(await processWebhookEvent(charge('evt1', 'succeeded'), config, NOW)).toBe('duplicate');
    expect(settleFee).toHaveBeenCalledTimes(1);
  });

  it('a different event id carrying the same result still settles only once', async () => {
    await pendingCharge();
    await processWebhookEvent(charge('evt1', 'succeeded'), config, NOW);
    await processWebhookEvent(charge('evt2', 'succeeded'), config, NOW);
    expect(settleFee).toHaveBeenCalledTimes(1);
    expect(fee().chargeReview).toBeUndefined();
  });

  it('out of order: failure after success leaves the fee succeeded and tells nobody', async () => {
    await pendingCharge();
    await processWebhookEvent(charge('evt1', 'succeeded'), config, NOW);
    await processWebhookEvent(charge('evt2', 'failed', { failureClass: 'final', failureCode: 'late' }), config, NOW);
    expect(fee()).toMatchObject({ chargeState: 'succeeded', feePaid: true });
    expect(sendChargeNotice).not.toHaveBeenCalled();
  });

  it('out of order the other way: success after a recorded failure still settles (the money was taken)', async () => {
    await pendingCharge();
    await processWebhookEvent(charge('evt1', 'failed', { failureClass: 'retryable', failureCode: 'x' }), config, NOW);
    expect(fee().chargeState).toBe('failed');
    await processWebhookEvent(charge('evt2', 'succeeded'), config, NOW);
    expect(fee()).toMatchObject({ chargeState: 'succeeded', feePaid: true });
  });

  it('a processing error leaves the event retryable', async () => {
    await pendingCharge();
    (settleFee as jest.Mock).mockRejectedValueOnce(new Error('firestore unavailable'));
    await expect(processWebhookEvent(charge('evt1', 'succeeded'), config, NOW)).rejects.toThrow('unavailable');
    expect(mockDb.read('paymentEvents/evt1')!.status).toBe('received');
    expect(await processWebhookEvent(charge('evt1', 'succeeded'), config, NOW)).toBe('processed');
    expect(fee().feePaid).toBe(true);
  });

  it('an unparseable or unknown key is recorded as unmatched, not thrown', async () => {
    const evt = { ...charge('evt1', 'succeeded'), idempotencyKey: 'garbage' } as WebhookEvent;
    expect(await processWebhookEvent(evt, config, NOW)).toBe('unmatched');
    const unknownAttempt = { ...charge('evt2', 'succeeded'), idempotencyKey: `p9_${U}_1` } as WebhookEvent;
    expect(await processWebhookEvent(unknownAttempt, config, NOW)).toBe('processed');
  });

  it('ignores events for a professional the provider is not enabled for', async () => {
    await pendingCharge();
    const off = { ...config, paymentTestUids: [] };
    expect(await processWebhookEvent(charge('evt1', 'succeeded'), off, NOW)).toBe('ignored');
    expect(fee().feePaid).toBe(false);
  });

  it('card_saved stores the card, re-queues needs_card fees; ignored for a disabled user', async () => {
    mockDb.seed(feePath, { professionalId: U, chargeState: 'needs_card', feeStatus: 'owed' });
    const card = { token: 'tok_ok', last4: '4242', brand: 'visa', expMonth: 1, expYear: 2031 };
    const evt: WebhookEvent = { type: 'card_saved', providerEventId: 'c1', uid: U, card };
    expect(await processWebhookEvent(evt, config, NOW)).toBe('processed');
    expect(mockDb.read(`paymentMethods/${U}`)).toMatchObject({ token: 'tok_ok', status: 'active' });
    expect(fee().chargeState).toBe('idle');

    const other: WebhookEvent = { ...evt, providerEventId: 'c2', uid: 'stranger' };
    expect(await processWebhookEvent(other, config, NOW)).toBe('ignored');
    expect(mockDb.read('paymentMethods/stranger')).toBeUndefined();
  });
});
