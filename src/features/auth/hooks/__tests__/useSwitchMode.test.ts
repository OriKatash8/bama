import { renderHook, act } from '@testing-library/react-native';
import { useSwitchMode } from '../useSwitchMode';
import { useAuthStore } from '@core/stores/authStore';
import { getDocument } from '@core/firebase/firestore';
import { usePendingIntentStore } from '@core/stores/pendingIntentStore';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));
jest.mock('@core/firebase/firestore', () => ({ getDocument: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

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
  usePendingIntentStore.setState({ resume: null, afterProfile: null });
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

/**
 * switchMode is where every signed-out deep link resumes: all sign-in paths go
 * through mode-select, and mode-select ends in switchMode. A saved destination
 * wins over the mode's home, in either mode and whatever the profile state —
 * the invite preview lives outside the mode groups and does its own gating.
 */
describe('useSwitchMode — resuming a saved deep link', () => {
  const INVITE = '/c/K7MX9P';

  it.each(['client', 'professional'] as const)('in %s mode, lands on the saved link instead of home', async (mode) => {
    usePendingIntentStore.getState().saveResume(INVITE);
    await switchTo(mode);
    expect(useAuthStore.getState().activeMode).toBe(mode);
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith(INVITE);
  });

  it('resumes for an incomplete pro too, without the profile lookup deciding the route', async () => {
    mockGetDocument.mockResolvedValue({ proProfileCompleted: false });
    usePendingIntentStore.getState().saveResume(INVITE);
    await switchTo('professional');
    expect(mockReplace).toHaveBeenCalledWith(INVITE);
    expect(mockReplace).not.toHaveBeenCalledWith('/(professional)/(tabs)/profile');
  });

  it('uses the saved link once: the next switch goes home as usual', async () => {
    usePendingIntentStore.getState().saveResume(INVITE);
    await switchTo('client');
    mockReplace.mockClear();
    await switchTo('client');
    expect(mockReplace).toHaveBeenCalledWith('/(client)/(tabs)/home');
  });

  it('ignores a stored href that is not an allowed deep link and routes normally', async () => {
    usePendingIntentStore.setState({ resume: { href: '/admin', savedAt: Date.now() } });
    await switchTo('client');
    expect(mockReplace).toHaveBeenCalledWith('/(client)/(tabs)/home');
    expect(mockReplace).not.toHaveBeenCalledWith('/admin');
  });
});
