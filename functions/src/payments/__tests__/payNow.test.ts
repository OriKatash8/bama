import { mockDb, Timestamp } from '../__fixtures__/memoryHelpers';
import { requestPaymentLinkNow } from '../requestPaymentLinkNow';
import { runLinkIssue } from '../link';
import { evaluateLinkClaim, LINK_MAX_ATTEMPTS } from '../linkLogic';
import { fakeLinkProvider } from '../fakeLinkProvider';
import { sendLinkNotice } from '../notices';
import type { PaymentsConfig } from '../guard';
import type { LinkProvider } from '../types';

jest.mock('../../lifecycle/helpers', () => require('../__fixtures__/memoryHelpers').mockHelpers);
jest.mock('../../lifecycle/feeOverdue', () => ({ recomputeFeeBlockSafely: jest.fn(), langOf: async () => 'he' }));
jest.mock('../notices', () => ({
  sendChargeNotice: jest.fn(async () => undefined),
  sendLinkNotice: jest.fn(async () => undefined),
}));
jest.mock('../../lifecycle/completion', () => ({ settleFee: jest.fn(async () => ({ paid: 1 })) }));
jest.mock('../../lifecycle/charge', () => ({ runStubChargeFor: jest.fn(async () => undefined) }));
jest.mock('../../auth/verifiedEmail', () => ({ assertVerifiedEmail: jest.fn() }));
jest.mock('firebase-admin', () => ({}));
jest.mock('firebase-functions/v2/scheduler', () => ({ onSchedule: (_o: unknown, fn: unknown) => fn }));
jest.mock('firebase-functions/v2/https', () => ({
  ...jest.requireActual('firebase-functions/v2/https'),
  onCall: (_o: unknown, fn: unknown) => fn,
}));

const NOW = Date.now();
const H = 3_600_000;
const DAY = 24 * H;
const cfg = (over: Partial<PaymentsConfig> = {}): PaymentsConfig => ({
  paymentProvider: 'fake_link', paymentTestUids: ['tester'], paymentLinkAudience: 'testers',
  chargeMaxAttempts: 3, chargeRetryHours: 24, ...over,
});
// chargeDueAt in the FUTURE: the contest window is still open.
const seed = (over: Record<string, unknown> = {}, uid = 'tester') =>
  mockDb.seed(`projects/p1/fees/${uid}`, {
    professionalId: uid, feeStatus: 'owed', engagementStatus: 'completed', status: 'pending',
    feePaid: false, feeDue: 100, paidAmount: 0, chargeDueAt: Timestamp.fromMillis(NOW + 3 * DAY), ...over,
  });
const fee = (uid = 'tester') => mockDb.read(`projects/p1/fees/${uid}`)!;
const payer = async () => ({ ok: true as const, payer: { fullName: 'A B', phone: '0501234567' }, title: 'T' });
const noPhone = async () => ({ ok: false as const, reason: 'no-mobile' as const });
const pointers = () => [...mockDb.data.keys()].filter((k) => k.startsWith('paymentLinks/'));
const counting = () => {
  const state = { calls: 0 };
  const provider: LinkProvider = {
    name: 'fake_link',
    async createPaymentLink(i) { state.calls += 1; return fakeLinkProvider.createPaymentLink(i); },
  };
  return { state, provider };
};

beforeEach(() => { mockDb.reset(); jest.clearAllMocks(); });

describe('evaluateLinkClaim early', () => {
  it('waives only the window', () => {
    seed();
    expect(evaluateLinkClaim(fee() as any, NOW)).toEqual({ ok: false, reason: 'window-open' });
    expect(evaluateLinkClaim(fee() as any, NOW, { early: true })).toMatchObject({ ok: true, amount: 100 });
    for (const [over, reason] of [
      [{ engagementStatus: 'disputed' }, 'not-completed'],
      [{ adminReviewPending: true }, 'under-review'],
      [{ feePaid: true }, 'settled'],
      [{ feeDue: 0 }, 'nothing-due'],
      [{ chargeReview: { reason: 'x' } }, 'needs-human'],
      [{ feeStatus: 'exempt' }, 'not-owed'],
    ] as const) {
      seed(over as any);
      expect(evaluateLinkClaim(fee() as any, NOW, { early: true })).toEqual({ ok: false, reason });
    }
  });
});

describe('requestPaymentLinkNow', () => {
  it('early pay during the window: creates the link, no push', async () => {
    seed();
    const r = await requestPaymentLinkNow('p1', 'tester', cfg(), NOW, { loadPayer: payer });
    expect(r.status).toBe('ready');
    expect(fee()).toMatchObject({ chargeState: 'awaiting_payment', paymentLink: { amount: 100 } });
    expect((r as any).url).toBe(fee().paymentLink.url);
    expect(pointers()).toHaveLength(1);
    expect(sendLinkNotice).not.toHaveBeenCalled();
  });

  it('tap twice -> one link, same URL, one Make call', async () => {
    seed();
    const { state, provider } = counting();
    const a = await requestPaymentLinkNow('p1', 'tester', cfg(), NOW, { provider, loadPayer: payer });
    const b = await requestPaymentLinkNow('p1', 'tester', cfg(), NOW + 1000, { provider, loadPayer: payer });
    expect(state.calls).toBe(1);
    expect(a).toEqual(b);
    expect(pointers()).toHaveLength(1);
  });

  it('two concurrent taps -> one link; the loser is pending or reuses it', async () => {
    seed();
    const { state, provider } = counting();
    const rs = await Promise.all([
      requestPaymentLinkNow('p1', 'tester', cfg(), NOW, { provider, loadPayer: payer }),
      requestPaymentLinkNow('p1', 'tester', cfg(), NOW, { provider, loadPayer: payer }),
    ]);
    expect(state.calls).toBe(1);
    expect(pointers()).toHaveLength(1);
    // The loser either reuses the winner's link or is told it is being made.
    for (const r of rs) expect(['ready', 'pending']).toContain(r.status);
    expect(rs.filter((r) => r.status === 'ready').length).toBeGreaterThanOrEqual(1);
    const urls = new Set(rs.filter((r) => r.status === 'ready').map((r) => (r as any).url));
    expect(urls.size).toBe(1);
  });

  it('cron + tap race -> one link', async () => {
    // Window already over, so the cron may act too.
    seed({ chargeDueAt: Timestamp.fromMillis(NOW - H) });
    const { state, provider } = counting();
    await Promise.all([
      requestPaymentLinkNow('p1', 'tester', cfg(), NOW, { provider, loadPayer: payer }),
      runLinkIssue('p1', 'tester', cfg(), NOW, { provider, loadPayer: payer }),
    ]);
    expect(state.calls).toBe(1);
    expect(pointers()).toHaveLength(1);
  });

  it('the cron after an early link reuses it (no second link, no push)', async () => {
    seed();
    await requestPaymentLinkNow('p1', 'tester', cfg(), NOW, { loadPayer: payer });
    const before = fee().paymentLink;
    const later = NOW + 4 * DAY;
    const r = await runLinkIssue('p1', 'tester', cfg(), later, { loadPayer: payer });
    expect(r).toEqual({ status: 'skipped', reason: 'link-live' });
    expect(fee().paymentLink).toEqual(before);
    expect(sendLinkNotice).not.toHaveBeenCalled();
  });

  it('a contested fee gets no link', async () => {
    seed({ engagementStatus: 'disputed', adminReviewPending: true });
    await expect(requestPaymentLinkNow('p1', 'tester', cfg(), NOW, { loadPayer: payer }))
      .rejects.toMatchObject({ message: 'contested' });
    expect(pointers()).toHaveLength(0);
  });

  it('refuses settled, voided and zero fees', async () => {
    for (const [over, msg] of [
      [{ feePaid: true, status: 'paid' }, 'not-owed'],
      [{ status: 'not_owed', feeDue: 0 }, 'not-owed'],
      [{ feeDue: 0 }, 'nothing-due'],
      [{ engagementStatus: 'hired' }, 'not-completed'],
    ] as const) {
      seed(over as any);
      await expect(requestPaymentLinkNow('p1', 'tester', cfg(), NOW, { loadPayer: payer }))
        .rejects.toMatchObject({ message: msg });
    }
    expect(pointers()).toHaveLength(0);
  });

  it('outside the audience / provider off -> payments-disabled', async () => {
    seed({}, 'someone');
    await expect(requestPaymentLinkNow('p1', 'someone', cfg(), NOW, { loadPayer: payer }))
      .rejects.toMatchObject({ message: 'payments-disabled' });
    await expect(requestPaymentLinkNow('p1', 'tester', cfg({ paymentProvider: 'none' }), NOW))
      .rejects.toMatchObject({ message: 'payments-disabled' });
  });

  it('no mobile -> needs_phone, parked, pushed once', async () => {
    seed();
    const r = await requestPaymentLinkNow('p1', 'tester', cfg(), NOW, { loadPayer: noPhone });
    expect(r).toEqual({ status: 'needs_phone' });
    expect(fee()).toMatchObject({ chargeState: 'needs_phone' });
    expect(pointers()).toHaveLength(0);
  });

  it('amount changed: the old link is superseded and a new one made', async () => {
    seed();
    await requestPaymentLinkNow('p1', 'tester', cfg(), NOW, { loadPayer: payer });
    const oldId = fee().paymentLink.processId;
    mockDb.seed('projects/p1/fees/tester', { ...fee(), feeDue: 60 });
    const r = await requestPaymentLinkNow('p1', 'tester', cfg(), NOW + H, { loadPayer: payer });
    expect(r.status).toBe('ready');
    expect(fee().paymentLink).toMatchObject({ amount: 60 });
    expect(mockDb.read(`paymentLinks/${oldId}`)!.supersededAt).toBeDefined();
  });

  it('user-initiated Make failures do not spend the cron retry budget or raise a review', async () => {
    seed();
    const provider: LinkProvider = {
      name: 'fake_link', async createPaymentLink() { throw new Error('make: http 502'); },
    };
    for (let i = 0; i < LINK_MAX_ATTEMPTS + 2; i++) {
      const r = await requestPaymentLinkNow('p1', 'tester', cfg(), NOW + i, { provider, loadPayer: payer });
      expect(r).toEqual({ status: 'unavailable' });
    }
    expect(fee().linkReview).toBeUndefined();
    expect(fee().chargeNeedsAdmin).toBeUndefined();
    expect(fee().paymentLinkClaim?.attempts ?? 0).toBe(0);
    // And the cron can still make the link afterwards.
    const r = await runLinkIssue('p1', 'tester', cfg(), NOW + 5 * DAY, { loadPayer: payer });
    expect(r.status).toBe('created');
  });

  it('a cron-made link in the window is reused by a tap', async () => {
    seed({ chargeDueAt: Timestamp.fromMillis(NOW - H) });
    await runLinkIssue('p1', 'tester', cfg(), NOW, { loadPayer: payer });
    const { state, provider } = counting();
    const r = await requestPaymentLinkNow('p1', 'tester', cfg(), NOW + 1, { provider, loadPayer: payer });
    expect(r).toMatchObject({ status: 'ready', url: fee().paymentLink.url });
    expect(state.calls).toBe(0);
  });
});
