import { mockDb } from '../../payments/__fixtures__/memoryHelpers';
import { onReviewCreate, updateIfExists } from '../reviews';

/**
 * onReviewCreate resolves `published` on every new review. It must only ever UPDATE the review: a
 * merge-set re-creates a document that was deleted in the meantime, as an empty published stub.
 */
jest.mock('../helpers', () => require('../../payments/__fixtures__/memoryHelpers').mockHelpers);
jest.mock('firebase-functions/v2/firestore', () => ({
  onDocumentCreated: (_path: string, fn: unknown) => fn,
}));

const REVIEW = 'reviews/p1_pro1';
const FEE = 'projects/p1/fees/pro1';
const seedReview = () => mockDb.seed(REVIEW, { projectId: 'p1', professionalId: 'pro1', reviewerId: 'c1', rating: 5, body: 'great' });
const fire = (path = REVIEW) =>
  (onReviewCreate as unknown as (e: unknown) => Promise<void>)({ data: { data: () => mockDb.read(path), ref: mockDb.doc(path) } });

beforeEach(() => {
  mockDb.reset();
  jest.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('resolving a new review', () => {
  it('publishes it', async () => {
    mockDb.seed(FEE, { engagementStatus: 'completed' });
    seedReview();
    await fire();
    expect(mockDb.read(REVIEW)).toMatchObject({ published: true, rating: 5, body: 'great' });
    expect(mockDb.read(REVIEW)!.visibleAt).toBeDefined();
  });

  it('holds it when the professional disputed the work as "it did not happen"', async () => {
    mockDb.seed(FEE, { engagementStatus: 'disputed', adminReview: { reason: 'didnt_happen' } });
    seedReview();
    await fire();
    expect(mockDb.read(REVIEW)).toMatchObject({ published: false, heldForDispute: true, rating: 5 });
  });

  it('does not hold it for an amount dispute', async () => {
    mockDb.seed(FEE, { engagementStatus: 'disputed', adminReview: { reason: 'fee_disputed' } });
    seedReview();
    await fire();
    expect(mockDb.read(REVIEW)).toMatchObject({ published: true });
    expect(mockDb.read(REVIEW)).not.toHaveProperty('heldForDispute');
  });

  it('fails open: if the dispute check itself fails, the review is published', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    seedReview();
    const event = { data: { data: () => mockDb.read(REVIEW), ref: mockDb.doc(REVIEW) } }; // built BEFORE the failure is armed
    jest.spyOn(mockDb, 'doc').mockImplementationOnce(() => { throw new Error('read failed'); }); // the fee read
    await (onReviewCreate as unknown as (e: unknown) => Promise<void>)(event);
    expect(mockDb.read(REVIEW)).toMatchObject({ published: true });
  });
});

describe('a review deleted before the trigger writes', () => {
  it('is NOT recreated: no stub, no error', async () => {
    mockDb.seed(FEE, { engagementStatus: 'completed' });
    seedReview();
    const event = { data: { data: () => mockDb.read(REVIEW), ref: mockDb.doc(REVIEW) } };
    await mockDb.doc(REVIEW).delete(); // resolved "cancelled" / cleaned up before the trigger got to it
    await expect((onReviewCreate as unknown as (e: unknown) => Promise<void>)(event)).resolves.toBeUndefined();
    expect(mockDb.read(REVIEW)).toBeUndefined();
  });

  it('is NOT recreated on the hold path either', async () => {
    mockDb.seed(FEE, { engagementStatus: 'disputed', adminReview: { reason: 'didnt_happen' } });
    seedReview();
    const event = { data: { data: () => mockDb.read(REVIEW), ref: mockDb.doc(REVIEW) } };
    await mockDb.doc(REVIEW).delete();
    await (onReviewCreate as unknown as (e: unknown) => Promise<void>)(event);
    expect(mockDb.read(REVIEW)).toBeUndefined();
  });

  it('says so in the log (so a skipped write is findable)', async () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});
    mockDb.seed(FEE, { engagementStatus: 'completed' });
    const ref = mockDb.doc(REVIEW);
    await expect(updateIfExists(ref, { published: true })).resolves.toBe(false);
    expect(info).toHaveBeenCalledWith(expect.stringContaining('nothing recreated'));
  });
});

describe('updateIfExists', () => {
  it('returns true when it wrote', async () => {
    seedReview();
    await expect(updateIfExists(mockDb.doc(REVIEW), { published: true })).resolves.toBe(true);
    expect(mockDb.read(REVIEW)).toMatchObject({ published: true });
  });

  it('treats both the numeric and the string NOT_FOUND as "gone"', async () => {
    await expect(updateIfExists({ update: () => Promise.reject(Object.assign(new Error('x'), { code: 5 })) }, {})).resolves.toBe(false);
    await expect(updateIfExists({ update: () => Promise.reject(Object.assign(new Error('x'), { code: 'not-found' })) }, {})).resolves.toBe(false);
  });

  it('rethrows anything else: a real failure must not look like a deleted review', async () => {
    const boom = Object.assign(new Error('permission-denied'), { code: 7 });
    await expect(updateIfExists({ update: () => Promise.reject(boom) }, {})).rejects.toBe(boom);
  });
});
