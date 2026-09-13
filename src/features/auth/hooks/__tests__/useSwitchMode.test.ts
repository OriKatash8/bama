import { renderHook, act } from '@testing-library/react-native';
import { useSwitchMode } from '../useSwitchMode';
import { useAuthStore } from '@core/stores/authStore';
import { getDocument } from '@core/firebase/firestore';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));
jest.mock('@core/firebase/firestore', () => ({ getDocument: jest.fn() }));

const mockGetDocument = getDocument as jest.MockedFunction<typeof getDocument>;

const mockUser = {
  id: 'u1',
  email: 'u1@example.com',
  displayName: 'User One',
  photoURL: null,
  createdAt: { seconds: 0, nanoseconds: 0 },
};

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: mockUser, activeMode: null, isLoading: false });
});

async function switchTo(mode: 'client' | 'professional') {
  const { result } = renderHook(() => useSwitchMode());
  await act(async () => {
    await result.current.switchMode(mode);
  });
}

describe('useSwitchMode', () => {
  it('sets activeMode to client and lands on client home without reading the profile', async () => {
    await switchTo('client');
    expect(useAuthStore.getState().activeMode).toBe('client');
    expect(mockReplace).toHaveBeenCalledWith('/(client)/(tabs)/home');
    expect(mockGetDocument).not.toHaveBeenCalled();
  });

  it('sends a professional with a completed profile to the dashboard', async () => {
    mockGetDocument.mockResolvedValue({ proProfileCompleted: true });
    await switchTo('professional');
    expect(useAuthStore.getState().activeMode).toBe('professional');
    expect(mockGetDocument).toHaveBeenCalledWith('users/u1/profile/data');
    expect(mockReplace).toHaveBeenCalledWith('/(professional)/(tabs)/dashboard');
  });

  // A profile document existing is not the same as it being complete — the pro is
  // locked to the profile screen until they finish it.
  it.each([
    ['proProfileCompleted: false', { proProfileCompleted: false }],
    ['proProfileCompleted missing', {}],
  ])('sends a professional with an incomplete profile (%s) to the profile screen', async (_, profile) => {
    mockGetDocument.mockResolvedValue(profile);
    await switchTo('professional');
    expect(mockReplace).toHaveBeenCalledWith('/(professional)/(tabs)/profile');
  });

  it('sends a professional with no profile document to the profile screen', async () => {
    mockGetDocument.mockResolvedValue(null);
    await switchTo('professional');
    expect(mockReplace).toHaveBeenCalledWith('/(professional)/(tabs)/profile');
  });

  it('sends a professional with no signed-in user to the profile screen without reading Firestore', async () => {
    useAuthStore.setState({ user: null });
    await switchTo('professional');
    expect(mockGetDocument).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/(professional)/(tabs)/profile');
  });
});
