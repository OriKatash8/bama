import { act, renderHook, waitFor } from '@testing-library/react-native';

const mockCall = jest.fn();
jest.mock('@core/firebase/functions', () => ({ callFunction: (name: string) => (data: unknown) => mockCall(name, data) }));

import { useLargeEngagements } from '../useLargeEngagements';

beforeEach(() => mockCall.mockReset());

it('reads the admin callable and keeps its rows and threshold', async () => {
  mockCall.mockResolvedValue({ rows: [{ projectId: 'p1' }], above: 5000 });
  const { result } = renderHook(() => useLargeEngagements());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(mockCall).toHaveBeenCalledWith('adminListLargeEngagements', {});
  expect(result.current.rows).toEqual([{ projectId: 'p1' }]);
  expect(result.current.failed).toBe(false);
});

it('reports a failure, and a retry loads again', async () => {
  mockCall.mockRejectedValueOnce(new Error('denied'));
  const { result } = renderHook(() => useLargeEngagements());
  await waitFor(() => expect(result.current.failed).toBe(true));
  mockCall.mockResolvedValue({ rows: [], above: 5000 });
  await act(async () => { await result.current.reload(); });
  expect(result.current.failed).toBe(false);
});

it('markPaid records the fee as paid with the Fees page action, then reloads', async () => {
  mockCall.mockResolvedValue({ rows: [], above: 5000 });
  const { result } = renderHook(() => useLargeEngagements());
  await waitFor(() => expect(result.current.loading).toBe(false));
  mockCall.mockClear();
  await act(async () => { await result.current.markPaid({ projectId: 'p1', professionalId: 'pro1' }); });
  expect(mockCall).toHaveBeenNthCalledWith(1, 'markFeePaid', { projectId: 'p1', professionalId: 'pro1' });
  expect(mockCall).toHaveBeenNthCalledWith(2, 'adminListLargeEngagements', {});
});
