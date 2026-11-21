import { heldReviewOf, flaggedRowsFor } from '../adminViews';

/**
 * adminListFlaggedProjects' rows: one per flagged ENGAGEMENT, each from that
 * professional's own fee doc — because nothing writes the project's adminReview.
 */

const ts = (ms: number) => ({ toMillis: () => ms }) as never;
const T = Date.UTC(2026, 9, 2, 12);
const project = { title: 'Wedding', status: 'open', clientId: 'c1', adminReviewPending: true };
const disputed = (over: Record<string, unknown>) => ({
  feeStatus: 'owed', feeRate: 0.03, minFeeApplied: 6, baseAmount: 1000, engagementStatus: 'disputed',
  adminReviewPending: true, ...over,
}) as never;

it('two pros disputing one project → two rows, each with its own pro, reason and date', () => {
  const rows = flaggedRowsFor('p1', project, [
    { id: 'pa', data: disputed({ status: 'not_owed', feeDue: 0, adminReview: { reason: 'didnt_happen', at: ts(T) },
      preDispute: { feeDue: 30, status: 'pending', baseAmount: 1000 } }) },
    { id: 'pb', data: disputed({ status: 'pending', feeDue: 60, baseAmount: 2000, adminReview: { reason: 'fee_disputed', at: ts(T - 3600_000), note: 'price changed' } }) },
    { id: 'pc', data: { engagementStatus: 'completed', feeStatus: 'owed' } as never }, // not flagged
  ]);
  expect(rows.map((r) => [r.proId, r.reason, r.flaggedAt, r.note])).toEqual([
    ['pa', 'didnt_happen', T, ''],
    ['pb', 'fee_disputed', T - 3600_000, 'price changed'],
  ]);
  expect(rows[0].disputes.map((d) => [d.proId, d.feeDueIfCompleted])).toEqual([['pa', 30]]);
  expect(rows[1].disputes.map((d) => [d.proId, d.feeDueIfCompleted])).toEqual([['pb', 60]]);
  expect(rows.every((r) => r.projectId === 'p1' && r.title === 'Wedding' && r.clientId === 'c1')).toBe(true);
});

it('the date falls back to disputedAt, and the note to the pro\'s disputeReason', () => {
  const [row] = flaggedRowsFor('p1', project, [
    { id: 'pa', data: disputed({ adminReview: { reason: 'fee_disputed' }, disputedAt: ts(T), disputeReason: 'בסוף המחיר היה שונה' }) },
  ]);
  expect(row.flaggedAt).toBe(T);
  expect(row.note).toBe('בסוף המחיר היה שונה');
});

it('a flag with no dispute behind it (a cancelled project) gets a row with no resolve card', () => {
  const [row] = flaggedRowsFor('p2', { ...project, status: 'cancelled' }, [
    { id: 'pa', data: { engagementStatus: 'cancelled', status: 'not_owed', adminReviewPending: true,
      adminReview: { reason: 'didnt_happen' }, disputedAt: ts(T) } as never },
  ]);
  expect(row).toMatchObject({ proId: 'pa', reason: 'didnt_happen', flaggedAt: T, disputes: [] });
});

it('a project flagged with no flagged engagement still shows one row from the project fields', () => {
  const rows = flaggedRowsFor('p3', { ...project, adminReview: { reason: 'completion_unanswered', proId: 'px', at: ts(T) } }, []);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ proId: 'px', reason: 'completion_unanswered', flaggedAt: T, disputes: [] });
});

describe('heldReviewOf — the review a "didn\'t happen" dispute is holding back', () => {
  const doc = (data: Record<string, unknown>) => ({ data: () => data });

  it('returns stars, text and author of the held review', () => {
    expect(heldReviewOf([doc({ heldForDispute: true, published: false, rating: 2, body: 'He never came', authorName: 'Cleo' })]))
      .toEqual({ rating: 2, text: 'He never came', authorName: 'Cleo' });
  });

  it('reads the text from `text` when `body` is absent, and tolerates a missing author', () => {
    expect(heldReviewOf([doc({ heldForDispute: true, rating: 4, text: 'ok' })]))
      .toEqual({ rating: 4, text: 'ok', authorName: '' });
  });

  it('is null when nothing is held: no review, a published one, or an amount dispute', () => {
    expect(heldReviewOf([])).toBeNull();
    expect(heldReviewOf([doc({ published: true, rating: 5, body: 'great' })])).toBeNull();
  });

  it('picks the held one among several', () => {
    expect(heldReviewOf([doc({ published: true, rating: 5 }), doc({ heldForDispute: true, rating: 1, body: 'x' })])?.rating).toBe(1);
  });
});
