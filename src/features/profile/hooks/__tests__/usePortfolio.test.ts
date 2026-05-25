import { renderHook, act } from '@testing-library/react-native';
import { usePortfolio } from '../usePortfolio';
import {
  subscribeToCollection,
  setDocument,
  deleteDocument,
} from '@core/firebase/firestore';
import { uploadFile, deleteFile } from '@core/firebase/storage';
import { useAuthStore } from '@core/stores/authStore';

jest.mock('@core/firebase/firestore', () => ({
  subscribeToCollection: jest.fn(),
  setDocument: jest.fn(),
  deleteDocument: jest.fn(),
}));
jest.mock('@core/firebase/storage', () => ({
  uploadFile: jest.fn(),
  deleteFile: jest.fn(),
}));
global.fetch = jest.fn();

const mockSubscribeToCollection = subscribeToCollection as jest.MockedFunction<typeof subscribeToCollection>;
const mockSetDocument = setDocument as jest.MockedFunction<typeof setDocument>;
const mockDeleteDocument = deleteDocument as jest.MockedFunction<typeof deleteDocument>;
const mockUploadFile = uploadFile as jest.MockedFunction<typeof uploadFile>;
const mockDeleteFile = deleteFile as jest.MockedFunction<typeof deleteFile>;

const mockUser = {
  id: 'u1',
  email: 'pro@example.com',
  displayName: 'Pro User',
  photoURL: null,
  role: 'professional' as const,
  createdAt: { seconds: 0, nanoseconds: 0 },
};

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: mockUser, role: 'professional', isLoading: false });
  mockSubscribeToCollection.mockImplementation((_path, callback) => {
    callback([]);
    return () => {};
  });
});

describe('usePortfolio', () => {
  it('subscribes to portfolio collection at correct path', () => {
    renderHook(() => usePortfolio());
    expect(mockSubscribeToCollection).toHaveBeenCalledWith(
      'users/u1/portfolio',
      expect.any(Function)
    );
  });

  it('upload fetches blob, calls uploadFile, writes Firestore doc', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      blob: () => Promise.resolve(new Blob()),
    });
    mockUploadFile.mockResolvedValue('https://example.com/photo.jpg');
    mockSetDocument.mockResolvedValue(undefined);
    const { result } = renderHook(() => usePortfolio());
    await act(async () => {
      await result.current.upload('file://local/photo.jpg');
    });
    expect(mockUploadFile).toHaveBeenCalledWith(
      expect.stringContaining('portfolio/u1/'),
      expect.any(Blob)
    );
    expect(mockSetDocument).toHaveBeenCalledWith(
      expect.stringContaining('users/u1/portfolio/'),
      expect.objectContaining({ url: 'https://example.com/photo.jpg', type: 'image' })
    );
  });

  it('remove deletes file from storage then document from Firestore', async () => {
    mockDeleteFile.mockResolvedValue(undefined);
    mockDeleteDocument.mockResolvedValue(undefined);
    const { result } = renderHook(() => usePortfolio());
    await act(async () => {
      await result.current.remove('asset123');
    });
    expect(mockDeleteFile).toHaveBeenCalledWith('portfolio/u1/asset123');
    expect(mockDeleteDocument).toHaveBeenCalledWith('users/u1/portfolio/asset123');
  });
});
