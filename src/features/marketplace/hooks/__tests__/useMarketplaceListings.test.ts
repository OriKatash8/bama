import { renderHook } from '@testing-library/react-native';
import { useMarketplaceListings } from '../useMarketplaceListings';
import { subscribeToCollection } from '@core/firebase/firestore';

jest.mock('@core/firebase/firestore', () => ({
  subscribeToCollection: jest.fn(),
  where: jest.fn(() => ({ _type: 'where' })),
}));

const mockSubscribeToCollection = subscribeToCollection as jest.MockedFunction<typeof subscribeToCollection>;

const fakeListing = {
  id: 'listing-1',
  type: 'secondhand' as const,
  posterId: 'pro1',
  posterName: 'David K.',
  productName: 'Sony FX6',
  location: 'Tel Aviv',
  price: 4500,
  imageUrl: null,
  createdAt: { seconds: 1000, nanoseconds: 0 },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSubscribeToCollection.mockReturnValue(() => {});
});

describe('useMarketplaceListings', () => {
  it('starts with isLoading true and empty listings', () => {
    const { result } = renderHook(() => useMarketplaceListings('secondhand'));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.listings).toEqual([]);
  });

  it('sets listings and isLoading=false when subscription fires', () => {
    mockSubscribeToCollection.mockImplementation((_col, callback) => {
      callback([fakeListing]);
      return () => {};
    });
    const { result } = renderHook(() => useMarketplaceListings('secondhand'));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.listings).toHaveLength(1);
    expect(result.current.listings[0].productName).toBe('Sony FX6');
  });

  it('sorts listings by createdAt descending', () => {
    const older = { ...fakeListing, id: 'a', createdAt: { seconds: 500, nanoseconds: 0 } };
    const newer = { ...fakeListing, id: 'b', createdAt: { seconds: 1000, nanoseconds: 0 } };
    mockSubscribeToCollection.mockImplementation((_col, callback) => {
      callback([older, newer]);
      return () => {};
    });
    const { result } = renderHook(() => useMarketplaceListings('secondhand'));
    expect(result.current.listings[0].id).toBe('b');
    expect(result.current.listings[1].id).toBe('a');
  });

  it('subscribes to marketplace_listings collection filtered by type', () => {
    renderHook(() => useMarketplaceListings('rental'));
    expect(mockSubscribeToCollection).toHaveBeenCalledWith(
      'marketplace_listings',
      expect.any(Function),
      expect.any(Object)
    );
  });
});
