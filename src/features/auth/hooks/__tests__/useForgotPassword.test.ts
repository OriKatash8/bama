import { renderHook, act } from '@testing-library/react-native';
import { useForgotPassword } from '../useForgotPassword';
import { sendPasswordResetEmail } from '@core/firebase/auth';
import { useUiStore } from '@core/stores/uiStore';

jest.mock('@core/firebase/auth', () => ({
  sendPasswordResetEmail: jest.fn(),
}));

const mockSend = sendPasswordResetEmail as jest.MockedFunction<typeof sendPasswordResetEmail>;

beforeEach(() => {
  jest.clearAllMocks();
  useUiStore.setState({ isLoading: false, toasts: [], isNewProfessional: false });
});

describe('useForgotPassword', () => {
  it('calls sendPasswordResetEmail with the email', async () => {
    mockSend.mockResolvedValue(undefined);
    const { result } = renderHook(() => useForgotPassword());
    await act(async () => {
      await result.current.sendReset('test@example.com');
    });
    expect(mockSend).toHaveBeenCalledWith('test@example.com');
  });

  it('sets sent to true on success', async () => {
    mockSend.mockResolvedValue(undefined);
    const { result } = renderHook(() => useForgotPassword());
    await act(async () => {
      await result.current.sendReset('test@example.com');
    });
    expect(result.current.sent).toBe(true);
  });

  it('sets isLoading to false after success', async () => {
    mockSend.mockResolvedValue(undefined);
    const { result } = renderHook(() => useForgotPassword());
    await act(async () => {
      await result.current.sendReset('test@example.com');
    });
    expect(result.current.isLoading).toBe(false);
  });

  it('sets error on user-not-found', async () => {
    mockSend.mockRejectedValue({ code: 'auth/user-not-found' });
    const { result } = renderHook(() => useForgotPassword());
    await act(async () => {
      await result.current.sendReset('notfound@example.com');
    });
    expect(result.current.error).toBe('No account found with this email.');
  });

  it('shows error toast on failure', async () => {
    mockSend.mockRejectedValue({ code: 'auth/user-not-found' });
    const { result } = renderHook(() => useForgotPassword());
    await act(async () => {
      await result.current.sendReset('notfound@example.com');
    });
    expect(useUiStore.getState().toasts[0].type).toBe('error');
  });
});
