import React from 'react';
import { render } from '@testing-library/react-native';
import { CommunityDiscoveryTab } from '../CommunityDiscoveryTab';
import { useCommunityDiscovery } from '../../hooks/useCommunityDiscovery';
import en from '@core/i18n/translations/en.json';

/**
 * "MY COMMUNITIES" ONLY EXISTS FOR SOMEONE WHO HAS ONE.
 *
 * A user in no communities gets no heading and no strip — not a strip of
 * "Example" filler tiles — so the tab opens straight on Discover.
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

function withMyCommunities(myCommunities: unknown[]) {
  mockDiscovery.mockReturnValue({
    myCommunities: myCommunities as never,
    discover: [],
    joinStatuses: {},
    requestToJoin: jest.fn(),
    cancelJoinRequest: jest.fn(),
  } as never);
}

it('hides the whole "My Communities" section when the user is in none', () => {
  withMyCommunities([]);
  const r = render(<CommunityDiscoveryTab onRequestCommunity={jest.fn()} />);
  expect(r.queryByText(en.communities.my_communities)).toBeNull();
  expect(r.queryByText('Example')).toBeNull();
  expect(r.getByText(en.communities.discover)).toBeTruthy();
});

it('shows the section with the user\'s communities when they have one', () => {
  withMyCommunities([{ id: 'c1', type: 'community', name: 'Gaffers Guild', members: ['u1'] }]);
  const r = render(<CommunityDiscoveryTab onRequestCommunity={jest.fn()} />);
  expect(r.getByText(en.communities.my_communities)).toBeTruthy();
  expect(r.getByText('Gaffers Guild')).toBeTruthy();
});
