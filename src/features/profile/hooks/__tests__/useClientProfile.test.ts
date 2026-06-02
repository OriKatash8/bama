import { renderHook, act } from '@testing-library/react-native';
import { useClientProfile } from '../useClientProfile';
import { updateDocument, subscribeToDocument, mergeDocument } from '@core/firebase/firestore';
import { uploadFile } from '@core/firebase/storage';
import { useAuthStore } from '@core/stores/authStore';

jest.mock('@core/firebase/firestore', () => ({
  updateDocument: jest.fn(),
  subscribeToDocument: jest.fn(),
  mergeDocument: jest.fn(),
}));
jest.mock('@core/firebase/storage', () => ({ uploadFile: jest.fn() }));
global.fetch = jest.fn();

const mockUpdateDocument = updateDocument as jest.MockedFunction<typeof updateDocument>;
const mockSubscribeToDocument = subscribeToDocument as jest.MockedFunction<typeof subscribeToDocument>;
const mockMergeDocument = mergeDocument as jest.MockedFunction<typeof mergeDocument>;
const mockUploadFile = uploadFile as jest.MockedFunction<typeof uploadFile>;

const mockUser = {
  id: 'u1',
  email: 'test@example.com',
  displayName: 'Old Name',
  photoURL: null,
  createdAt: { seconds: 0, nanoseconds: 0 },
};

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: mockUser, activeMode: 'client', isLoading: false });
  mockSubscribeToDocument.mockReturnValue(() => {});
});

describe('useClientProfile', () => {
  it('subscribes to clientProfile sub-doc on mount', () => {
    renderHook(() => useClientProfile());
    expect(mockSubscribeToDocument).toHaveBeenCalledWith(
      'users/u1/clientProfile/data',
      expect.any(Function)
    );
  });

  it('exposes profile data from subscription callback', () => {
    const profileData = { userId: 'u1', companyName: 'ACME', bio: 'Hello', projectCount: 2 };
    mockSubscribeToDocument.mockImplementation((_path, callback) => {
      callback(profileData);
      return () => {};
    });
    const { result } = renderHook(() => useClientProfile());
    expect(result.current.profile).toEqual(profileData);
  });

  it('profile is null when sub-doc does not exist', () => {
    mockSubscribeToDocument.mockImplementation((_path, callback) => {
      callback(null);
      return () => {};
    });
    const { result } = renderHook(() => useClientProfile());
    expect(result.current.profile).toBeNull();
  });

  it('saves name without uploading when photoUri is null', async () => {
    mockUpdateDocument.mockResolvedValue(undefined);
    mockMergeDocument.mockResolvedValue(undefined);
    const { result } = renderHook(() => useClientProfile());
    await act(async () => {
      await result.current.save('New Name', null);
    });
    expect(mockUploadFile).not.toHaveBeenCalled();
    expect(mockUpdateDocument).toHaveBeenCalledWith('users/u1', {
      displayName: 'New Name',
      photoURL: null,
    });
  });

  it('writes companyName and bio to clientProfile sub-doc on save', async () => {
    mockUpdateDocument.mockResolvedValue(undefined);
    mockMergeDocument.mockResolvedValue(undefined);
    const { result } = renderHook(() => useClientProfile());
    await act(async () => {
      await result.current.save('New Name', null, 'ACME Corp', 'We make films.');
    });
    expect(mockMergeDocument).toHaveBeenCalledWith('users/u1/clientProfile/data', {
      userId: 'u1',
      companyName: 'ACME Corp',
      bio: 'We make films.',
    });
  });

  it('only writes userId to sub-doc when companyName and bio are not provided', async () => {
    mockUpdateDocument.mockResolvedValue(undefined);
    mockMergeDocument.mockResolvedValue(undefined);
    const { result } = renderHook(() => useClientProfile());
    await act(async () => {
      await result.current.save('New Name', null);
    });
    expect(mockMergeDocument).toHaveBeenCalledWith('users/u1/clientProfile/data', {
      userId: 'u1',
    });
  });

  it('uploads photo and saves URL when new photoUri is provided', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      blob: () => Promise.resolve(new Blob()),
    });
    mockUploadFile.mockResolvedValue('https://example.com/photo.jpg');
    mockUpdateDocument.mockResolvedValue(undefined);
    mockMergeDocument.mockResolvedValue(undefined);
    const { result } = renderHook(() => useClientProfile());
    await act(async () => {
      await result.current.save('New Name', 'file://local/photo.jpg');
    });
    expect(mockUploadFile).toHaveBeenCalledWith('avatars/u1', expect.any(Blob));
    expect(mockUpdateDocument).toHaveBeenCalledWith('users/u1', {
      displayName: 'New Name',
      photoURL: 'https://example.com/photo.jpg',
    });
  });

  it('updates authStore user after save', async () => {
    mockUpdateDocument.mockResolvedValue(undefined);
    mockMergeDocument.mockResolvedValue(undefined);
    const { result } = renderHook(() => useClientProfile());
    await act(async () => {
      await result.current.save('New Name', null);
    });
    expect(useAuthStore.getState().user?.displayName).toBe('New Name');
  });

  it('sets error and clears isSaving on save failure', async () => {
    mockUpdateDocument.mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useClientProfile());
    await act(async () => {
      try {
        await result.current.save('New Name', null);
      } catch {}
    });
    expect(result.current.error).toBe('Network error');
    expect(result.current.isSaving).toBe(false);
  });

  it('preserves existing photoURL when photoUri is null', async () => {
    const userWithPhoto = { ...mockUser, photoURL: 'https://existing.com/photo.jpg' };
    useAuthStore.setState({ user: userWithPhoto, activeMode: 'client', isLoading: false });
    mockUpdateDocument.mockResolvedValue(undefined);
    mockMergeDocument.mockResolvedValue(undefined);
    const { result } = renderHook(() => useClientProfile());
    await act(async () => {
      await result.current.save('New Name', null);
    });
    expect(mockUploadFile).not.toHaveBeenCalled();
    expect(mockUpdateDocument).toHaveBeenCalledWith('users/u1', {
      displayName: 'New Name',
      photoURL: 'https://existing.com/photo.jpg',
    });
  });
});
