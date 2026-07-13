import { renderHook, act } from '@testing-library/react-native';
import { useProjectRequests } from '../useProjectRequests';
import { addDocument, subscribeToCollection, where, updateDocument, deleteDocument } from '@core/firebase/firestore';
import { useAuthStore } from '@core/stores/authStore';

jest.mock('@core/firebase/firestore', () => ({
  addDocument: jest.fn(),
  subscribeToCollection: jest.fn(),
  where: jest.fn(() => ({ type: 'where-constraint' })),
  updateDocument: jest.fn(),
  deleteDocument: jest.fn(),
}));

const mockAddDocument = addDocument as jest.MockedFunction<typeof addDocument>;
const mockSubscribeToCollection = subscribeToCollection as jest.MockedFunction<typeof subscribeToCollection>;
const mockUpdateDocument = updateDocument as jest.MockedFunction<typeof updateDocument>;
const mockDeleteDocument = deleteDocument as jest.MockedFunction<typeof deleteDocument>;

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
  mockUpdateDocument.mockResolvedValue(undefined);
  mockDeleteDocument.mockResolvedValue(undefined);
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
      id: 'r1', clientId: 'u1', title: 'Old', crewSlots: [], description: '', deadline: '',
      location: '', status: 'open' as const, filledSlots: [],
      createdAt: { seconds: 100, nanoseconds: 0 },
    };
    const newer = {
      id: 'r2', clientId: 'u1', title: 'New', crewSlots: [], description: '', deadline: '',
      location: '', status: 'open' as const, filledSlots: [],
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

  it('submit calls addDocument with the correct shape (no budget, has filledSlots)', async () => {
    mockAddDocument.mockResolvedValue('new-id');
    const { result } = renderHook(() => useProjectRequests());
    const slots = [{ category: 'Editor', subcategory: 'Video Editor', quantity: 1 }];
    const details = { title: 'My Film', description: 'Test project', deadline: '2026-07-15', location: 'London' };
    await act(async () => {
      await result.current.submit(slots, details);
    });
    expect(mockAddDocument).toHaveBeenCalledWith(
      'projects',
      expect.objectContaining({
        clientId: 'u1',
        crewSlots: slots,
        title: 'My Film',
        description: 'Test project',
        deadline: '2026-07-15',
        location: 'London',
        status: 'open',
        filledSlots: [],
      })
    );
    expect(mockAddDocument).toHaveBeenCalledWith('projects', expect.not.objectContaining({ budget: expect.anything() }));
  });

  it('sets error and rethrows on submit failure', async () => {
    mockAddDocument.mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useProjectRequests());
    await act(async () => {
      try {
        await result.current.submit([], { title: '', description: '', deadline: '', location: '' });
      } catch {}
    });
    expect(result.current.error).toBe('Network error');
  });

  it('updateProject calls updateDocument with correct path and payload', async () => {
    const { result } = renderHook(() => useProjectRequests());
    const slots = [{ category: 'Editor', subcategory: 'Video Editor', quantity: 2 }];
    const details = { title: 'Updated', description: 'New desc', deadline: '2026-08-01', location: 'Paris' };
    await act(async () => {
      await result.current.updateProject('proj-1', slots, details);
    });
    expect(mockUpdateDocument).toHaveBeenCalledWith(
      'projects/proj-1',
      expect.objectContaining({ crewSlots: slots, title: 'Updated', description: 'New desc', deadline: '2026-08-01', location: 'Paris' })
    );
  });

  it('updateProject sets error and rethrows on failure', async () => {
    mockUpdateDocument.mockRejectedValue(new Error('Update failed'));
    const { result } = renderHook(() => useProjectRequests());
    await act(async () => {
      try {
        await result.current.updateProject('x', [], { title: '', description: '', deadline: '', location: '' });
      } catch {}
    });
    expect(result.current.error).toBe('Update failed');
  });

  it('deleteProject calls deleteDocument with correct path', async () => {
    const { result } = renderHook(() => useProjectRequests());
    await act(async () => {
      await result.current.deleteProject('proj-1');
    });
    expect(mockDeleteDocument).toHaveBeenCalledWith('projects/proj-1');
  });

  it('deleteProject sets error and rethrows on failure', async () => {
    mockDeleteDocument.mockRejectedValue(new Error('Delete failed'));
    const { result } = renderHook(() => useProjectRequests());
    await act(async () => {
      try {
        await result.current.deleteProject('x');
      } catch {}
    });
    expect(result.current.error).toBe('Delete failed');
  });
});
