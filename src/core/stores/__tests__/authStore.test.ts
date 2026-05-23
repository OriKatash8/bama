import { useAuthStore } from '../authStore';

beforeEach(() => {
  useAuthStore.setState({ user: null, role: null, isLoading: true });
});

const mockUser = {
  id: 'u1',
  email: 'test@example.com',
  displayName: 'Test User',
  photoURL: null,
  role: 'client' as const,
  createdAt: { seconds: 0, nanoseconds: 0 },
};

describe('authStore', () => {
  it('has correct initial state', () => {
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.role).toBeNull();
    expect(state.isLoading).toBe(true);
  });

  it('setUser updates user', () => {
    useAuthStore.getState().setUser(mockUser);
    expect(useAuthStore.getState().user).toEqual(mockUser);
  });

  it('setRole updates role', () => {
    useAuthStore.getState().setRole('professional');
    expect(useAuthStore.getState().role).toBe('professional');
  });

  it('setLoading updates isLoading', () => {
    useAuthStore.getState().setLoading(false);
    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it('clear resets all state', () => {
    useAuthStore.getState().setUser(mockUser);
    useAuthStore.getState().setRole('client');
    useAuthStore.getState().clear();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().role).toBeNull();
    expect(useAuthStore.getState().isLoading).toBe(false);
  });
});
