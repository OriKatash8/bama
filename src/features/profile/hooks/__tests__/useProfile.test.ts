import { renderHook, act } from '@testing-library/react-native';
import { useProfile } from '../useProfile';
import {
  subscribeToDocument,
  updateDocument,
  mergeDocument,
  queryByField,
} from '@core/firebase/firestore';
import { uploadFile } from '@core/firebase/storage';
import { useAuthStore } from '@core/stores/authStore';

jest.mock('@core/firebase/firestore', () => ({
  subscribeToDocument: jest.fn(),
  updateDocument: jest.fn(),
  mergeDocument: jest.fn(),
  queryByField: jest.fn(),
}));
jest.mock('@core/firebase/storage', () => ({ uploadFile: jest.fn() }));
global.fetch = jest.fn();

const mockSubscribeToDocument = subscribeToDocument as jest.MockedFunction<typeof subscribeToDocument>;
const mockUpdateDocument = updateDocument as jest.MockedFunction<typeof updateDocument>;
const mockMergeDocument = mergeDocument as jest.MockedFunction<typeof mergeDocument>;
const mockQueryByField = queryByField as jest.MockedFunction<typeof queryByField>;

const mockUser = {
  id: 'u1',
  email: 'pro@example.com',
  displayName: 'Pro User',
  photoURL: null,
  createdAt: { seconds: 0, nanoseconds: 0 },
};

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: mockUser, activeMode: 'professional', isLoading: false });
  mockSubscribeToDocument.mockImplementation((_path, callback) => {
    callback(null);
    return () => {};
  });
  mockQueryByField.mockResolvedValue([]);
});

describe('useProfile', () => {
  it('subscribes to profile sub-doc at correct path', async () => {
    const { result } = renderHook(() => useProfile());
    await act(async () => {});
    expect(mockSubscribeToDocument).toHaveBeenCalledWith(
      'users/u1/profile/data',
      expect.any(Function)
    );
  });

  it('fetches reviews by professionalId', async () => {
    const { result } = renderHook(() => useProfile());
    await act(async () => {});
    expect(mockQueryByField).toHaveBeenCalledWith('reviews', 'professionalId', 'u1');
  });

  it('save writes name/photo to base user doc and profile fields to sub-doc', async () => {
    mockUpdateDocument.mockResolvedValue(undefined);
    mockMergeDocument.mockResolvedValue(undefined);
    const { result } = renderHook(() => useProfile());
    await act(async () => {
      await result.current.save({
        name: 'New Name',
        photoUri: null,
        roleSkills: [{ role: 'editor', specializations: ['general'] }],
        bio: 'My bio',
        equipment: [{ name: 'Canon R5', category: 'camera' }],
        priceList: [{ service: 'Half day', price: 500 }],
      });
    });
    expect(mockUpdateDocument).toHaveBeenCalledWith('users/u1', {
      displayName: 'New Name',
      photoURL: null,
    });
    expect(mockMergeDocument).toHaveBeenCalledWith('users/u1/profile/data', {
      roleSkills: [{ role: 'editor', specializations: ['general'] }],
      bio: 'My bio',
      equipment: [{ name: 'Canon R5', category: 'camera' }],
      priceList: [{ service: 'Half day', price: 500 }],
      proProfileCompleted: true,
    });
  });

  it('updates authStore after save', async () => {
    mockUpdateDocument.mockResolvedValue(undefined);
    mockMergeDocument.mockResolvedValue(undefined);
    const { result } = renderHook(() => useProfile());
    await act(async () => {
      await result.current.save({
        name: 'New Name',
        photoUri: null,
        roleSkills: [],
        bio: '',
        equipment: [],
        priceList: [],
      });
    });
    expect(useAuthStore.getState().user?.displayName).toBe('New Name');
  });

  it('sets error on save failure', async () => {
    mockUpdateDocument.mockRejectedValue(new Error('Firestore error'));
    const { result } = renderHook(() => useProfile());
    await act(async () => {
      try {
        await result.current.save({
          name: 'New Name',
          photoUri: null,
          roleSkills: [],
          bio: '',
          equipment: [],
          priceList: [],
        });
      } catch (e) {
        // Expected to throw
      }
    });
    expect(result.current.error).toBe('Firestore error');
  });
});
