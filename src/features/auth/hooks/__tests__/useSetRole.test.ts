import { renderHook, act } from '@testing-library/react-native';
import { useSetRole } from '../useSetRole';
import { updateDocument } from '@core/firebase/firestore';
import { useAuthStore } from '@core/stores/authStore';
import { useUiStore } from '@core/stores/uiStore';

jest.mock('@core/firebase/firestore', () => ({
  updateDocument: jest.fn(),
}));

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

const mockUpdateDocument = updateDocument as jest.MockedFunction<typeof updateDocument>;

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({
    user: { id: 'u1', email: 'test@example.com', displayName: 'Test', photoURL: null, role: null, createdAt: { seconds: 0, nanoseconds: 0 } },
    role: null,
    isLoading: false,
  });
  useUiStore.setState({ isLoading: false, toasts: [], isNewProfessional: false });
});

describe('useSetRole', () => {
  it('calls updateDocument with correct path and role for client', async () => {
    mockUpdateDocument.mockResolvedValue(undefined);
    const { result } = renderHook(() => useSetRole());
    await act(async () => {
      await result.current.selectRole('client');
    });
    expect(mockUpdateDocument).toHaveBeenCalledWith('users/u1', { role: 'client' });
  });

  it('calls updateDocument with correct path and role for professional', async () => {
    mockUpdateDocument.mockResolvedValue(undefined);
    const { result } = renderHook(() => useSetRole());
    await act(async () => {
      await result.current.selectRole('professional');
    });
    expect(mockUpdateDocument).toHaveBeenCalledWith('users/u1', { role: 'professional' });
  });

  it('calls setRole on authStore after success', async () => {
    mockUpdateDocument.mockResolvedValue(undefined);
    const { result } = renderHook(() => useSetRole());
    await act(async () => {
      await result.current.selectRole('client');
    });
    expect(useAuthStore.getState().role).toBe('client');
  });

  it('redirects client to browse', async () => {
    mockUpdateDocument.mockResolvedValue(undefined);
    const { result } = renderHook(() => useSetRole());
    await act(async () => {
      await result.current.selectRole('client');
    });
    expect(mockReplace).toHaveBeenCalledWith('/(client)/(tabs)/browse/');
  });

  it('sets isNewProfessional and redirects professional to profile', async () => {
    mockUpdateDocument.mockResolvedValue(undefined);
    const { result } = renderHook(() => useSetRole());
    await act(async () => {
      await result.current.selectRole('professional');
    });
    expect(useUiStore.getState().isNewProfessional).toBe(true);
    expect(mockReplace).toHaveBeenCalledWith('/(professional)/(tabs)/profile/');
  });

  it('sets error and shows toast on Firestore failure', async () => {
    mockUpdateDocument.mockRejectedValue({ code: 'firestore/unavailable' });
    const { result } = renderHook(() => useSetRole());
    await act(async () => {
      await result.current.selectRole('client');
    });
    expect(result.current.error).toBe('Something went wrong. Please try again.');
    expect(useUiStore.getState().toasts[0]).toMatchObject({
      message: 'Something went wrong. Please try again.',
      type: 'error',
    });
  });

  it('sets isLoading to false after error', async () => {
    mockUpdateDocument.mockRejectedValue({ code: 'firestore/unavailable' });
    const { result } = renderHook(() => useSetRole());
    await act(async () => {
      await result.current.selectRole('client');
    });
    expect(result.current.isLoading).toBe(false);
  });

  it('sets error and does not call updateDocument when user is null', async () => {
    useAuthStore.setState({ user: null, role: null, isLoading: false });
    const { result } = renderHook(() => useSetRole());
    await act(async () => {
      await result.current.selectRole('client');
    });
    expect(mockUpdateDocument).not.toHaveBeenCalled();
    expect(result.current.error).toBe('No authenticated user. Please sign in again.');
  });
});
