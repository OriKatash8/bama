import { renderHook, act } from '@testing-library/react-native';
import { usePriceOffers } from '../usePriceOffers';
import { queryDocuments, subscribeToCollectionIn, where } from '@core/firebase/firestore';
import { useAuthStore } from '@core/stores/authStore';

jest.mock('@core/firebase/firestore', () => ({
  queryDocuments: jest.fn(),
  subscribeToCollectionIn: jest.fn(),
  where: jest.fn(() => ({ type: 'where-constraint' })),
}));

const mockQueryDocuments = queryDocuments as jest.MockedFunction<typeof queryDocuments>;
const mockSubscribeToCollection = subscribeToCollectionIn as jest.MockedFunction<typeof subscribeToCollectionIn>;

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
    renderHook(() => usePriceOffers());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    // Ids are handed over WHOLE, and the chunking happens inside
    // subscribeToCollectionIn — so the hook has one job and one place to get the
    // batch size wrong, rather than two.
    expect(mockSubscribeToCollection).toHaveBeenCalledWith(
      'priceOffers',
      'projectId',
      ['p1', 'p2'],
      expect.any(Function),
      expect.anything(),
    );
  });

  it('hands over EVERY project id, however many — the 20-id denial', async () => {
    // A client with 22 projects had their whole offers page denied, because the
    // rules resolve each offer's project with a get() and allow only 20 document
    // accesses per query. The hook must not silently truncate to dodge that;
    // subscribeToCollectionIn splits the list instead.
    const projects = Array.from({ length: 22 }, (_, i) => ({ id: `p${i}`, clientId: 'client1' }));
    mockQueryDocuments.mockResolvedValue(projects);
    renderHook(() => usePriceOffers());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const ids = mockSubscribeToCollection.mock.calls[0][2];
    expect(ids).toHaveLength(22);
    expect(ids[21]).toBe('p21');
  });

  it('returns empty offers and not loading when no user', () => {
    useAuthStore.setState({ user: null, activeMode: 'client', isLoading: false });
    const { result } = renderHook(() => usePriceOffers());
    expect(result.current.offers).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });
});
