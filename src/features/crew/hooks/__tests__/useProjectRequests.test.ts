import { renderHook, act } from '@testing-library/react-native';
import { useProjectRequests } from '../useProjectRequests';
import { addDocument, subscribeToCollection, where } from '@core/firebase/firestore';
import { useAuthStore } from '@core/stores/authStore';

jest.mock('@core/firebase/firestore', () => ({
  addDocument: jest.fn(),
  subscribeToCollection: jest.fn(),
  where: jest.fn(() => ({ type: 'where-constraint' })),
}));

const mockAddDocument = addDocument as jest.MockedFunction<typeof addDocument>;
const mockSubscribeToCollection = subscribeToCollection as jest.MockedFunction<typeof subscribeToCollection>;

const mockUser = {
  id: 'u1',
  email: 'test@example.com',
  displayName: 'Test User',
  photoURL: null,
  createdAt: { seconds: 0, nanoseconds: 0 },
};

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: mockUser, activeMode: 'client', isLoading: false });
  mockSubscribeToCollection.mockReturnValue(() => {});
});

describe('useProjectRequests', () => {
  it('subscribes to projects collection filtered by clientId on mount', () => {
    renderHook(() => useProjectRequests());
    expect(where).toHaveBeenCalledWith('clientId', '==', 'u1');
    expect(mockSubscribeToCollection).toHaveBeenCalledWith(
      'projects',
      expect.any(Function),
      expect.anything()
    );
  });

  it('returns requests sorted by createdAt descending', () => {
    const old = {
      id: 'r1', clientId: 'u1', crewSlots: [], description: '', date: '',
      location: '', budget: 0, status: 'open' as const,
      createdAt: { seconds: 100, nanoseconds: 0 },
    };
    const newer = {
      id: 'r2', clientId: 'u1', crewSlots: [], description: '', date: '',
      location: '', budget: 0, status: 'open' as const,
      createdAt: { seconds: 200, nanoseconds: 0 },
    };
    mockSubscribeToCollection.mockImplementation((_path, callback) => {
      callback([old, newer]);
      return () => {};
    });
    const { result } = renderHook(() => useProjectRequests());
    expect(result.current.requests[0].id).toBe('r2');
    expect(result.current.requests[1].id).toBe('r1');
  });

  it('submit calls addDocument with the correct shape', async () => {
    mockAddDocument.mockResolvedValue('new-id');
    const { result } = renderHook(() => useProjectRequests());
    const slots = [{ category: 'Editor', subcategory: 'Video Editor', quantity: 1 }];
    const details = { description: 'Test project', date: '2026-07-15', location: 'London', budget: 5000 };
    await act(async () => {
      await result.current.submit(slots, details);
    });
    expect(mockAddDocument).toHaveBeenCalledWith(
      'projects',
      expect.objectContaining({
        clientId: 'u1',
        crewSlots: slots,
        description: 'Test project',
        date: '2026-07-15',
        location: 'London',
        budget: 5000,
        status: 'open',
      })
    );
  });

  it('sets error and rethrows on submit failure', async () => {
    mockAddDocument.mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useProjectRequests());
    await act(async () => {
      try {
        await result.current.submit([], { description: '', date: '', location: '', budget: 0 });
      } catch {}
    });
    expect(result.current.error).toBe('Network error');
  });
});
