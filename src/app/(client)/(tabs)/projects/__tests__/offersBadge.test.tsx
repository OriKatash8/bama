import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import ProjectsPage from '../index';
import { useOffersSeenStore } from '@core/stores/offersSeenStore';
import { usePriceOffers } from '@features/offers/hooks/usePriceOffers';
import en from '@core/i18n/translations/en.json';

/**
 * A purple circle on the top-left of the "Price Offers" pill counts the offers the
 * client hasn't seen. It stays, across visits, until they actually open that tab.
 * Opening it marks everything seen and the circle disappears. Opening the Projects
 * page alone no longer counts as seeing them.
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
jest.mock('@features/offers/components/PriceOfferCard', () => ({ PriceOfferCard: () => null }));
jest.mock('@features/offers/components/BundleOfferCard', () => ({ BundleOfferCard: () => null }));
jest.mock('@features/offers/hooks/usePriceOffers', () => ({ usePriceOffers: jest.fn() }));
jest.mock('@features/offers/hooks/useBundleOffers', () => ({ useBundleOffers: () => ({ bundles: [], isLoading: false }) }));
jest.mock('@features/offers/hooks/useAcceptOffer', () => ({ useAcceptOffer: () => ({ accept: jest.fn(), reject: jest.fn(), isAccepting: false }) }));
jest.mock('@features/offers/hooks/useAcceptBundleOffer', () => ({ useAcceptBundleOffer: () => ({ acceptBundle: jest.fn(), rejectBundle: jest.fn(), isAccepting: false }) }));
jest.mock('@core/firebase/firestore', () => ({ getDocument: jest.fn(() => Promise.resolve(null)) }));
jest.mock('@core/stores/uiStore', () => ({ useUiStore: () => ({ showToast: jest.fn() }) }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { id: string } }) => unknown) => s({ user: { id: 'client-1' } }),
}));

const mockUsePriceOffers = usePriceOffers as jest.MockedFunction<typeof usePriceOffers>;
const offer = (id: string, seconds: number) => ({
  id, projectId: 'p1', professionalId: 'pro', category: 'Editor', price: 100, status: 'pending',
  createdAt: { seconds, nanoseconds: 0 },
});
const withOffers = (list: ReturnType<typeof offer>[]) =>
  mockUsePriceOffers.mockReturnValue({ offers: list, isLoading: false } as never);

const pill = (r: ReturnType<typeof render>, label: string) => r.getByRole('button', { name: label });

beforeEach(() => {
  useOffersSeenStore.setState({ lastSeenAt: { 'client-1': 20_000 } });
});

it('counts unseen offers on the Price Offers pill; opening the page alone marks nothing', async () => {
  withOffers([offer('a', 10), offer('b', 30), offer('c', 40)]);
  const r = render(<ProjectsPage />);
  await act(async () => {});
  expect(r.getByTestId('offers-badge')).toHaveTextContent('2');
  expect(useOffersSeenStore.getState().lastSeenAt['client-1']).toBe(20_000);
});

it('is still there on a later visit if the tab was never opened', async () => {
  withOffers([offer('b', 30)]);
  const first = render(<ProjectsPage />);
  await act(async () => {});
  first.unmount();
  const again = render(<ProjectsPage />);
  await act(async () => {});
  expect(again.getByTestId('offers-badge')).toHaveTextContent('1');
});

it('opening the Price Offers tab marks them seen and the circle disappears', async () => {
  withOffers([offer('b', 30), offer('c', 40)]);
  const r = render(<ProjectsPage />);
  await act(async () => {});
  await act(async () => { fireEvent.press(pill(r, en.chats_page.price_offers)); });
  expect(r.queryByTestId('offers-badge')).toBeNull();
  expect(useOffersSeenStore.getState().lastSeenAt['client-1']).toBe(40_000);
  // And back on Projects, nothing reappears.
  await act(async () => { fireEvent.press(pill(r, en.chats_page.my_projects)); });
  expect(r.queryByTestId('offers-badge')).toBeNull();
});

it('the "new offers" strip also opens the tab and clears the circle', async () => {
  withOffers([offer('b', 30)]);
  const r = render(<ProjectsPage />);
  await act(async () => {});
  await act(async () => { fireEvent.press(r.getByText(en.chats_page.new_offers_strip.replace('{{n}}', '1'))); });
  expect(r.queryByTestId('offers-badge')).toBeNull();
  expect(useOffersSeenStore.getState().lastSeenAt['client-1']).toBe(30_000);
});

it('an offer arriving while the tab is open counts as seen', async () => {
  withOffers([offer('b', 30)]);
  const r = render(<ProjectsPage />);
  await act(async () => {});
  await act(async () => { fireEvent.press(pill(r, en.chats_page.price_offers)); });
  withOffers([offer('b', 30), offer('d', 50)]);
  r.rerender(<ProjectsPage />);
  await act(async () => {});
  expect(useOffersSeenStore.getState().lastSeenAt['client-1']).toBe(50_000);
  expect(r.queryByTestId('offers-badge')).toBeNull();
});

it('no circle when nothing is new', async () => {
  withOffers([offer('a', 10)]);
  const r = render(<ProjectsPage />);
  await act(async () => {});
  expect(r.queryByTestId('offers-badge')).toBeNull();
});

it('caps the circle at 99+', async () => {
  withOffers(Array.from({ length: 120 }, (_, i) => offer(`o${i}`, 100 + i)));
  const r = render(<ProjectsPage />);
  await act(async () => {});
  expect(r.getByTestId('offers-badge')).toHaveTextContent('99+');
});
