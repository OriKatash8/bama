import { renderHook, act } from '@testing-library/react-native';
import { useLogin } from '../useLogin';
import { signIn } from '@core/firebase/auth';
import { useUiStore } from '@core/stores/uiStore';

jest.mock('@core/firebase/auth', () => ({
  signIn: jest.fn(),
}));

jest.mock('@core/i18n', () => ({
  __esModule: true,
  default: {
    t: (key: string) => {
      const map: Record<string, string> = {
        'auth.err_invalid_credentials': 'Invalid email or password.',
        'auth.err_too_many': 'Too many attempts. Try again later.',
        'auth.err_generic': 'Something went wrong. Please try again.',
      };
      return map[key] ?? key;
    },
  },
}));

const mockSignIn = signIn as jest.MockedFunction<typeof signIn>;

beforeEach(() => {
  jest.clearAllMocks();
  useUiStore.setState({ isLoading: false, toasts: [], isNewProfessional: false });
});

describe('useLogin', () => {
  it('calls signIn with email and password', async () => {
    mockSignIn.mockResolvedValue({ uid: 'u1' } as any);
    const { result } = renderHook(() => useLogin());
    await act(async () => {
      await result.current.login('test@example.com', 'password123');
    });
    expect(mockSignIn).toHaveBeenCalledWith('test@example.com', 'password123');
  });

  it('sets isLoading to false after success', async () => {
    mockSignIn.mockResolvedValue({ uid: 'u1' } as any);
    const { result } = renderHook(() => useLogin());
    await act(async () => {
      await result.current.login('test@example.com', 'password123');
    });
    expect(result.current.isLoading).toBe(false);
  });

  it('sets error on invalid-credential', async () => {
    mockSignIn.mockRejectedValue({ code: 'auth/invalid-credential' });
    const { result } = renderHook(() => useLogin());
    await act(async () => {
      await result.current.login('test@example.com', 'wrong');
    });
    expect(result.current.error).toBe('Invalid email or password.');
  });

  it('sets error on too-many-requests', async () => {
    mockSignIn.mockRejectedValue({ code: 'auth/too-many-requests' });
    const { result } = renderHook(() => useLogin());
    await act(async () => {
      await result.current.login('test@example.com', 'wrong');
    });
    expect(result.current.error).toBe('Too many attempts. Try again later.');
  });

  it('shows an error toast on failure', async () => {
    mockSignIn.mockRejectedValue({ code: 'auth/invalid-credential' });
    const { result } = renderHook(() => useLogin());
    await act(async () => {
      await result.current.login('test@example.com', 'wrong');
    });
    const toasts = useUiStore.getState().toasts;
    expect(toasts[0].message).toBe('Invalid email or password.');
    expect(toasts[0].type).toBe('error');
  });
});
