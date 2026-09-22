import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { CommunityDiscoveryTab } from '../CommunityDiscoveryTab';
import { useCommunityDiscovery } from '../../hooks/useCommunityDiscovery';
import en from '@core/i18n/translations/en.json';

/**
 * "MY COMMUNITIES" ONLY EXISTS FOR SOMEONE WHO HAS ONE.
 *
 * A user in no communities gets no heading and no strip, so the tab opens
 * straight on Discover. A user in fewer than five gets "+" tiles filling the
 * strip up to five, numbered after their real ones; a "+" tile takes them down
 * to the Discover cards, where the communities to join are.
 */

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSegments: () => ['(professional)'],
}));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../hooks/useCommunityDiscovery', () => ({ useCommunityDiscovery: jest.fn() }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { id: string } }) => unknown) => s({ user: { id: 'u1' } }),
}));

const mockDiscovery = useCommunityDiscovery as jest.MockedFunction<typeof useCommunityDiscovery>;

function communities(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `c${i + 1}`, type: 'community', name: `Guild ${i + 1}`, members: ['u1'],
  }));
}

function renderWith(
  myCommunities: unknown[],
  pageScrollRef: unknown = { current: null },
  discover: unknown[] = [],
) {
  mockDiscovery.mockReturnValue({
    myCommunities: myCommunities as never,
    discover: discover as never,
    joinStatuses: {},
    requestToJoin: jest.fn(),
    cancelJoinRequest: jest.fn(),
  } as never);
  return render(
    <CommunityDiscoveryTab onRequestCommunity={jest.fn()} pageScrollRef={pageScrollRef as never} />,
  );
}

/** The name an empty slot used to carry — nothing should render it now. */
const retiredPlaceholderName = (n: number) => en.communities.placeholder_name.replace('{{n}}', String(n));

it('hides the whole "My Communities" section when the user is in none', () => {
  const r = renderWith([]);
  expect(r.queryByText(en.communities.my_communities)).toBeNull();
  expect(r.queryAllByText('+')).toHaveLength(0);
  expect(r.getByText(en.communities.discover)).toBeTruthy();
});

it('fills the strip up to five with "+" tiles', () => {
  const r = renderWith(communities(1));
  expect(r.getByText(en.communities.my_communities)).toBeTruthy();
  expect(r.getByText('Guild 1')).toBeTruthy();
  expect(r.getAllByText('+')).toHaveLength(4);
});

it('shows only the tiles still missing — three communities leave two', () => {
  const r = renderWith(communities(3));
  expect(r.getAllByText('+')).toHaveLength(2);
});

it('leaves the empty slots nameless — only real communities are named', () => {
  const r = renderWith(communities(1));

  [1, 2, 3, 4, 5].forEach((n) => expect(r.queryByText(retiredPlaceholderName(n))).toBeNull());
  // The real one keeps its own name; the strip did not go silent altogether.
  expect(r.getByText('Guild 1')).toBeTruthy();
});

it.each([5, 7])('shows no "+" tiles once the user is in %i communities', (n) => {
  const r = renderWith(communities(n));
  expect(r.queryAllByText('+')).toHaveLength(0);
});

it('a "+" tile scrolls the PAGE (the screen\'s ScrollView) to just above the first Discover card', () => {
  // The tab sits inside the chats screen's scrolling <Screen>; its own ScrollView
  // grows to full height and never scrolls, so scrolling it does nothing on a
  // phone. The scroll must go to the page ScrollView handed in from the screen.
  const content = { contentView: true };
  const pageScrollRef = { current: { scrollTo: jest.fn(), getInnerViewRef: () => content } };
  const r = renderWith(communities(2), pageScrollRef);
  // jest-expo's View is a mock whose measureLayout never calls back; give the
  // anchor one that reports its offset within the page's content view.
  const anchor = r.UNSAFE_getByProps({ testID: 'discover-cards-anchor' }).instance as {
    measureLayout: (rel: unknown, ok: (x: number, y: number, w: number, h: number) => void) => void;
  };
  anchor.measureLayout = (relativeTo, ok) => { if (relativeTo === content) ok(0, 456, 390, 0); };
  fireEvent.press(r.getAllByText('+')[0]);
  expect(pageScrollRef.current.scrollTo).toHaveBeenCalledWith({ y: 456 - 8, animated: true });
});

it('names the Discover category filters in the plural — a community is a group of them', () => {
  const r = renderWith([], undefined, [
    { id: 'd1', type: 'community', name: 'Cutting Room', members: [], category: 'Editor' },
    { id: 'd2', type: 'community', name: 'Night Shoots', members: [], category: 'Video Photographer' },
  ]);
  expect(r.getByText('Editors')).toBeTruthy();
  expect(r.getByText('Videographers')).toBeTruthy();
  expect(r.queryByText('Editor')).toBeNull();
});
