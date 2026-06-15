import { renderHook, act } from '@testing-library/react-native';
import { usePriceOffers } from '../usePriceOffers';
import { queryDocuments, subscribeToCollection, where } from '@core/firebase/firestore';
import { useAuthStore } from '@core/stores/authStore';

jest.mock('@core/firebase/firestore', () => ({
  queryDocuments: jest.fn(),
  subscribeToCollection: jest.fn(),
  where: jest.fn(() => ({ type: 'where-constraint' })),
}));

const mockQueryDocuments = queryDocuments as jest.MockedFunction<typeof queryDocuments>;
const mockSubscribeToCollection = subscribeToCollection as jest.MockedFunction<typeof subscribeToCollection>;

const mockUser = {
  id: 'client1',
  email: 'client@example.com',
  displayName: 'Client',
  photoURL: null,
  createdAt: { seconds: 0, nanoseconds: 0 },
};

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: mockUser, activeMode: 'client', isLoading: false });
  mockSubscribeToCollection.mockReturnValue(() => {});
});

describe('usePriceOffers', () => {
  it('sets isLoading false immediately if client has no projects', async () => {
    mockQueryDocuments.mockResolvedValue([]);
    const { result } = renderHook(() => usePriceOffers());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.offers).toEqual([]);
    expect(mockSubscribeToCollection).not.toHaveBeenCalled();
  });

  it('subscribes to priceOffers with project IDs when client has projects', async () => {
    mockQueryDocuments.mockResolvedValue([
      { id: 'p1', clientId: 'client1' },
      { id: 'p2', clientId: 'client1' },
    ]);
    mockSubscribeToCollection.mockReturnValue(() => {});
    renderHook(() => usePriceOffers());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(mockSubscribeToCollection).toHaveBeenCalledWith(
      'priceOffers',
      expect.any(Function),
      expect.anything(),
      expect.anything()
    );
  });

  it('returns empty offers and not loading when no user', () => {
    useAuthStore.setState({ user: null, activeMode: 'client', isLoading: false });
    const { result } = renderHook(() => usePriceOffers());
    expect(result.current.offers).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });
});
