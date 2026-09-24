import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import ProjectsPage from '../index';
import { usePriceOffers } from '@features/offers/hooks/usePriceOffers';
import { useBundleOffers } from '@features/offers/hooks/useBundleOffers';
import { getDocument } from '@core/firebase/firestore';
import en from '@core/i18n/translations/en.json';

/**
 * The filter chips on the price-offers page.
 *
 * They replaced a "Sort & Filter" button that opened a modal with draft state,
 * Apply and Clear — four taps to sort by price, and the current sort invisible
 * until you reopened the sheet.
 *
 * This drives the real page rather than the helpers, because the helpers being
 * right has already proved to be no guarantee: a correct function called with a
 * literal is still a screen that does the wrong thing, and that exact gap has
 * shipped twice in this repo. The offer cards are mocked down to their price so
 * the ORDER of the list is observable.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSegments: () => ['(client)'],
}));
jest.mock('@components/layout/Screen', () => ({ Screen: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@components/ui/EmptyState', () => ({ EmptyState: () => null }));
jest.mock('@features/crew/components', () => ({ ProjectRequestCard: () => null }));
jest.mock('@features/crew/hooks', () => ({ useProjectRequests: () => ({ requests: [], isLoading: false }) }));
jest.mock('@features/offers/components/PriceOfferCard', () => {
  const { Text } = require('react-native');
  return { PriceOfferCard: ({ offer }: { offer: { id: string } }) => <Text>{`card:${offer.id}`}</Text> };
});
jest.mock('@features/offers/components/BundleOfferCard', () => {
  const { Text } = require('react-native');
  return { BundleOfferCard: ({ bundle }: { bundle: { id: string } }) => <Text>{`card:${bundle.id}`}</Text> };
});
jest.mock('@features/offers/hooks/usePriceOffers', () => ({ usePriceOffers: jest.fn() }));
jest.mock('@features/offers/hooks/useBundleOffers', () => ({ useBundleOffers: jest.fn() }));
jest.mock('@features/offers/hooks/useAcceptOffer', () => ({ useAcceptOffer: () => ({ accept: jest.fn(), reject: jest.fn(), isAccepting: false }) }));
jest.mock('@features/offers/hooks/useAcceptBundleOffer', () => ({ useAcceptBundleOffer: () => ({ acceptBundle: jest.fn(), rejectBundle: jest.fn(), isAccepting: false }) }));
jest.mock('@core/firebase/firestore', () => ({ getDocument: jest.fn() }));
jest.mock('@core/stores/uiStore', () => ({ useUiStore: () => ({ showToast: jest.fn() }) }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { id: string } }) => unknown) => s({ user: { id: 'client-1' } }),
}));

const mockOffers = usePriceOffers as jest.MockedFunction<typeof usePriceOffers>;
const mockBundles = useBundleOffers as jest.MockedFunction<typeof useBundleOffers>;
const mockGetDocument = getDocument as jest.Mock;

/** price offers: cheap/old, dear/new, mid — and their pros have ratings. */
const OFFERS = [
  { id: 'mid',   projectId: 'p1', professionalId: 'pro-mid',   category: 'Editor', price: 200, status: 'pending', createdAt: { seconds: 200, nanoseconds: 0 } },
  { id: 'cheap', projectId: 'p1', professionalId: 'pro-cheap', category: 'Editor', price: 100, status: 'pending', createdAt: { seconds: 100, nanoseconds: 0 } },
  { id: 'dear',  projectId: 'p1', professionalId: 'pro-dear',  category: 'Editor', price: 300, status: 'pending', createdAt: { seconds: 300, nanoseconds: 0 } },
];
const BUNDLE = {
  id: 'bundle', projectId: 'p1', professionalId: 'pro-mid', bundlePrice: 250,
  status: 'pending', createdAt: { seconds: 150, nanoseconds: 0 }, categories: ['Editor'],
};
const RATING: Record<string, number> = { 'pro-cheap': 2, 'pro-mid': 5, 'pro-dear': 4 };

function setup({ bundles = [] as unknown[] } = {}) {
  mockOffers.mockReturnValue({ offers: OFFERS, isLoading: false } as never);
  mockBundles.mockReturnValue({ bundles, isLoading: false } as never);
  // getDocument takes ONE path. Mocking it as (collection, id) made every
  // lookup miss, every rating 0, and the Stars test pass on input order alone.
  mockGetDocument.mockImplementation(async (path: string) => {
    const m = /^users\/([^/]+)(\/profile\/data)?$/.exec(path);
    if (!m) return null;
    const [, id, isProfile] = m;
    if (RATING[id] === undefined) return null;
    // The rating lives on the profile doc; the name on the user doc, and the
    // page only records a professional when the USER doc resolves.
    return isProfile ? { rating: RATING[id] } : { displayName: id, photoURL: null };
  });
}

/** Render, then move to the Price Offers segment where the chips live. */
async function openOffers(bundles: unknown[] = []) {
  setup({ bundles });
  const r = render(<ProjectsPage />);
  await act(async () => {});
  await act(async () => { fireEvent.press(r.getByText(en.chats_page.price_offers)); });
  return r;
}

const tap = async (r: ReturnType<typeof render>, label: string) => {
  await act(async () => { fireEvent.press(r.getByText(label)); });
};

/** The ids of the offer cards, in the order they are rendered. */
const order = (r: ReturnType<typeof render>) =>
  r.getAllByText(/^card:/).map((n) => String(n.props.children).replace('card:', ''));

beforeEach(() => jest.clearAllMocks());

describe('which chips are on screen', () => {
  it('shows price, newest and stars', async () => {
    const r = await openOffers();
    expect(r.queryByText(en.offers.sort_price)).not.toBeNull();
    expect(r.queryByText(en.offers.sort_newest)).not.toBeNull();
    expect(r.queryByText(en.offers.sort_stars)).not.toBeNull();
  });

  it('has no "Sort & Filter" button and no sheet to open', async () => {
    const r = await openOffers();
    // The whole point of the change: the state is on the chips, not behind a
    // modal with Apply and Clear.
    expect(r.queryByText('Sort & Filter')).toBeNull();
    expect(r.queryByText('Apply')).toBeNull();
    expect(r.queryByText('Clear')).toBeNull();
  });

  it('offers bundle-only ONLY when a bundle exists', async () => {
    expect((await openOffers()).queryByTestId('chip-bundle-only')).toBeNull();
    expect((await openOffers([BUNDLE])).queryByTestId('chip-bundle-only')).not.toBeNull();
  });
});

describe('what the chips do to the list', () => {
  it('opens newest first, with no chip tapped', async () => {
    expect(order(await openOffers())).toEqual(['dear', 'mid', 'cheap']);
  });

  it('sorts cheapest first on the first Price tap', async () => {
    const r = await openOffers();
    await tap(r, en.offers.sort_price);
    expect(order(r)).toEqual(['cheap', 'mid', 'dear']);
  });

  it('flips to dearest first on the second Price tap', async () => {
    const r = await openOffers();
    await tap(r, en.offers.sort_price);
    await tap(r, en.offers.sort_price);
    expect(order(r)).toEqual(['dear', 'mid', 'cheap']);
  });

  it('sorts by rating on Stars', async () => {
    const r = await openOffers();
    await tap(r, en.offers.sort_stars);
    expect(order(r)).toEqual(['mid', 'dear', 'cheap']);
  });

  it('goes back to newest on Newest', async () => {
    const r = await openOffers();
    await tap(r, en.offers.sort_price);
    await tap(r, en.offers.sort_newest);
    expect(order(r)).toEqual(['dear', 'mid', 'cheap']);
  });

  it('narrows to bundles, and widens again on a second tap', async () => {
    const r = await openOffers([BUNDLE]);
    await act(async () => { fireEvent.press(r.getByTestId('chip-bundle-only')); });
    expect(order(r)).toEqual(['bundle']);
    await act(async () => { fireEvent.press(r.getByTestId('chip-bundle-only')); });
    expect(order(r)).toHaveLength(4);
  });

  it('keeps the price sort while filtered to bundles', async () => {
    // The anchor for the group: a chip row where tapping one silently reset the
    // others would pass every single-chip test above.
    const r = await openOffers([BUNDLE]);
    await tap(r, en.offers.sort_price);
    await act(async () => { fireEvent.press(r.getByTestId('chip-bundle-only')); });
    await act(async () => { fireEvent.press(r.getByTestId('chip-bundle-only')); });
    expect(order(r)).toEqual(['cheap', 'mid', 'bundle', 'dear']);
  });
});

describe('the chip that disappears while its filter is on', () => {
  it('stops filtering when the last bundle goes, rather than emptying the list', async () => {
    // The hazard the chips introduced and the modal did not have. The chip is
    // only rendered while bundles exist; if the FILTER outlived it, accepting
    // the last bundle would leave an empty list and nothing to switch off.
    const r = await openOffers([BUNDLE]);
    await act(async () => { fireEvent.press(r.getByTestId('chip-bundle-only')); });
    expect(order(r)).toEqual(['bundle']);

    mockBundles.mockReturnValue({ bundles: [], isLoading: false } as never);
    await act(async () => { r.rerender(<ProjectsPage />); });

    expect(r.queryByTestId('chip-bundle-only')).toBeNull();
    expect(order(r)).toEqual(['dear', 'mid', 'cheap']);
  });
});
