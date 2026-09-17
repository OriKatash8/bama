import { renderHook, waitFor } from '@testing-library/react-native';

const mockDocs: Record<string, { exists: boolean; data?: Record<string, unknown>; fail?: boolean }> = {};
jest.mock('@core/firebase/config', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({
  doc: (_db: unknown, _col: string, id: string) => ({ id }),
  getDoc: async (ref: { id: string }) => {
    const d = mockDocs[ref.id];
    if (!d || d.fail) throw new Error('denied');
    return { exists: () => d.exists, data: () => d.data };
  },
}));

import { useUserBasics } from '../useUserBasics';

beforeEach(() => {
  for (const k of Object.keys(mockDocs)) delete mockDocs[k];
});

it('resolves a user with a name', async () => {
  mockDocs.a = { exists: true, data: { displayName: ' Avi ', photoURL: 'x' } };
  const { result } = renderHook(() => useUserBasics(['a']));
  expect('a' in result.current).toBe(false); // not loaded yet
  await waitFor(() => expect(result.current.a).toEqual({ displayName: 'Avi', photoURL: 'x' }));
});

it('a missing doc, a blank name and a failed read are all "no identity" (null), never a resolved blank', async () => {
  mockDocs.missing = { exists: false };
  mockDocs.blank = { exists: true, data: { displayName: '   ' } };
  mockDocs.broken = { exists: true, fail: true };
  const { result } = renderHook(() => useUserBasics(['missing', 'blank', 'broken']));
  await waitFor(() => expect(Object.keys(result.current)).toHaveLength(3));
  expect(result.current.missing).toBeNull();
  expect(result.current.blank).toBeNull();
  expect(result.current.broken).toBeNull();
});
