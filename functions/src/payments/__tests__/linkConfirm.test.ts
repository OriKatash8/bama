import { mockDb, Timestamp } from '../__fixtures__/memoryHelpers';
import { processWebhookEvent } from '../webhookCore';
import { parseLinkPayment, verifyLinkSecret } from '../linkConfirm';
import { settleFee } from '../../lifecycle/completion';
import type { PaymentsConfig } from '../guard';

jest.mock('../../lifecycle/helpers', () => require('../__fixtures__/memoryHelpers').mockHelpers);
jest.mock('../../lifecycle/feeOverdue', () => ({ recomputeFeeBlockSafely: jest.fn(), langOf: async () => 'he' }));
jest.mock('../notices', () => ({ sendChargeNotice: jest.fn(), sendLinkNotice: jest.fn() }));
// Same contract as the real settleFee for the parts this flow depends on.
jest.mock('../../lifecycle/completion', () => ({
  settleFee: jest.fn(async (p: string, u: string, by: any) => {
    const { mockDb: db } = require('../__fixtures__/memoryHelpers');
    const { HttpsError } = require('firebase-functions/v2/https');
    const path = `projects/${p}/fees/${u}`;
    const fee = db.read(path);
    if (fee.status === 'not_owed') throw new HttpsError('failed-precondition', 'nothing-owed');
    if ((fee.feeDue ?? 0) <= 0) throw new HttpsError('failed-precondition', 'already-paid');
    if (by.source !== 'admin' && fee.feeDue !== by.chargedAmount) throw new HttpsError('failed-precondition', 'amount-mismatch');
    await db.doc(path).update({
      paidAmount: fee.feeDue, feeDue: 0, feePaid: true, status: 'paid', paidBy: by.source, providerRef: by.providerRef,
    });
    return { paid: fee.feeDue };
  }),
}));
jest.mock('firebase-admin', () => ({}));

const P = 'proj1';
const U = 'pro1';
const feePath = `projects/${P}/fees/${U}`;
const NOW = Date.now();
const config: PaymentsConfig = {
  paymentProvider: 'grow_link', paymentTestUids: [], paymentLinkAudience: 'testers',
  chargeMaxAttempts: 3, chargeRetryHours: 24,
};
const fee = () => mockDb.read(feePath)!;

function seedLinked(over: Record<string, unknown> = {}, ptrOver: Record<string, unknown> = {}) {
  mockDb.seed(feePath, {
    professionalId: U, feeStatus: 'owed', engagementStatus: 'completed', status: 'pending', feePaid: false,
    feeDue: 100, paidAmount: 0, chargeDueAt: Timestamp.fromMillis(NOW - 1000), chargeState: 'awaiting_payment',
    paymentLink: { url: 'https://g/x', processId: 'L1', amount: 100, createdAt: Timestamp.fromMillis(NOW) },
    ...over,
  });
  mockDb.seed('paymentLinks/L1', { projectId: P, proId: U, feeKey: `${P}_${U}`, amount: 100, ...ptrOver });
}
const pay = (over: Record<string, unknown> = {}) => parseLinkPayment({
  paymentLinkProcessId: 'L1', feeKey: `${P}_${U}`, amount: 100, transactionId: 'T1', asmachta: 'A1', status: 'paid',
  ...over,
})!;
const run = (ev = pay()) => processWebhookEvent(ev, config, NOW);
const issues = () => [...mockDb.data.keys()].filter((k) => k.startsWith('paymentLinkIssues/'));

beforeEach(() => { mockDb.reset(); jest.clearAllMocks(); });

describe('verifyLinkSecret', () => {
  it('matches only the exact secret', () => {
    expect(verifyLinkSecret('s3cret', 's3cret')).toBe(true);
    for (const bad of ['s3cre', 's3cret ', 'S3CRET', '', undefined, null, 5, ['s3cret']]) {
      expect(verifyLinkSecret(bad, 's3cret')).toBe(false);
    }
  });
  it('an empty expected secret never matches, not even an empty header', () => {
    expect(verifyLinkSecret('', '')).toBe(false);
    expect(verifyLinkSecret('x', '')).toBe(false);
  });
});

describe('parseLinkPayment', () => {
  const ok = { paymentLinkProcessId: 'L1', amount: 100, transactionId: 'T1' };
  it('accepts the documented body, with or without feeKey/asmachta', () => {
    expect(parseLinkPayment({ ...ok, feeKey: 'a_b', asmachta: '9', status: 'paid' }))
      .toMatchObject({ type: 'link_payment', providerEventId: 'link_T1', processId: 'L1', feeKey: 'a_b', asmachta: '9' });
    expect(parseLinkPayment({ ...ok, feeKey: null })).toMatchObject({ feeKey: null });
    expect(parseLinkPayment(ok)).not.toBeNull();
    expect(parseLinkPayment({ ...ok, feeKey: '  ' })).toMatchObject({ feeKey: null });
  });
  it.each([
    ['not an object', null], ['no process id', { ...ok, paymentLinkProcessId: '' }],
    ['no transaction id', { ...ok, transactionId: undefined }], ['string amount', { ...ok, amount: '100' }],
    ['zero amount', { ...ok, amount: 0 }], ['NaN amount', { ...ok, amount: NaN }],
    ['negative amount', { ...ok, amount: -5 }], ['not paid', { ...ok, status: 'failed' }],
    ['feeKey of wrong type', { ...ok, feeKey: 7 }],
  ])('rejects %s', (_n, body) => expect(parseLinkPayment(body)).toBeNull());
});

describe('applyLinkPayment via processWebhookEvent', () => {
  it('settles a matching payment exactly once', async () => {
    seedLinked();
    expect(await run()).toBe('settled');
    expect(fee()).toMatchObject({ feePaid: true, paidBy: 'link', providerRef: 'T1', chargeState: 'succeeded' });
    expect(settleFee).toHaveBeenCalledWith(P, U, { source: 'link', providerRef: 'T1', chargedAmount: 100 });
  });

  it('replay of the same transaction is a duplicate and does nothing', async () => {
    seedLinked();
    await run();
    expect(await run()).toBe('duplicate');
    expect(settleFee).toHaveBeenCalledTimes(1);
    expect(issues()).toHaveLength(0);
  });

  it('a crash after settling but before marking processed finishes on retry without a review', async () => {
    seedLinked();
    await run();
    mockDb.seed('paymentEvents/link_T1', { status: 'received', providerEventId: 'link_T1', type: 'link_payment' });
    mockDb.seed(feePath, { ...fee(), chargeState: 'awaiting_payment' });
    expect(await run()).toBe('settled');
    expect(settleFee).toHaveBeenCalledTimes(1);
    expect(fee().linkReview).toBeUndefined();
  });

  it('wrong amount: nothing settles, fee flagged link_amount_mismatch', async () => {
    seedLinked();
    expect(await run(pay({ amount: 90 }))).toBe('needs_review');
    expect(fee()).toMatchObject({ feePaid: false, chargeNeedsAdmin: true, linkReview: { reason: 'link_amount_mismatch', amount: 90 } });
    expect(settleFee).not.toHaveBeenCalled();
  });

  it('feeKey disagrees with the processId: nothing settles, link_key_mismatch', async () => {
    seedLinked();
    expect(await run(pay({ feeKey: 'other_pro' }))).toBe('needs_review');
    expect(fee()).toMatchObject({ feePaid: false, linkReview: { reason: 'link_key_mismatch' } });
    expect(settleFee).not.toHaveBeenCalled();
  });

  it('feeKey missing is fine: processId alone matches', async () => {
    seedLinked();
    expect(await run(pay({ feeKey: null }))).toBe('settled');
  });

  it('payment on a superseded link (pointer): link_superseded, fee still owed', async () => {
    seedLinked({}, { supersededAt: Timestamp.fromMillis(NOW) });
    expect(await run()).toBe('needs_review');
    expect(fee()).toMatchObject({ feePaid: false, linkReview: { reason: 'link_superseded' } });
    expect(settleFee).not.toHaveBeenCalled();
  });

  it('payment on an old link after a newer one replaced it: link_superseded', async () => {
    seedLinked({ paymentLink: { url: 'u', processId: 'L2', amount: 60, createdAt: Timestamp.fromMillis(NOW) }, feeDue: 60 });
    expect(await run()).toBe('needs_review');
    expect(fee().linkReview).toMatchObject({ reason: 'link_superseded' });
    expect(fee().feePaid).toBe(false);
  });

  it('payment on a contested fee (link was in flight): link_superseded, nothing settles', async () => {
    seedLinked({ engagementStatus: 'disputed', adminReviewPending: true });
    expect(await run()).toBe('needs_review');
    expect(fee()).toMatchObject({ feePaid: false, linkReview: { reason: 'link_superseded' } });
    expect(settleFee).not.toHaveBeenCalled();
  });

  it('payment on a voided fee: link_superseded', async () => {
    seedLinked({ status: 'not_owed', feeDue: 0 });
    expect(await run()).toBe('needs_review');
    expect(fee().linkReview).toMatchObject({ reason: 'link_superseded' });
    expect(settleFee).not.toHaveBeenCalled();
  });

  it('payment on an already-settled fee: link_after_settled, nothing double-recorded', async () => {
    seedLinked({ feePaid: true, status: 'paid', feeDue: 0, paidBy: 'admin' });
    expect(await run()).toBe('needs_review');
    expect(fee()).toMatchObject({ paidBy: 'admin', linkReview: { reason: 'link_after_settled', transactionId: 'T1' } });
    expect(settleFee).not.toHaveBeenCalled();
  });

  it('fee moves between our read and settleFee: amount-mismatch becomes a review, not a 500', async () => {
    seedLinked();
    (settleFee as jest.Mock).mockImplementationOnce(async () => {
      throw new (require('firebase-functions/v2/https').HttpsError)('failed-precondition', 'amount-mismatch');
    });
    expect(await run()).toBe('needs_review');
    expect(fee().linkReview).toMatchObject({ reason: 'link_amount_mismatch' });
  });

  it('a transient settle failure throws (500, Make retries) and the event stays unprocessed', async () => {
    seedLinked();
    (settleFee as jest.Mock).mockRejectedValueOnce(new Error('unavailable'));
    await expect(run()).rejects.toThrow('unavailable');
    expect(mockDb.read('paymentEvents/link_T1')!.status).toBe('received');
    expect(await run()).toBe('settled');
  });

  it('unknown processId: recorded for an admin, no fee touched', async () => {
    seedLinked();
    expect(await run(pay({ paymentLinkProcessId: 'ORPHAN', transactionId: 'T9' }))).toBe('needs_review');
    expect(issues()).toEqual(['paymentLinkIssues/T9']);
    expect(mockDb.read('paymentLinkIssues/T9')).toMatchObject({ reason: 'link_unmatched', amount: 100, acknowledged: false });
    expect(fee().feePaid).toBe(false);
  });

  it('still settles when the provider has since been switched off (money is money)', async () => {
    seedLinked();
    expect(await processWebhookEvent(pay(), { ...config, paymentProvider: 'none' }, NOW)).toBe('settled');
  });
});
