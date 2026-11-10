import { renderHook, act } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { useReadReceipts } from '../useReadReceipts';
import { onSnapshot, setDoc } from 'firebase/firestore';

/**
 * The hook must (a) do NOTHING when disabled — admins and non-members get no listener,
 * no write, no permission error — and (b) never record a read after the user has left:
 * blur and background cancel the pending trailing write.
 */

let mockFocusCb: (() => void | (() => void)) | null = null;
let mockCleanup: void | (() => void);
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useFocusEffect: (cb: () => void | (() => void)) => {
      React.useEffect(() => {
        mockFocusCb = cb;
        mockCleanup = cb();
        return () => { if (typeof mockCleanup === 'function') mockCleanup(); };
      }, [cb]);
    },
  };
});
jest.mock('@core/firebase/config', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn((_db, ...p: string[]) => p.join('/')),
  doc: jest.fn((_db, ...p: string[]) => p.join('/')),
  serverTimestamp: jest.fn(() => 'SERVER_TS'),
  setDoc: jest.fn(() => Promise.resolve()),
  onSnapshot: jest.fn(() => () => {}),
}));

const mockSetDoc = setDoc as jest.Mock;
const mockOnSnapshot = onSnapshot as jest.Mock;

let appStateHandler: ((s: string) => void) | null = null;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  appStateHandler = null;
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_t: string, h: (s: string) => void) => {
    appStateHandler = h;
    return { remove: jest.fn() };
  }) as never);
  Object.defineProperty(AppState, 'currentState', { configurable: true, get: () => 'active' });
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const args = (over = {}) => ({ chatId: 'c1', enabled: true, currentUserId: 'me', latestMessageKey: 'm1', ...over });

it('disabled: no listener and no write at all (admin / non-member / wrong chat type)', () => {
  renderHook(() => useReadReceipts(args({ enabled: false })));
  act(() => { jest.advanceTimersByTime(10_000); });
  expect(mockOnSnapshot).not.toHaveBeenCalled();
  expect(mockSetDoc).not.toHaveBeenCalled();
});

it('enabled and focused: listens once and marks me read at once, at my own readState doc', () => {
  renderHook(() => useReadReceipts(args()));
  expect(mockOnSnapshot).toHaveBeenCalledTimes(1);
  expect(mockSetDoc).toHaveBeenCalledTimes(1);
  expect(mockSetDoc).toHaveBeenCalledWith('chats/c1/readState/me', { lastReadAt: 'SERVER_TS' });
});

it('folds the readState docs into uid → ms, skipping a not-yet-stamped one', () => {
  const { result } = renderHook(() => useReadReceipts(args()));
  const onNext = mockOnSnapshot.mock.calls[0][1];
  act(() => {
    onNext({
      docs: [
        { id: 'a', data: () => ({ lastReadAt: { toMillis: () => 111 } }) },
        { id: 'b', data: () => ({ lastReadAt: null }) },
      ],
    });
  });
  expect(result.current).toEqual({ a: 111 });
});

it('a burst of new messages is throttled into one trailing write', () => {
  const { rerender } = renderHook((p: ReturnType<typeof args>) => useReadReceipts(p), { initialProps: args() });
  expect(mockSetDoc).toHaveBeenCalledTimes(1);
  rerender(args({ latestMessageKey: 'm2' }));
  rerender(args({ latestMessageKey: 'm3' }));
  expect(mockSetDoc).toHaveBeenCalledTimes(1);
  act(() => { jest.advanceTimersByTime(3000); });
  expect(mockSetDoc).toHaveBeenCalledTimes(2);
});

it('backgrounding inside the throttle window cancels the trailing write', () => {
  const { rerender } = renderHook((p: ReturnType<typeof args>) => useReadReceipts(p), { initialProps: args() });
  rerender(args({ latestMessageKey: 'm2' })); // schedules the trailing write
  act(() => { appStateHandler?.('background'); });
  act(() => { jest.advanceTimersByTime(10_000); });
  expect(mockSetDoc).toHaveBeenCalledTimes(1); // only the one made while the user was there
});

it('blurring the screen inside the throttle window cancels the trailing write', () => {
  const { rerender } = renderHook((p: ReturnType<typeof args>) => useReadReceipts(p), { initialProps: args() });
  rerender(args({ latestMessageKey: 'm2' }));
  act(() => { if (typeof mockCleanup === 'function') mockCleanup(); }); // useFocusEffect cleanup = blur
  act(() => { jest.advanceTimersByTime(10_000); });
  expect(mockSetDoc).toHaveBeenCalledTimes(1);
});

it('unmounting cancels the trailing write', () => {
  const { rerender, unmount } = renderHook((p: ReturnType<typeof args>) => useReadReceipts(p), { initialProps: args() });
  rerender(args({ latestMessageKey: 'm2' }));
  unmount();
  act(() => { jest.advanceTimersByTime(10_000); });
  expect(mockSetDoc).toHaveBeenCalledTimes(1);
});

it('coming back to the foreground marks read again', () => {
  renderHook(() => useReadReceipts(args()));
  act(() => { appStateHandler?.('background'); });
  act(() => { jest.advanceTimersByTime(5000); });
  act(() => { appStateHandler?.('active'); });
  expect(mockSetDoc).toHaveBeenCalledTimes(2);
});
