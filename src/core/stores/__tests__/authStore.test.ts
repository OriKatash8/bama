import { useAuthStore } from '../authStore';

beforeEach(() => {
  useAuthStore.setState({ user: null, activeMode: null, isLoading: true });
});

const mockUser = {
  id: 'u1',
  email: 'test@example.com',
  displayName: 'Test User',
  photoURL: null,
  createdAt: { seconds: 0, nanoseconds: 0 },
};

describe('authStore', () => {
  it('has correct initial state', () => {
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.activeMode).toBeNull();
    expect(state.isLoading).toBe(true);
  });

  it('setUser updates user', () => {
    useAuthStore.getState().setUser(mockUser);
    expect(useAuthStore.getState().user).toEqual(mockUser);
  });

  it('setActiveMode updates activeMode', () => {
    useAuthStore.getState().setActiveMode('professional');
    expect(useAuthStore.getState().activeMode).toBe('professional');
  });

  it('setLoading updates isLoading', () => {
    useAuthStore.getState().setLoading(false);
    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it('clear resets all state', () => {
    useAuthStore.getState().setUser(mockUser);
    useAuthStore.getState().setActiveMode('client');
    useAuthStore.getState().clear();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().activeMode).toBeNull();
    expect(useAuthStore.getState().isLoading).toBe(false);
  });
});
