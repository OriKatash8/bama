import { mockDb, Timestamp } from '../../payments/__fixtures__/memoryHelpers';
import { contestEngagement, disputeFeeByPro } from '../completion';

jest.mock('../helpers', () => {
  const m = require('../../payments/__fixtures__/memoryHelpers').mockHelpers;
  // The memory FieldValue has no arrayUnion; the slot write is not what is tested.
  return { ...m, FieldValue: { ...m.FieldValue, arrayUnion: (...v: unknown[]) => v } };
});
jest.mock('../config', () => ({ readConfig: jest.fn() }));
jest.mock('../derive', () => ({ applyDerivedProjectState: jest.fn(async () => undefined) }));
jest.mock('../feeOverdue', () => ({
  overdueStampFields: jest.fn(() => ({})), recomputeFeeBlockSafely: jest.fn(async () => undefined),
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

const NOW = Date.now();
const DAY = 86_400_000;
const feePath = 'projects/p1/fees/pro1';
const seed = (over: Record<string, unknown> = {}) => {
  mockDb.seed(feePath, {
    professionalId: 'pro1', feeStatus: 'owed', engagementStatus: 'completed', status: 'pending',
    feePaid: false, feeDue: 100, baseAmount: 3000, chargeDueAt: Timestamp.fromMillis(NOW + 2 * DAY), ...over,
  });
  mockDb.seed('projects/p1', { slotHolders: [] });
};
const fee = () => mockDb.read(feePath)!;
const call = (fn: any, data: Record<string, unknown> = {}) =>
  fn({ auth: { uid: 'pro1' }, data: { projectId: 'p1', ...data } });
const liveLink = {
  url: 'https://g/x', processId: 'L1', amount: 100, createdAt: Timestamp.fromMillis(NOW),
};

beforeEach(() => { mockDb.reset(); jest.clearAllMocks(); });

describe('contesting after paying', () => {
  it('a paid fee cannot be contested (either entry point)', async () => {
    seed({ feePaid: true, status: 'paid', feeDue: 0 });
    await expect(call(contestEngagement, { reason: 'amount_disputed' }))
      .rejects.toMatchObject({ message: 'fee-already-paid' });
    await expect(call(disputeFeeByPro)).rejects.toMatchObject({ message: 'fee-already-paid' });
    expect(fee().engagementStatus).toBe('completed');
    expect(fee().adminReviewPending).toBeUndefined();
  });

  it('an unpaid fee in the window can still be contested', async () => {
    seed();
    await expect(call(contestEngagement, { reason: 'amount_disputed' })).resolves.toMatchObject({ ok: true });
    expect(fee()).toMatchObject({ engagementStatus: 'disputed', adminReviewPending: true, feeDue: 100 });
  });

  it('past the window it is still refused', async () => {
    seed({ chargeDueAt: Timestamp.fromMillis(NOW - 1000) });
    await expect(call(contestEngagement, { reason: 'didnt_happen' }))
      .rejects.toMatchObject({ message: 'contest-window-closed' });
  });
});

describe('contesting with a live payment link', () => {
  it('supersedes the fee link and its pointer in the same write', async () => {
    seed({ chargeState: 'awaiting_payment', paymentLink: liveLink });
    mockDb.seed('paymentLinks/L1', { projectId: 'p1', proId: 'pro1', feeKey: 'p1_pro1', amount: 100 });
    await call(contestEngagement, { reason: 'amount_disputed' });
    expect(fee().paymentLink).toMatchObject({ processId: 'L1', superseded: true });
    expect(mockDb.read('paymentLinks/L1')!.supersededAt).toBeDefined();
  });

  it('didnt_happen also retires the link', async () => {
    seed({ chargeState: 'awaiting_payment', paymentLink: liveLink });
    mockDb.seed('paymentLinks/L1', { projectId: 'p1', proId: 'pro1', feeKey: 'p1_pro1', amount: 100 });
    await call(contestEngagement, { reason: 'didnt_happen' });
    expect(fee()).toMatchObject({ feeDue: 0, status: 'not_owed', paymentLink: { superseded: true } });
    expect(mockDb.read('paymentLinks/L1')!.supersededAt).toBeDefined();
  });

  it('the old-build alias supersedes it too', async () => {
    seed({ chargeState: 'awaiting_payment', paymentLink: liveLink });
    mockDb.seed('paymentLinks/L1', { projectId: 'p1', proId: 'pro1', feeKey: 'p1_pro1', amount: 100 });
    await call(disputeFeeByPro);
    expect(fee().paymentLink.superseded).toBe(true);
  });

  it('a fee with no link contests exactly as before', async () => {
    seed();
    await call(contestEngagement, { reason: 'amount_disputed' });
    expect(fee().paymentLink).toBeUndefined();
  });
});
