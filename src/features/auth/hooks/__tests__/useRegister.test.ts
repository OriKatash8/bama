import { renderHook, act } from '@testing-library/react-native';
import { useRegister } from '../useRegister';
import { signUp } from '@core/firebase/auth';
import { setDocument } from '@core/firebase/firestore';
import { useAuthStore } from '@core/stores/authStore';
import { useUiStore } from '@core/stores/uiStore';

jest.mock('@core/firebase/auth', () => ({
  signUp: jest.fn(),
}));

jest.mock('@core/i18n', () => ({
  __esModule: true,
  default: {
    t: (key: string) => {
      const map: Record<string, string> = {
        'auth.err_email_exists': 'An account with this email already exists.',
        'auth.err_email_invalid': 'Invalid email address.',
        'auth.err_generic': 'Something went wrong. Please try again.',
      };
      return map[key] ?? key;
    },
  },
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
  useAuthStore.setState({ user: null, activeMode: null, isLoading: false });
  useUiStore.setState({ isLoading: false, toasts: [], isNewProfessional: false });
});

describe('useRegister', () => {
  it('calls signUp then setDocument with correct user doc', async () => {
    mockSignUp.mockResolvedValue({ uid: 'u1' } as any);
    mockSetDocument.mockResolvedValue(undefined);
    const { result } = renderHook(() => useRegister());
    await act(async () => {
      await result.current.register('John Doe', 'john@example.com', 'password123');
    });
    expect(mockSignUp).toHaveBeenCalledWith('john@example.com', 'password123');
    expect(mockSetDocument).toHaveBeenCalledWith(
      'users/u1',
      expect.objectContaining({
        id: 'u1',
        email: 'john@example.com',
        displayName: 'John Doe',
        photoURL: null,
      })
    );
  });

  it('updates authStore user on success', async () => {
    mockSignUp.mockResolvedValue({ uid: 'u1' } as any);
    mockSetDocument.mockResolvedValue(undefined);
    const { result } = renderHook(() => useRegister());
    await act(async () => {
      await result.current.register('John Doe', 'john@example.com', 'password123');
    });
    expect(useAuthStore.getState().user?.id).toBe('u1');
    expect(useAuthStore.getState().activeMode).toBeNull();
  });

  it('navigates to mode-select after registration', async () => {
    mockSignUp.mockResolvedValue({ uid: 'u1' } as any);
    mockSetDocument.mockResolvedValue(undefined);
    const { result } = renderHook(() => useRegister());
    await act(async () => {
      await result.current.register('Jane', 'jane@example.com', 'password123');
    });
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/mode-select');
  });

  it('sets error on email-already-in-use', async () => {
    mockSignUp.mockRejectedValue({ code: 'auth/email-already-in-use' });
    const { result } = renderHook(() => useRegister());
    await act(async () => {
      await result.current.register('John', 'john@example.com', 'password123');
    });
    expect(result.current.error).toBe('An account with this email already exists.');
  });

  it('sets isLoading to false after error', async () => {
    mockSignUp.mockRejectedValue({ code: 'auth/email-already-in-use' });
    const { result } = renderHook(() => useRegister());
    await act(async () => {
      await result.current.register('John', 'john@example.com', 'password123');
    });
    expect(result.current.isLoading).toBe(false);
  });
});
