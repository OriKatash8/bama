import { mockDb, Timestamp } from '../__fixtures__/memoryHelpers';
import { runFeeChargeSweep } from '../feeChargeCron';
import { runLinkIssue, claimFeeForLink } from '../link';
import { fakeLinkProvider } from '../fakeLinkProvider';
import { sendLinkNotice } from '../notices';
import { israeliMobileLocal, LINK_CLAIM_STALE_MS, LINK_MAX_ATTEMPTS } from '../linkLogic';
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
jest.mock('firebase-admin', () => ({}));
jest.mock('firebase-functions/v2/scheduler', () => ({ onSchedule: (_o: unknown, fn: unknown) => fn }));

const NOW = Date.now();
const H = 3_600_000;
const cfg = (over: Partial<PaymentsConfig> = {}): PaymentsConfig => ({
  paymentProvider: 'fake_link', paymentTestUids: ['tester'], paymentLinkAudience: 'testers',
  chargeMaxAttempts: 3, chargeRetryHours: 24, ...over,
});
const seed = (proj: string, uid: string, over: Record<string, unknown> = {}) =>
  mockDb.seed(`projects/${proj}/fees/${uid}`, {
    professionalId: uid, feeStatus: 'owed', engagementStatus: 'completed', status: 'pending',
    feePaid: false, feeDue: 100, paidAmount: 0, chargeDueAt: Timestamp.fromMillis(NOW - H), ...over,
  });
const fee = (proj: string, uid: string) => mockDb.read(`projects/${proj}/fees/${uid}`)!;
const payer = async () => ({
  ok: true as const, payer: { fullName: 'A', phone: '0501234567' }, title: 'T',
});
const noPhone = async () => ({ ok: false as const, reason: 'no-mobile' as const });

beforeEach(() => { mockDb.reset(); jest.clearAllMocks(); });

describe('israeliMobileLocal', () => {
  it('accepts only +9725XXXXXXXX and returns the local form', () => {
    expect(israeliMobileLocal('+972501234567')).toBe('0501234567');
    for (const bad of ['+97231234567', '+972771234567', '+14155550123', '0771234567', '031234567', null, 5]) {
      expect(israeliMobileLocal(bad)).toBeNull();
    }
  });
});

describe('runLinkIssue', () => {
  it('creates one link, stores it, writes the pointer, pushes once', async () => {
    seed('p1', 'tester');
    const r = await runLinkIssue('p1', 'tester', cfg(), NOW, { loadPayer: payer });
    expect(r.status).toBe('created');
    const f = fee('p1', 'tester');
    expect(f).toMatchObject({ chargeState: 'awaiting_payment', paymentLink: { amount: 100 } });
    expect(f.paymentLinkClaim).toBeUndefined();
    const ptr = mockDb.read(`paymentLinks/${f.paymentLink.processId}`)!;
    expect(ptr).toMatchObject({ projectId: 'p1', proId: 'tester', feeKey: 'p1_tester', amount: 100 });
    expect(ptr.supersededAt).toBeUndefined();
    expect(sendLinkNotice).toHaveBeenCalledWith('link_ready', 'tester', 'p1', 100);
  });

  it('claim race: two concurrent runs make exactly one link', async () => {
    seed('p1', 'tester');
    let calls = 0;
    const provider: LinkProvider = {
      name: 'fake_link',
      async createPaymentLink(i) { calls += 1; return fakeLinkProvider.createPaymentLink(i); },
    };
    const results = await Promise.all([
      runLinkIssue('p1', 'tester', cfg(), NOW, { provider, loadPayer: payer }),
      runLinkIssue('p1', 'tester', cfg(), NOW, { provider, loadPayer: payer }),
    ]);
    expect(calls).toBe(1);
    expect(results.filter((r) => r.status === 'created')).toHaveLength(1);
    expect([...mockDb.data.keys()].filter((k) => k.startsWith('paymentLinks/'))).toHaveLength(1);
  });

  it('a second run reuses the live link (no new link, no new push)', async () => {
    seed('p1', 'tester');
    await runLinkIssue('p1', 'tester', cfg(), NOW, { loadPayer: payer });
    const before = fee('p1', 'tester').paymentLink;
    const r = await runLinkIssue('p1', 'tester', cfg(), NOW + H, { loadPayer: payer });
    expect(r).toEqual({ status: 'skipped', reason: 'link-live' });
    expect(fee('p1', 'tester').paymentLink).toEqual(before);
    expect(sendLinkNotice).toHaveBeenCalledTimes(1);
  });

  it('feeDue changed: old link superseded (fee + pointer), a new one created', async () => {
    seed('p1', 'tester');
    await runLinkIssue('p1', 'tester', cfg(), NOW, { loadPayer: payer });
    const oldId = fee('p1', 'tester').paymentLink.processId;
    mockDb.seed('projects/p1/fees/tester', { ...fee('p1', 'tester'), feeDue: 60 });
    // fakeLink ids derive from the claim id, so the new link differs.
    const r = await runLinkIssue('p1', 'tester', cfg(), NOW + H, { loadPayer: payer });
    expect(r.status).toBe('created');
    const f = fee('p1', 'tester');
    expect(f.paymentLink).toMatchObject({ amount: 60 });
    expect(f.paymentLink.processId).not.toBe(oldId);
    expect(mockDb.read(`paymentLinks/${oldId}`)!.supersededAt).toBeDefined();
    expect(mockDb.read(`paymentLinks/${f.paymentLink.processId}`)!.supersededAt).toBeUndefined();
  });

  it('feeDue voided: the link is retired and the fee goes back to idle', async () => {
    seed('p1', 'tester');
    await runLinkIssue('p1', 'tester', cfg(), NOW, { loadPayer: payer });
    const id = fee('p1', 'tester').paymentLink.processId;
    mockDb.seed('projects/p1/fees/tester', { ...fee('p1', 'tester'), feeDue: 0, status: 'not_owed' });
    expect((await runLinkIssue('p1', 'tester', cfg(), NOW + H, { loadPayer: payer })).status).toBe('voided');
    expect(fee('p1', 'tester')).toMatchObject({ chargeState: 'idle', paymentLink: { superseded: true } });
    expect(mockDb.read(`paymentLinks/${id}`)!.supersededAt).toBeDefined();
  });

  it('Make failure: claim released, no link, retried next run, no duplicate', async () => {
    seed('p1', 'tester');
    let fail = true;
    const provider: LinkProvider = {
      name: 'fake_link',
      async createPaymentLink(i) {
        if (fail) throw new Error('make: http 502');
        return fakeLinkProvider.createPaymentLink(i);
      },
    };
    expect((await runLinkIssue('p1', 'tester', cfg(), NOW, { provider, loadPayer: payer })).status).toBe('failed');
    expect(fee('p1', 'tester').paymentLink).toBeUndefined();
    expect(fee('p1', 'tester').paymentLinkClaim.attempts).toBe(1);
    fail = false;
    expect((await runLinkIssue('p1', 'tester', cfg(), NOW + H, { provider, loadPayer: payer })).status).toBe('created');
    expect([...mockDb.data.keys()].filter((k) => k.startsWith('paymentLinks/'))).toHaveLength(1);
  });

  it('a crashed worker holds the claim until it goes stale', async () => {
    seed('p1', 'tester', { paymentLinkClaim: { id: 'x', at: Timestamp.fromMillis(NOW), attempts: 1 } });
    expect(await runLinkIssue('p1', 'tester', cfg(), NOW + 1000, { loadPayer: payer }))
      .toEqual({ status: 'skipped', reason: 'claim-held' });
    expect((await runLinkIssue('p1', 'tester', cfg(), NOW + LINK_CLAIM_STALE_MS + 1, { loadPayer: payer })).status)
      .toBe('created');
  });

  it('after LINK_MAX_ATTEMPTS failures it flags link_create_failed for an admin', async () => {
    seed('p1', 'tester');
    const provider: LinkProvider = { name: 'fake_link', async createPaymentLink() { throw new Error('down'); } };
    for (let i = 0; i < LINK_MAX_ATTEMPTS; i++) {
      await runLinkIssue('p1', 'tester', cfg(), NOW + i * H, { provider, loadPayer: payer });
    }
    expect(fee('p1', 'tester')).toMatchObject({
      chargeNeedsAdmin: true, linkReview: { reason: 'link_create_failed' },
    });
    expect(await runLinkIssue('p1', 'tester', cfg(), NOW + 99 * H, { provider, loadPayer: payer }))
      .toEqual({ status: 'skipped', reason: 'attempts-spent' });
  });

  it('feeDue moves while Make works: the new link is attached to nothing and flagged superseded', async () => {
    seed('p1', 'tester');
    const provider: LinkProvider = {
      name: 'fake_link',
      async createPaymentLink(i) {
        mockDb.seed('projects/p1/fees/tester', { ...fee('p1', 'tester'), feeDue: 40 });
        return fakeLinkProvider.createPaymentLink(i);
      },
    };
    const r = await runLinkIssue('p1', 'tester', cfg(), NOW, { provider, loadPayer: payer });
    expect(r).toEqual({ status: 'skipped', reason: 'fee-changed' });
    expect(fee('p1', 'tester').paymentLink).toBeUndefined();
    const [ptrPath] = [...mockDb.data.keys()].filter((k) => k.startsWith('paymentLinks/'));
    expect(mockDb.read(ptrPath)!.supersededAt).toBeDefined();
  });

  it('no mobile: needs_phone, one push only, then a link once a phone exists', async () => {
    seed('p1', 'tester');
    expect((await runLinkIssue('p1', 'tester', cfg(), NOW, { loadPayer: noPhone })).status).toBe('needs_phone');
    expect(fee('p1', 'tester')).toMatchObject({ chargeState: 'needs_phone' });
    await runLinkIssue('p1', 'tester', cfg(), NOW + H, { loadPayer: noPhone });
    await runLinkIssue('p1', 'tester', cfg(), NOW + 2 * H, { loadPayer: noPhone });
    expect(sendLinkNotice).toHaveBeenCalledTimes(1);
    expect(sendLinkNotice).toHaveBeenCalledWith('link_needs_phone', 'tester', 'p1', 100);
    expect((await runLinkIssue('p1', 'tester', cfg(), NOW + 3 * H, { loadPayer: payer })).status).toBe('created');
    expect(fee('p1', 'tester')).toMatchObject({ chargeState: 'awaiting_payment' });
  });

  it('testers-only guard: a non-tester gets nothing; audience all opens it', async () => {
    seed('p2', 'regular');
    expect((await runLinkIssue('p2', 'regular', cfg({ paymentProvider: 'grow_link' }), NOW, { loadPayer: payer,
      provider: undefined })).status).toBe('no-provider');
    expect(fee('p2', 'regular').chargeState).toBeUndefined();
  });

  it.each([
    ['window open', { chargeDueAt: Timestamp.fromMillis(NOW + H) }],
    ['under review', { adminReviewPending: true }],
    ['already paid', { feePaid: true }],
    ['nothing due', { feeDue: 0 }],
    ['not completed', { engagementStatus: 'active' }],
  ])('refuses: %s', async (_n, over) => {
    seed('p1', 'tester', over);
    expect((await runLinkIssue('p1', 'tester', cfg(), NOW, { loadPayer: payer })).status).toBe('skipped');
    expect(fee('p1', 'tester').paymentLink).toBeUndefined();
  });

  it('claimFeeForLink: only one of N racers claims', async () => {
    seed('p1', 'tester');
    const rs = await Promise.all([1, 2, 3, 4].map(() => claimFeeForLink('p1', 'tester', NOW)));
    expect(rs.filter((r) => r.claimed)).toHaveLength(1);
  });
});

describe('runFeeChargeSweep in link mode', () => {
  it('links testers, leaves others untouched, never runs the stub or charges a token', async () => {
    const { runStubChargeFor } = require('../../lifecycle/charge');
    seed('p1', 'tester');
    seed('p2', 'regular');
    // The tester's payer lookup needs firebase-admin (mocked empty here), so that
    // fee errors inside the sweep's per-fee try/catch; what this pins is the routing.
    const link = require('../link');
    const spy = jest.spyOn(link, 'runLinkIssue');
    await runFeeChargeSweep(NOW, cfg());
    expect(spy).toHaveBeenCalledTimes(2);
    expect(runStubChargeFor).not.toHaveBeenCalled();
    expect(fee('p2', 'regular').chargeState).toBeUndefined();
    expect(fee('p2', 'regular').paymentLink).toBeUndefined();
  });
});
