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
  createdAt: { seconds: 0, nanoseconds: 0 },
};

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: mockUser, activeMode: 'professional', isLoading: false });
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
      expect.any(Blob),
      expect.any(Function),
      undefined,
      expect.any(Object)
    );
    expect(mockSetDocument).toHaveBeenCalledWith(
      expect.stringContaining('users/u1/portfolio/'),
      expect.objectContaining({ url: 'https://example.com/photo.jpg', type: 'image' })
    );
  });

  it('remove deletes Firestore document then best-effort deletes Storage file', async () => {
    mockDeleteDocument.mockResolvedValue(undefined);
    mockDeleteFile.mockResolvedValue(undefined);
    const { result } = renderHook(() => usePortfolio());
    await act(async () => {
      await result.current.remove('asset123');
    });
    expect(mockDeleteDocument).toHaveBeenCalledWith('users/u1/portfolio/asset123');
    expect(mockDeleteFile).toHaveBeenCalledWith('portfolio/u1/asset123');
  });
});


describe('usePortfolio photo upload: progress and cancel', () => {
  const mount = () => renderHook(() => usePortfolio());
  beforeEach(() => {
    (global.fetch as jest.Mock).mockResolvedValue({ blob: async () => new Blob(['x']) });
  });

  it('reports progress as a 0..1 fraction', async () => {
    mockUploadFile.mockImplementation(async (_p, _b, onProgress) => {
      onProgress?.({ bytesTransferred: 5, totalBytes: 10, percentage: 50 });
      return 'https://cdn/p.jpg';
    });
    const onProgress = jest.fn();
    const { result } = mount();
    await act(async () => { await result.current.upload('file://p.jpg', null, { onProgress }); });
    expect(onProgress).toHaveBeenCalledWith(0.5);
    expect(mockSetDocument).toHaveBeenCalled();
  });

  it('cancel during the Storage upload writes nothing and does not throw', async () => {
    mockUploadFile.mockImplementation((_p, _b, _o, _m, task) =>
      new Promise((_res, rej) => { (task as { cancel?: () => void }).cancel = () => rej(new Error('storage/canceled')); })
    );
    const control: { cancel?: () => void } = {};
    const { result } = mount();
    let done = false;
    await act(async () => {
      const p = result.current.upload('file://p.jpg', null, { control }).then(() => { done = true; });
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      control.cancel?.();
      await p;
    });
    expect(done).toBe(true);
    expect(mockSetDocument).not.toHaveBeenCalled();
  });

  it('cancel right after Storage finishes deletes the file and writes no document', async () => {
    const control: { cancel?: () => void } = {};
    mockUploadFile.mockImplementation(async () => { control.cancel?.(); return 'https://cdn/p.jpg'; });
    const { result } = mount();
    await act(async () => { await result.current.upload('file://p.jpg', null, { control }); });
    expect(mockSetDocument).not.toHaveBeenCalled();
    expect(mockDeleteFile).toHaveBeenCalledWith(expect.stringContaining('portfolio/u1/'));
  });

  it('cancel before the Storage task exists skips the upload entirely', async () => {
    const control: { cancel?: () => void } = {};
    (global.fetch as jest.Mock).mockImplementation(async () => { control.cancel?.(); return { blob: async () => new Blob(['x']) }; });
    const { result } = mount();
    await act(async () => { await result.current.upload('file://p.jpg', null, { control }); });
    expect(mockUploadFile).not.toHaveBeenCalled();
    expect(mockSetDocument).not.toHaveBeenCalled();
  });
});
