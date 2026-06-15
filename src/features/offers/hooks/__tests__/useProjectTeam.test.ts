import { renderHook, act } from '@testing-library/react-native';
import { useProjectTeam } from '../useProjectTeam';
import { queryDocuments, getDocument, where } from '@core/firebase/firestore';

jest.mock('@core/firebase/firestore', () => ({
  queryDocuments: jest.fn(),
  getDocument: jest.fn(),
  where: jest.fn(() => ({ type: 'where-constraint' })),
}));

const mockQueryDocuments = queryDocuments as jest.MockedFunction<typeof queryDocuments>;
const mockGetDocument = getDocument as jest.MockedFunction<typeof getDocument>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useProjectTeam', () => {
  it('starts with empty team and not loading', () => {
    const { result } = renderHook(() => useProjectTeam('proj1'));
    expect(result.current.team).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('load() fetches accepted offers and resolves display names', async () => {
    mockQueryDocuments.mockResolvedValue([
      { id: 'o1', projectId: 'proj1', professionalId: 'pro1', category: 'Video', subcategory: 'DP', price: 900, status: 'accepted', createdAt: { seconds: 0, nanoseconds: 0 } },
    ]);
    mockGetDocument.mockResolvedValue({ displayName: 'Jane Smith', id: 'pro1' });

    const { result } = renderHook(() => useProjectTeam('proj1'));
    await act(async () => { await result.current.load(); });

    expect(result.current.team).toEqual([
      { professionalId: 'pro1', category: 'Video', subcategory: 'DP', price: 900, displayName: 'Jane Smith' },
    ]);
  });

  it('uses "Unknown" when user document not found', async () => {
    mockQueryDocuments.mockResolvedValue([
      { id: 'o1', projectId: 'proj1', professionalId: 'pro99', category: 'Audio', subcategory: 'Mixer', price: 300, status: 'accepted', createdAt: { seconds: 0, nanoseconds: 0 } },
    ]);
    mockGetDocument.mockResolvedValue(null);

    const { result } = renderHook(() => useProjectTeam('proj1'));
    await act(async () => { await result.current.load(); });

    expect(result.current.team[0].displayName).toBe('Unknown');
  });

  it('does not re-fetch if already loaded', async () => {
    mockQueryDocuments.mockResolvedValue([]);
    const { result } = renderHook(() => useProjectTeam('proj1'));
    await act(async () => { await result.current.load(); });
    await act(async () => { await result.current.load(); });
    expect(mockQueryDocuments).toHaveBeenCalledTimes(1);
  });
});
