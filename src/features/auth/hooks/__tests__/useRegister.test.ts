import { renderHook, act } from '@testing-library/react-native';
import { useRegister } from '../useRegister';
import { signUp } from '@core/firebase/auth';
import { setDocument } from '@core/firebase/firestore';
import { useAuthStore } from '@core/stores/authStore';
import { useUiStore } from '@core/stores/uiStore';

const mockSendVerification = jest.fn();
jest.mock('@core/firebase/auth', () => ({
  signUp: jest.fn(),
  sendVerificationEmail: (...a: unknown[]) => mockSendVerification(...a),
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

const mockSavePhone = jest.fn();
jest.mock('@features/auth/services/phoneService', () => ({
  savePhone: (...a: unknown[]) => mockSavePhone(...a),
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
      await result.current.register('John Doe', 'john@example.com', 'password123', { acceptedAt: 0, version: '1.0', ageConfirmedAt: 0 }, '+972501234567');
    });
    expect(mockSignUp).toHaveBeenCalledWith('john@example.com', 'password123');
    expect(mockSetDocument).toHaveBeenCalledWith(
      'users/u1',
      expect.objectContaining({
        id: 'u1',
        displayName: 'John Doe',
        photoURL: null,
      }),
    );
    // NO `email` ON THE USER DOCUMENT. users/{uid} is readable by every signed-in
    // user, so an email here would make every address on the platform
    // enumerable. Auth is the authoritative store; the admin screen reads it
    // through the adminFindUser callable. Asserted as an absence because that is
    // the security property — objectContaining above would not catch a
    // regression that re-added it.
    expect(mockSetDocument.mock.calls[0][1]).not.toHaveProperty('email');
  });

  it('updates authStore user on success', async () => {
    mockSignUp.mockResolvedValue({ uid: 'u1' } as any);
    mockSetDocument.mockResolvedValue(undefined);
    const { result } = renderHook(() => useRegister());
    await act(async () => {
      await result.current.register('John Doe', 'john@example.com', 'password123', { acceptedAt: 0, version: '1.0', ageConfirmedAt: 0 }, '+972501234567');
    });
    expect(useAuthStore.getState().user?.id).toBe('u1');
    expect(useAuthStore.getState().activeMode).toBeNull();
  });

  it('goes to the verify-email screen after registration (then / routes on to mode-select)', async () => {
    mockSignUp.mockResolvedValue({ uid: 'u1' } as any);
    mockSetDocument.mockResolvedValue(undefined);
    const { result } = renderHook(() => useRegister());
    await act(async () => {
      await result.current.register('Jane', 'jane@example.com', 'password123', { acceptedAt: 0, version: '1.0', ageConfirmedAt: 0 }, '+972501234567');
    });
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/verify-email');
  });

  it('sets error on email-already-in-use', async () => {
    mockSignUp.mockRejectedValue({ code: 'auth/email-already-in-use' });
    const { result } = renderHook(() => useRegister());
    await act(async () => {
      await result.current.register('John', 'john@example.com', 'password123', { acceptedAt: 0, version: '1.0', ageConfirmedAt: 0 }, '+972501234567');
    });
    expect(result.current.error).toBe('An account with this email already exists.');
  });

  it('sets isLoading to false after error', async () => {
    mockSignUp.mockRejectedValue({ code: 'auth/email-already-in-use' });
    const { result } = renderHook(() => useRegister());
    await act(async () => {
      await result.current.register('John', 'john@example.com', 'password123', { acceptedAt: 0, version: '1.0', ageConfirmedAt: 0 }, '+972501234567');
    });
    expect(result.current.isLoading).toBe(false);
  });

  it('saves the phone number privately, never on the public user doc', async () => {
    mockSignUp.mockResolvedValue({ uid: 'u1' } as any);
    mockSetDocument.mockResolvedValue(undefined);
    mockSavePhone.mockResolvedValue(undefined);
    const { result } = renderHook(() => useRegister());
    await act(async () => {
      await result.current.register('John Doe', 'john@example.com', 'password123', { acceptedAt: 0, version: '1.0', ageConfirmedAt: 0 }, '+972501234567');
    });
    expect(mockSavePhone).toHaveBeenCalledWith('u1', '+972501234567');
    // users/{uid} is readable by every signed-in user.
    expect(mockSetDocument.mock.calls[0][1]).not.toHaveProperty('phone');
  });

  it('sends the verification email right after sign-up', async () => {
    const fbUser = { uid: 'u1' };
    mockSignUp.mockResolvedValue(fbUser as any);
    mockSetDocument.mockResolvedValue(undefined);
    mockSavePhone.mockResolvedValue(undefined);
    mockSendVerification.mockResolvedValue(undefined);
    const { result } = renderHook(() => useRegister());
    await act(async () => {
      await result.current.register('John Doe', 'john@example.com', 'password123', { acceptedAt: 0, version: '1.0', ageConfirmedAt: 0 }, '+972501234567');
    });
    expect(mockSendVerification).toHaveBeenCalledWith(fbUser);
  });

  it('a failed send never fails sign-up — the verify screen can resend', async () => {
    mockSignUp.mockResolvedValue({ uid: 'u1' } as any);
    mockSetDocument.mockResolvedValue(undefined);
    mockSavePhone.mockResolvedValue(undefined);
    mockSendVerification.mockRejectedValue(Object.assign(new Error('x'), { code: 'auth/too-many-requests' }));
    const { result } = renderHook(() => useRegister());
    await act(async () => {
      await result.current.register('John Doe', 'john@example.com', 'password123', { acceptedAt: 0, version: '1.0', ageConfirmedAt: 0 }, '+972501234567');
    });
    expect(result.current.error).toBeNull();
    expect(mockSetDocument).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalled();
  });
});
