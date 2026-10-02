import { act, renderHook } from '@testing-library/react-native';

/** The cancellation log leaves out what the admin removed, and removing only writes a mark. */

const subs: Record<string, (d: unknown[]) => void> = {};
const mockSet = jest.fn(() => Promise.resolve());
jest.mock('@core/firebase/firestore', () => ({
  subscribeToCollection: (path: string, cb: (d: unknown[]) => void) => { subs[path] = cb; return () => {}; },
  getDocument: jest.fn(() => Promise.resolve({ displayName: 'Avi' })),
  setDocument: (...a: unknown[]) => mockSet(...(a as [])),
}));
jest.mock('firebase/firestore', () => ({ where: jest.fn(), serverTimestamp: () => 'TS' }));

import { useCancellationLog } from '../useCancellationLog';

it('hides the entries marked removed, and removing writes only that mark', async () => {
  const { result } = renderHook(() => useCancellationLog());
  await act(async () => {
    subs.projects([{ id: 'a', title: 'Kitchen', clientId: 'u1', cancelledAt: { seconds: 2 } }, { id: 'b', title: 'Bath', clientId: 'u1', cancelledAt: { seconds: 1 } }]);
    subs.cancellations([{ id: 'x', type: 'purchase', productName: 'Lens', createdAt: { seconds: 3 } }]);
    subs.cancellationLogHidden([]);
  });
  expect(result.current.entries.map((e) => e.id)).toEqual(['pur-x', 'proj-a', 'proj-b']);

  await act(async () => { subs.cancellationLogHidden([{ id: 'proj-a' }, { id: 'pur-x' }]); });
  expect(result.current.entries.map((e) => e.id)).toEqual(['proj-b']);

  await act(async () => { await result.current.hide('proj-b'); });
  expect(mockSet).toHaveBeenCalledWith('cancellationLogHidden/proj-b', { hiddenAt: 'TS' });
});
