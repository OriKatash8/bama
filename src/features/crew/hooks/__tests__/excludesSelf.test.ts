/**
 * Browse must never offer you yourself.
 *
 * Both browse searches walk the whole `users` collection, so an account that
 * has a professional profile matched its own listing — a client who also works
 * as a pro could open their own card and message themselves. The signed-in
 * user is dropped inside the hooks, which is the one place both the client and
 * the professional browse screens share.
 */
import { renderHook, waitFor } from '@testing-library/react-native';
import { useSearchProfessionals } from '../useSearchProfessionals';
import { useUnifiedSearch } from '../useUnifiedSearch';
import { queryDocuments, getDocument } from '@core/firebase/firestore';
import { useAuthStore } from '@core/stores/authStore';

jest.mock('@core/firebase/firestore', () => ({
  queryDocuments: jest.fn(),
  getDocument: jest.fn(),
}));

jest.mock('@features/reviews/services/reviewsService', () => ({
  fetchPublishedReviews: jest.fn(() => Promise.resolve([])),
}));

const mockQueryDocuments = queryDocuments as jest.Mock;
const mockGetDocument = getDocument as jest.Mock;

const USERS = [
  { id: 'me',    displayName: 'Dana Videographer' },
  { id: 'other', displayName: 'Noa Videographer' },
];

/** Every user in the fixture is a videographer, so only identity can exclude one. */
const PROFILE = { roleSkills: [{ role: 'videographer', specializations: ['general'] }] };

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({
    user: { id: 'me', email: 'me@example.com', displayName: 'Dana Videographer', photoURL: null, createdAt: { seconds: 0, nanoseconds: 0 } },
    activeMode: 'client',
    isLoading: false,
  });
  mockQueryDocuments.mockResolvedValue(USERS);
  mockGetDocument.mockResolvedValue(PROFILE);
});

describe('useSearchProfessionals', () => {
  it('leaves the signed-in user out of the category results', async () => {
    const { result } = renderHook(() => useSearchProfessionals('Video Photographer'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const ids = result.current.results.map((r) => r.user.id);
    expect(ids).toEqual(['other']);
  });

  it('keeps everyone else when no one is signed in', async () => {
    useAuthStore.setState({ user: null });

    const { result } = renderHook(() => useSearchProfessionals('Video Photographer'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.results.map((r) => r.user.id).sort()).toEqual(['me', 'other']);
  });
});

describe('useUnifiedSearch', () => {
  it('leaves the signed-in user out of the name results', async () => {
    const { result } = renderHook(() => useUnifiedSearch('videographer'));

    await waitFor(() => expect(result.current.results.length).toBeGreaterThan(0), { timeout: 3000 });

    expect(result.current.results.map((r) => r.user.id)).toEqual(['other']);
  });

  it('keeps everyone else when no one is signed in', async () => {
    useAuthStore.setState({ user: null });

    const { result } = renderHook(() => useUnifiedSearch('videographer'));

    await waitFor(() => expect(result.current.results.length).toBe(2), { timeout: 3000 });

    expect(result.current.results.map((r) => r.user.id).sort()).toEqual(['me', 'other']);
  });
});
