import { setDoc, updateDoc } from 'firebase/firestore';
import { reviewDocId, submitReviews } from '../submitReviews';

/**
 * One refused review must not block the others, nor the "reviewed" flag — the
 * old Promise.all did both, and ReviewFlowGate then re-prompted on every launch.
 */
jest.mock('@core/firebase/config', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => path.join('/'),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  serverTimestamp: () => 'ts',
}));
const mockSetDoc = setDoc as jest.Mock;
const mockUpdateDoc = updateDoc as jest.Mock;
const base = { projectId: 'p1', clientId: 'c1', clientDisplayName: 'Client' };
const reviews = [
  { professionalId: 'a', rating: 5, text: 'Great work, thank you' },
  { professionalId: 'b', rating: 4, text: 'Good job on the edit' },
];

beforeEach(() => { jest.clearAllMocks(); jest.spyOn(console, 'error').mockImplementation(() => {}); });

it('writes each review under a deterministic id, one per (project, professional)', async () => {
  mockSetDoc.mockResolvedValue(undefined);
  mockUpdateDoc.mockResolvedValue(undefined);
  await submitReviews({ ...base, reviews });
  expect(reviewDocId('p1', 'a')).toBe('p1_a');
  expect(mockSetDoc.mock.calls.map((c) => c[0])).toEqual(['reviews/p1_a', 'reviews/p1_b']);
  expect(mockSetDoc.mock.calls[0][1]).toMatchObject({ projectId: 'p1', professionalId: 'a', reviewerId: 'c1', authorId: 'c1', rating: 5, text: 'Great work, thank you', body: 'Great work, thank you' });
});

it('a refused review leaves the others written and still marks the project reviewed', async () => {
  mockSetDoc.mockImplementation((path: string) =>
    path === 'reviews/p1_a' ? Promise.reject(Object.assign(new Error('denied'), { code: 'permission-denied' })) : Promise.resolve());
  mockUpdateDoc.mockResolvedValue(undefined);
  const res = await submitReviews({ ...base, reviews });
  expect(res).toEqual({ written: ['b'], failed: ['a'] });
  expect(mockUpdateDoc).toHaveBeenCalledWith('projects/p1', { reviewsCompleted: true, reviewsPending: [] });
});

it('even when every review is refused, the project is marked reviewed (no endless re-prompt)', async () => {
  mockSetDoc.mockRejectedValue(Object.assign(new Error('denied'), { code: 'permission-denied' }));
  mockUpdateDoc.mockResolvedValue(undefined);
  const res = await submitReviews({ ...base, reviews });
  expect(res.failed).toEqual(['a', 'b']);
  expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
});

it('a failed "reviewed" write does not throw into the UI', async () => {
  mockSetDoc.mockResolvedValue(undefined);
  mockUpdateDoc.mockRejectedValue(new Error('offline'));
  await expect(submitReviews({ ...base, reviews })).resolves.toEqual({ written: ['a', 'b'], failed: [] });
});
