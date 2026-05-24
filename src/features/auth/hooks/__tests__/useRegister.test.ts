import { renderHook, act } from '@testing-library/react-native';
import { useRegister } from '../useRegister';
import { signUp } from '@core/firebase/auth';
import { setDocument } from '@core/firebase/firestore';
import { useAuthStore } from '@core/stores/authStore';
import { useUiStore } from '@core/stores/uiStore';

jest.mock('@core/firebase/auth', () => ({
  signUp: jest.fn(),
}));

jest.mock('@core/firebase/firestore', () => ({
  setDocument: jest.fn(),
}));

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

const mockSignUp = signUp as jest.MockedFunction<typeof signUp>;
const mockSetDocument = setDocument as jest.MockedFunction<typeof setDocument>;

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: null, role: null, isLoading: false });
  useUiStore.setState({ isLoading: false, toasts: [], isNewProfessional: false });
});

describe('useRegister', () => {
  it('calls signUp then setDocument with correct user doc', async () => {
    mockSignUp.mockResolvedValue({ uid: 'u1' } as any);
    mockSetDocument.mockResolvedValue(undefined);
    const { result } = renderHook(() => useRegister());
    await act(async () => {
      await result.current.register('John Doe', 'john@example.com', 'password123', 'client');
    });
    expect(mockSignUp).toHaveBeenCalledWith('john@example.com', 'password123');
    expect(mockSetDocument).toHaveBeenCalledWith(
      'users/u1',
      expect.objectContaining({
        id: 'u1',
        email: 'john@example.com',
        displayName: 'John Doe',
        role: 'client',
        photoURL: null,
      })
    );
  });

  it('updates authStore user and role on success', async () => {
    mockSignUp.mockResolvedValue({ uid: 'u1' } as any);
    mockSetDocument.mockResolvedValue(undefined);
    const { result } = renderHook(() => useRegister());
    await act(async () => {
      await result.current.register('John Doe', 'john@example.com', 'password123', 'client');
    });
    expect(useAuthStore.getState().user?.id).toBe('u1');
    expect(useAuthStore.getState().role).toBe('client');
  });

  it('redirects client to browse', async () => {
    mockSignUp.mockResolvedValue({ uid: 'u1' } as any);
    mockSetDocument.mockResolvedValue(undefined);
    const { result } = renderHook(() => useRegister());
    await act(async () => {
      await result.current.register('Jane', 'jane@example.com', 'password123', 'client');
    });
    expect(mockReplace).toHaveBeenCalledWith('/(client)/(tabs)/browse/');
  });

  it('sets isNewProfessional and redirects professional to profile', async () => {
    mockSignUp.mockResolvedValue({ uid: 'u1' } as any);
    mockSetDocument.mockResolvedValue(undefined);
    const { result } = renderHook(() => useRegister());
    await act(async () => {
      await result.current.register('Pro User', 'pro@example.com', 'password123', 'professional');
    });
    expect(useUiStore.getState().isNewProfessional).toBe(true);
    expect(mockReplace).toHaveBeenCalledWith('/(professional)/(tabs)/profile/');
  });

  it('sets error on email-already-in-use', async () => {
    mockSignUp.mockRejectedValue({ code: 'auth/email-already-in-use' });
    const { result } = renderHook(() => useRegister());
    await act(async () => {
      await result.current.register('John', 'john@example.com', 'password123', 'client');
    });
    expect(result.current.error).toBe('An account with this email already exists.');
  });

  it('sets isLoading to false after error', async () => {
    mockSignUp.mockRejectedValue({ code: 'auth/email-already-in-use' });
    const { result } = renderHook(() => useRegister());
    await act(async () => {
      await result.current.register('John', 'john@example.com', 'password123', 'client');
    });
    expect(result.current.isLoading).toBe(false);
  });
});
