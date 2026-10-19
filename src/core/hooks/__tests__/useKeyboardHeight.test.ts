import { Keyboard, Platform } from 'react-native';
import { renderHook, act } from '@testing-library/react-native';
import { useKeyboardHeight } from '../useKeyboardHeight';

type Handler = (e: { endCoordinates: { height: number; screenY: number } }) => void;

function setup(os: 'ios' | 'android') {
  (Platform as { OS: string }).OS = os;
  const handlers: Record<string, Handler> = {};
  const remove = jest.fn();
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, h: Handler) => {
    handlers[name] = h;
    return { remove };
  }) as never);
  return { handlers, remove };
}

afterEach(() => jest.restoreAllMocks());

it('iOS: follows keyboardWillChangeFrame and resets on hide', () => {
  const { handlers } = setup('ios');
  const { result } = renderHook(() => useKeyboardHeight());
  expect(result.current).toBe(0);
  act(() => handlers.keyboardWillChangeFrame({ endCoordinates: { height: 291, screenY: 500 } }));
  expect(result.current).toBe(291);
  act(() => handlers.keyboardWillHide({ endCoordinates: { height: 0, screenY: 800 } }));
  expect(result.current).toBe(0);
});

it('Android: follows keyboardDidShow / keyboardDidHide', () => {
  const { handlers } = setup('android');
  const { result } = renderHook(() => useKeyboardHeight());
  act(() => handlers.keyboardDidShow({ endCoordinates: { height: 320, screenY: 480 } }));
  expect(result.current).toBe(320);
  act(() => handlers.keyboardDidHide({ endCoordinates: { height: 0, screenY: 800 } }));
  expect(result.current).toBe(0);
});

it('removes its listeners on unmount', () => {
  const { remove } = setup('ios');
  renderHook(() => useKeyboardHeight()).unmount();
  expect(remove).toHaveBeenCalledTimes(2);
});
