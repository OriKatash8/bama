import { renderHook, act } from '@testing-library/react-native';
import { useSwitchMode } from '../useSwitchMode';
import { useAuthStore } from '@core/stores/authStore';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: null, activeMode: null, isLoading: false });
});

describe('useSwitchMode', () => {
  it('sets activeMode to client and navigates to browse', () => {
    const { result } = renderHook(() => useSwitchMode());
    act(() => {
      result.current.switchMode('client');
    });
    expect(useAuthStore.getState().activeMode).toBe('client');
    expect(mockReplace).toHaveBeenCalledWith('/(client)/(tabs)/browse');
  });

  it('sets activeMode to professional and navigates to dashboard', () => {
    const { result } = renderHook(() => useSwitchMode());
    act(() => {
      result.current.switchMode('professional');
    });
    expect(useAuthStore.getState().activeMode).toBe('professional');
    expect(mockReplace).toHaveBeenCalledWith('/(professional)/(tabs)/dashboard');
  });
});
