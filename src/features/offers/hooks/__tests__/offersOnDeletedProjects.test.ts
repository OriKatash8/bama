import { renderHook, act } from '@testing-library/react-native';
import { usePriceOffers } from '../usePriceOffers';
import { useBundleOffers } from '../useBundleOffers';
import { useSentOffers } from '../useSentOffers';
import { queryDocuments, subscribeToCollectionIn, subscribeToCollection, getDocument } from '@core/firebase/firestore';
import { useAuthStore } from '@core/stores/authStore';

/**
 * A DELETED PROJECT'S OFFERS ARE GONE FOR BOTH SIDES.
 * "Delete project" cancels it (status 'cancelled'); the server now removes its
 * pending offers, and these reads skip offers on such a project too, so ones
 * left from before the server change disappear as well.
 */

jest.mock('firebase/firestore', () => ({ where: jest.fn(() => ({ type: 'where' })) }));
jest.mock('@core/firebase/firestore', () => ({
  queryDocuments: jest.fn(),
  subscribeToCollectionIn: jest.fn(() => () => {}),
  subscribeToCollection: jest.fn(() => () => {}),
  getDocument: jest.fn(),
  where: jest.fn(() => ({ type: 'where' })),
}));

const mockQuery = queryDocuments as jest.Mock;
const mockSubIn = subscribeToCollectionIn as jest.Mock;
const mockSub = subscribeToCollection as jest.Mock;
const mockGet = getDocument as jest.Mock;
const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => {
  jest.clearAllMocks();
  mockSubIn.mockReturnValue(() => {});
  mockSub.mockReturnValue(() => {});
});

describe.each([
  ['usePriceOffers', usePriceOffers, 'priceOffers'],
  ['useBundleOffers', useBundleOffers, 'bundleOffers'],
] as const)('client: %s', (_name, hook, coll) => {
  beforeEach(() => useAuthStore.setState({ user: { id: 'client1' } as never }));

  it('leaves deleted (cancelled) projects out of the offer subscription', async () => {
    mockQuery.mockResolvedValue([
      { id: 'live', clientId: 'client1', status: 'open' },
      { id: 'deleted', clientId: 'client1', status: 'cancelled' },
      { id: 'busy', clientId: 'client1', status: 'in_progress' },
    ]);
    renderHook(() => hook());
    await tick();
    expect(mockSubIn).toHaveBeenCalledWith(coll, 'projectId', ['live', 'busy'], expect.any(Function), expect.anything());
  });

  it('only deleted projects: no subscription, not loading', async () => {
    mockQuery.mockResolvedValue([{ id: 'deleted', clientId: 'client1', status: 'cancelled' }]);
    const { result } = renderHook(() => hook());
    await tick();
    expect(mockSubIn).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
  });
});

describe('pro: useSentOffers', () => {
  const offer = (id: string, projectId: string, status: string) =>
    ({ id, projectId, status, professionalId: 'pro1', createdAt: { seconds: 1 } });

  beforeEach(() => {
    useAuthStore.setState({ user: { id: 'pro1' } as never });
    mockGet.mockImplementation(async (path: string) => {
      if (path === 'projects/live') return { id: 'live', title: 'Live', status: 'open' };
      if (path === 'projects/deleted') return { id: 'deleted', title: 'Gone', status: 'cancelled' };
      return null; // hard-deleted
    });
    mockSub.mockImplementation((coll: string, cb: (d: unknown[]) => void) => {
      cb(coll === 'priceOffers'
        ? [
          offer('a', 'live', 'pending'),
          offer('b', 'deleted', 'pending'),
          offer('c', 'missing', 'pending'),
          offer('d', 'deleted', 'accepted'), // history, kept
        ]
        : [{ ...offer('x', 'deleted', 'pending'), slots: [] }]);
      return () => {};
    });
  });

  it('hides pending offers on a deleted or missing project, keeps the rest', async () => {
    const { result } = renderHook(() => useSentOffers());
    await tick();
    expect(result.current.offers.map((o) => o.id).sort()).toEqual(['a', 'd']);
  });

  it('does not count them as pending', async () => {
    const { result } = renderHook(() => useSentOffers());
    await tick();
    expect(result.current.pendingCount).toBe(1);
  });
});
