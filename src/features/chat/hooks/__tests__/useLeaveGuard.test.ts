import { renderHook, act } from '@testing-library/react-native';

let mockActive: boolean | null = null;
let mockCallback: ((o: { data: { action: unknown } }) => void) | null = null;
const mockDispatch = jest.fn();
jest.mock('expo-router/react-navigation', () => ({
  usePreventRemove: (active: boolean, cb: typeof mockCallback) => { mockActive = active; mockCallback = cb; },
}));
jest.mock('expo-router', () => ({ useNavigation: () => ({ dispatch: mockDispatch }) }));
const mockConfirm = jest.fn();
jest.mock('@utils/confirmDialog', () => ({ confirmDialog: (...a: unknown[]) => mockConfirm(...a) }));

import { useLeaveGuard } from '../useLeaveGuard';

const LABELS = { title: 'T', message: 'M', leave: 'Leave', stay: 'Stay' };
const ACTION = { type: 'GO_BACK' };

beforeEach(() => { jest.clearAllMocks(); mockActive = null; mockCallback = null; });

const tryLeave = () => act(async () => { mockCallback!({ data: { action: ACTION } }); await Promise.resolve(); await Promise.resolve(); });

it('is switched off when nothing is sending, so leaving needs no dialog', () => {
  renderHook(() => useLeaveGuard(false, LABELS, jest.fn()));
  expect(mockActive).toBe(false);
});

it('is on while sending, and asks with the Leave / Stay labels', async () => {
  mockConfirm.mockResolvedValue(false);
  renderHook(() => useLeaveGuard(true, LABELS, jest.fn()));
  expect(mockActive).toBe(true);
  await tryLeave();
  expect(mockConfirm).toHaveBeenCalledWith('T', 'M', { confirm: 'Leave', cancel: 'Stay', destructive: true });
});

it('Leave cancels the send and lets the navigation through', async () => {
  mockConfirm.mockResolvedValue(true);
  const onLeave = jest.fn();
  renderHook(() => useLeaveGuard(true, LABELS, onLeave));
  await tryLeave();
  expect(onLeave).toHaveBeenCalledTimes(1);
  expect(mockDispatch).toHaveBeenCalledWith(ACTION);
});

it('Stay does nothing: the send continues and the screen stays', async () => {
  mockConfirm.mockResolvedValue(false);
  const onLeave = jest.fn();
  renderHook(() => useLeaveGuard(true, LABELS, onLeave));
  await tryLeave();
  expect(onLeave).not.toHaveBeenCalled();
  expect(mockDispatch).not.toHaveBeenCalled();
});
