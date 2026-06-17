import { renderHook, act } from '@testing-library/react-native';
import { useCreateListing } from '../useCreateListing';
import { addDocument } from '@core/firebase/firestore';
import { uploadFile } from '@core/firebase/storage';
import { useAuthStore } from '@core/stores/authStore';

jest.mock('@core/firebase/firestore', () => ({
  addDocument: jest.fn(),
}));

jest.mock('@core/firebase/storage', () => ({
  uploadFile: jest.fn(),
}));

global.fetch = jest.fn().mockResolvedValue({
  blob: () => Promise.resolve({}),
}) as any;

const mockAddDocument = addDocument as jest.MockedFunction<typeof addDocument>;
const mockUploadFile = uploadFile as jest.MockedFunction<typeof uploadFile>;

const mockUser = {
  id: 'pro1',
  email: 'pro@example.com',
  displayName: 'David K.',
  photoURL: null,
  createdAt: { seconds: 0, nanoseconds: 0 },
};

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: mockUser, activeMode: 'professional', isLoading: false });
  mockAddDocument.mockResolvedValue('new-id');
  mockUploadFile.mockResolvedValue('https://storage.example.com/image.jpg');
});

describe('useCreateListing', () => {
  it('creates a Firestore document with correct fields when no image', async () => {
    const { result } = renderHook(() => useCreateListing());
    await act(async () => {
      await result.current.create({
        type: 'secondhand',
        productName: 'Sony FX6',
        location: 'Tel Aviv',
        price: 4500,
        imageUri: null,
      });
    });
    expect(mockAddDocument).toHaveBeenCalledWith(
      'marketplace_listings',
      expect.objectContaining({
        type: 'secondhand',
        posterId: 'pro1',
        posterName: 'David K.',
        productName: 'Sony FX6',
        location: 'Tel Aviv',
        price: 4500,
        imageUrl: null,
      })
    );
    expect(mockUploadFile).not.toHaveBeenCalled();
  });

  it('uploads image and stores the download URL when imageUri is provided', async () => {
    const { result } = renderHook(() => useCreateListing());
    await act(async () => {
      await result.current.create({
        type: 'rental',
        productName: 'Arri Alexa Mini',
        location: 'Haifa',
        price: 600,
        imageUri: 'file://local/photo.jpg',
      });
    });
    expect(mockUploadFile).toHaveBeenCalledWith(
      expect.stringContaining('marketplace/'),
      expect.anything()
    );
    expect(mockAddDocument).toHaveBeenCalledWith(
      'marketplace_listings',
      expect.objectContaining({ imageUrl: 'https://storage.example.com/image.jpg' })
    );
  });

  it('sets isSubmitting to true while in flight and false after', async () => {
    let resolve: (id: string) => void;
    mockAddDocument.mockReturnValue(new Promise<string>((r) => { resolve = r; }));
    const { result } = renderHook(() => useCreateListing());
    act(() => {
      result.current.create({ type: 'secondhand', productName: 'Lens', location: 'TLV', price: 100, imageUri: null });
    });
    expect(result.current.isSubmitting).toBe(true);
    await act(async () => { resolve!('id'); });
    expect(result.current.isSubmitting).toBe(false);
  });

  it('does nothing if no user is logged in', async () => {
    useAuthStore.setState({ user: null, activeMode: 'professional', isLoading: false });
    const { result } = renderHook(() => useCreateListing());
    await act(async () => {
      await result.current.create({ type: 'secondhand', productName: 'Lens', location: 'TLV', price: 100, imageUri: null });
    });
    expect(mockAddDocument).not.toHaveBeenCalled();
  });

  it('propagates errors from Firestore write to the caller', async () => {
    mockAddDocument.mockRejectedValue(new Error('write failed'));
    const { result } = renderHook(() => useCreateListing());
    await expect(
      act(async () => {
        await result.current.create({ type: 'secondhand', productName: 'Lens', location: 'TLV', price: 100, imageUri: null });
      })
    ).rejects.toThrow('write failed');
    expect(result.current.isSubmitting).toBe(false);
  });
});
