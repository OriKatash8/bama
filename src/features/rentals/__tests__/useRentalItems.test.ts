import { act, renderHook, waitFor } from '@testing-library/react-native';
import { getDocs } from 'firebase/firestore';
import { matchesLoaded, useRentalItems } from '../hooks/useRentalItems';
import { RENTAL_PAGE_SIZE } from '../querySpecs';

jest.mock('@core/firebase/config', () => ({ db: {} }));
const mockToQuery = jest.fn((_db: unknown, spec: unknown, after: unknown) => ({ spec, after }));
jest.mock('../queries', () => ({ toQuery: (db: unknown, spec: unknown, after: unknown) => mockToQuery(db, spec, after) }));
jest.mock('firebase/firestore', () => ({ getDocs: jest.fn() }));

const page = (from: number, n: number) => ({
  docs: Array.from({ length: n }, (_, i) => ({ id: `i${from + i}`, data: () => ({ name: `Item ${from + i}` }) })),
});

beforeEach(() => jest.clearAllMocks());

describe('useRentalItems', () => {
  it('reads one page, then the next from the last document', async () => {
    (getDocs as jest.Mock).mockResolvedValueOnce(page(0, RENTAL_PAGE_SIZE)).mockResolvedValueOnce(page(30, 5));
    const { result } = renderHook(() => useRentalItems({}));
    await waitFor(() => expect(result.current.items).toHaveLength(RENTAL_PAGE_SIZE));
    expect(result.current.hasMore).toBe(true);

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items).toHaveLength(RENTAL_PAGE_SIZE + 5));
    expect(result.current.hasMore).toBe(false);
    // The second read starts after the first page's last document.
    expect((mockToQuery.mock.calls[1][2] as { id: string }).id).toBe(`i${RENTAL_PAGE_SIZE - 1}`);
  });

  it('a short first page means there is nothing more to load', async () => {
    (getDocs as jest.Mock).mockResolvedValueOnce(page(0, 3));
    const { result } = renderHook(() => useRentalItems({}));
    await waitFor(() => expect(result.current.items).toHaveLength(3));
    act(() => result.current.loadMore());
    expect(getDocs).toHaveBeenCalledTimes(1);
  });

  it('disabled (a demo account, the second-hand tab): no query, nothing loading', () => {
    const { result } = renderHook(() => useRentalItems({ enabled: false }));
    expect(getDocs).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ items: [], loading: false, hasMore: false });
  });

  it('new filters start again from the first page, and a stale page is dropped', async () => {
    let resolveOld: (v: unknown) => void = () => {};
    (getDocs as jest.Mock)
      .mockImplementationOnce(() => new Promise((r) => { resolveOld = r; }))
      .mockResolvedValueOnce(page(100, 2));
    const { result, rerender } = renderHook((p: { category: string | null }) => useRentalItems(p), {
      initialProps: { category: null },
    });
    rerender({ category: 'lens' });
    await waitFor(() => expect(result.current.items.map((i) => i.id)).toEqual(['i100', 'i101']));
    await act(async () => { resolveOld(page(0, RENTAL_PAGE_SIZE)); });
    expect(result.current.items.map((i) => i.id)).toEqual(['i100', 'i101']);
  });
});

describe('matchesLoaded', () => {
  it('every typed word must be in the name (the server matched one)', () => {
    expect(matchesLoaded({ name: 'Aputure LS 600d Pro' }, 'aputure 600d', [])).toBe(true);
    expect(matchesLoaded({ name: 'Aputure LS 300x' }, 'aputure 600d', [])).toBe(false);
  });
  it('with search text, a brand filter is matched on the name', () => {
    expect(matchesLoaded({ name: 'Atomos Ninja monitor' }, 'monitor', ['Atomos'])).toBe(true);
    expect(matchesLoaded({ name: 'SmallHD monitor' }, 'monitor', ['Atomos'])).toBe(false);
  });
  it('without search text the server already applied the brands', () => {
    expect(matchesLoaded({ name: 'anything' }, '', ['Atomos'])).toBe(true);
  });
});
