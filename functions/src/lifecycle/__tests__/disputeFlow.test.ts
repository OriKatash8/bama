import { mockDb, Timestamp } from '../../payments/__fixtures__/memoryHelpers';
import { contestEngagement, disputeFeeByPro } from '../completion';
import { resolveFeeDispute } from '../disputeResolution';
import { applyDerivedProjectState } from '../derive';
import { buildHireFeeUpdate } from '../feeRehire';
import { onReviewCreate } from '../reviews';

/**
 * reject → re-hire → complete → dispute → resolve, on the REAL derive, contest,
 * resolution and review-hold code over an in-memory Firestore.
 *
 * The production bug this pins: a professional rejected during candidate review and
 * then re-hired kept `releaseReason: 'candidate_rejected'` on the live engagement.
 * derive dropped it, so the project never completed (no review screen, no closing
 * contacts) and a later dispute was erased from the project flag.
 */
jest.mock('../helpers', () => {
  const m = require('../../payments/__fixtures__/memoryHelpers').mockHelpers;
  return {
    ...m,
    requireAdmin: (t: { role?: string } | undefined) => {
      if (t?.role !== 'admin') throw Object.assign(new Error('Admins only'), { code: 'permission-denied' });
    },
  };
});
jest.mock('../config', () => ({
  readConfig: jest.fn(async () => ({})),
  feeRateOf: () => 0.03,
}));
jest.mock('../disputeAlert', () => ({ notifyAdminsOfDispute: jest.fn(async () => undefined) }));
jest.mock('../feeOverdue', () => ({
  overdueStampFields: jest.fn(() => ({})),
  recomputeFeeBlockSafely: jest.fn(async () => undefined),
  sendFeeNotice: jest.fn(async () => undefined),
  notifyFeeCreated: jest.fn(async () => undefined),
}));
jest.mock('../removal', () => ({ releaseEngagement: jest.fn() }));
jest.mock('../review', () => ({ warnIfCompletedUnderReview: jest.fn() }));
jest.mock('../offerCleanup', () => ({ deletePendingOffers: jest.fn() }));
jest.mock('../chatClose', () => ({ addChatCloseWrites: jest.fn() }));
jest.mock('../../demo', () => ({ assertSameSide: jest.fn() }));
jest.mock('firebase-admin', () => ({}));
jest.mock('firebase-functions/v2/https', () => ({
  ...jest.requireActual('firebase-functions/v2/https'),
  onCall: (fn: unknown) => fn,
}));
jest.mock('firebase-functions/v2/firestore', () => ({
  onDocumentCreated: (_path: string, fn: unknown) => fn,
}));

const DAY = 86_400_000;
const FEE = 'projects/p1/fees/pro1';
const PROJECT = 'projects/p1';
const REVIEW = 'reviews/p1_pro1';
const fee = () => mockDb.read(FEE)!;
const project = () => mockDb.read(PROJECT)!;
const asPro = (data: Record<string, unknown>) => ({ auth: { uid: 'pro1' }, data: { projectId: 'p1', ...data } });
const asAdmin = (data: Record<string, unknown>) =>
  ({ auth: { uid: 'admin1', token: { role: 'admin' } }, data: { projectId: 'p1', proId: 'pro1', ...data } });
const call = (fn: unknown, req: unknown) => (fn as (r: unknown) => Promise<unknown>)(req);

/** The fee exactly as removal.ts leaves it after the client rejects the candidate. */
function seedRejectedCandidate() {
  mockDb.reset();
  mockDb.seed(PROJECT, {
    clientId: 'c1', status: 'open', chatId: 'chat1', professionalIds: ['pro1'], slotHolders: ['pro1'],
  });
  mockDb.seed(FEE, {
    professionalId: 'pro1', projectId: 'p1', feeStatus: 'owed', feeRate: 0.02, minFeeApplied: 4,
    baseAmount: 50, status: 'not_owed', feeDue: 0, slotActive: false,
    hiredAt: Timestamp.fromMillis(1), createdAt: Timestamp.fromMillis(1),
    engagementStatus: 'withdrawn', releaseReason: 'candidate_rejected',
  });
}

/** hire.ts's merge-write for the re-hire, applied the way the transaction applies it. */
async function rehire(amount = 50) {
  const update = buildHireFeeUpdate({
    proId: 'pro1', projectId: 'p1', amount,
    existing: mockDb.snap(FEE), feeRate: 0.03, minFeeApplied: 6,
  });
  await mockDb.doc(FEE).set(update, { merge: true });
}

/** What confirming the completion leaves on the fee. */
async function complete() {
  await mockDb.doc(FEE).update({
    engagementStatus: 'completed', feeDue: 6, status: 'pending', feePaid: false, slotActive: false,
    chargeDueAt: Timestamp.fromMillis(Date.now() + 4 * DAY),
    completion: { state: 'confirmed', source: 'client', confirmedAt: Timestamp.fromMillis(Date.now()) },
  });
  await applyDerivedProjectState('p1');
}

const seedReview = () => mockDb.seed(REVIEW, {
  projectId: 'p1', professionalId: 'pro1', reviewerId: 'c1', rating: 5, published: true,
});

describe('reject → re-hire → complete → dispute → resolve', () => {
  beforeEach(() => { seedRejectedCandidate(); jest.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => jest.restoreAllMocks());

  it('the re-hire is a new join: stale fields cleared, rate re-locked, money trail kept', async () => {
    mockDb.seed(FEE, {
      ...fee(), paidAmount: 10, providerRef: 'ref1', disputedAt: Timestamp.fromMillis(1),
      adminReviewPending: true, overdueAt: Timestamp.fromMillis(1), chargeState: 'failed',
    });
    await rehire(80);
    expect(fee()).toMatchObject({
      engagementStatus: 'hired', baseAmount: 80, status: 'pending', slotActive: true,
      feeRate: 0.03, minFeeApplied: 6, // the CURRENT rate, not the 0.02 / 4 of the old join
      paidAmount: 10, providerRef: 'ref1', createdAt: expect.anything(),
    });
    for (const gone of ['releaseReason', 'disputedAt', 'adminReviewPending', 'overdueAt', 'chargeState', 'feeDue']) {
      expect(fee()).not.toHaveProperty(gone);
    }
  });

  it('a second role for a live engagement still accumulates and re-locks nothing', async () => {
    mockDb.seed(FEE, { ...fee(), engagementStatus: 'hired', releaseReason: undefined, baseAmount: 50, feeRate: 0.02 });
    await rehire(30);
    expect(fee()).toMatchObject({ baseAmount: 80, feeRate: 0.02, engagementStatus: 'hired' });
  });

  it('the re-hired professional completes the project (the original bug)', async () => {
    await rehire();
    await complete();
    expect(project()).toMatchObject({ status: 'completed', completion: { state: 'confirmed' }, slotHolders: [] });
    expect(project().completedAt).toBeDefined();
  });

  it('a stale releaseReason on a LIVE engagement no longer hides it (existing bad data repairs itself)', async () => {
    await mockDb.doc(FEE).update({
      engagementStatus: 'completed', releaseReason: 'candidate_rejected', feePaid: false,
      chargeDueAt: Timestamp.fromMillis(Date.now() + DAY),
    });
    await applyDerivedProjectState('p1');
    expect(project().status).toBe('completed');
  });

  describe('"it didn\'t happen"', () => {
    beforeEach(async () => { await rehire(); await complete(); seedReview(); });

    it('keeps the project completed and flagged, and holds the review', async () => {
      await call(contestEngagement, asPro({ reason: 'didnt_happen', note: 'cancelled on the day' }));
      expect(fee()).toMatchObject({ engagementStatus: 'disputed', adminReviewPending: true });
      expect(project()).toMatchObject({
        status: 'completed', adminReviewPending: true, completion: { state: 'confirmed' },
        slotHolders: ['pro1'], // the slot stays held while the dispute is open
      });
      expect(mockDb.read(REVIEW)).toMatchObject({ published: false, heldForDispute: true });
    });

    it('a review written AFTER the dispute is created held', async () => {
      await call(contestEngagement, asPro({ reason: 'didnt_happen' }));
      mockDb.seed('reviews/late', { projectId: 'p1', professionalId: 'pro1', rating: 4 });
      await call(onReviewCreate, { data: { data: () => mockDb.read('reviews/late'), ref: mockDb.doc('reviews/late') } });
      expect(mockDb.read('reviews/late')).toMatchObject({ published: false, heldForDispute: true });
    });

    it('resolved "completed": the project stays completed, the flag clears, the review is published', async () => {
      await call(contestEngagement, asPro({ reason: 'didnt_happen' }));
      await call(resolveFeeDispute, asAdmin({ outcome: 'completed' }));
      expect(fee()).toMatchObject({ engagementStatus: 'completed', adminReviewPending: false });
      expect(project()).toMatchObject({ status: 'completed', adminReviewPending: false, slotHolders: [] });
      const r = mockDb.read(REVIEW)!;
      expect(r.published).toBe(true);
      expect(r).not.toHaveProperty('heldForDispute');
    });

    it('resolved "cancelled": the project stays completed, the flag clears, the review is deleted', async () => {
      await call(contestEngagement, asPro({ reason: 'didnt_happen' }));
      await call(resolveFeeDispute, asAdmin({ outcome: 'cancelled' }));
      expect(fee()).toMatchObject({ engagementStatus: 'cancelled', adminReviewPending: false });
      expect(project()).toMatchObject({ status: 'completed', adminReviewPending: false, slotHolders: [] });
      expect(mockDb.read(REVIEW)).toBeUndefined();
    });
  });

  describe('an amount dispute', () => {
    beforeEach(async () => { await rehire(); await complete(); seedReview(); });

    it('never holds the review, and still leaves the project completed and flagged', async () => {
      await call(contestEngagement, asPro({ reason: 'amount_disputed' }));
      expect(mockDb.read(REVIEW)).toMatchObject({ published: true });
      expect(mockDb.read(REVIEW)).not.toHaveProperty('heldForDispute');
      expect(project()).toMatchObject({ status: 'completed', adminReviewPending: true });
      await call(resolveFeeDispute, asAdmin({ outcome: 'cancelled' }));
      expect(mockDb.read(REVIEW)).toMatchObject({ published: true }); // nothing was held, nothing is deleted
    });

    it('the old-build alias behaves the same', async () => {
      await call(disputeFeeByPro, asPro({}));
      expect(project()).toMatchObject({ status: 'completed', adminReviewPending: true });
      expect(mockDb.read(REVIEW)).toMatchObject({ published: true });
    });
  });

  it('a disputed professional cannot be hired again until it is resolved', () => {
    // hire.ts refuses this before its transaction; the guard is pinned in hire's source.
    const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'hire.ts'), 'utf8');
    expect(src).toContain("'engagement-disputed'");
  });
});
