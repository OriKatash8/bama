import React from 'react';
import { render, act } from '@testing-library/react-native';
import ClientBrowseProfileScreen from '../[userId]';
import ProBrowseProfileScreen from '../../../../../(professional)/(tabs)/browse/profile/[userId]';
import { getDocument } from '@core/firebase/firestore';

/**
 * A PRO'S PUBLIC PROFILE OPENS ON SKILLS.
 *
 * Browse profiles used to open on Equipment. Skills is what someone looking
 * for a pro wants first, so both browse screens — client and pro — ask for it.
 *
 * ContentTabs is stubbed: what is under test is which tab each screen ASKS
 * for, not how ContentTabs honours it (ContentTabs.test.tsx covers that).
 */

const tabProps: Record<string, unknown>[] = [];

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ userId: 'pro-1' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useSegments: () => ['(client)'],
}));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('@core/firebase/config', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({
  addDoc: jest.fn(), collection: jest.fn(), doc: jest.fn(),
  serverTimestamp: jest.fn(), updateDoc: jest.fn(),
}));
jest.mock('@core/firebase/storage', () => ({ uploadFile: jest.fn() }));
jest.mock('@core/firebase/firestore', () => ({
  getDocument: jest.fn(),
  queryDocuments: jest.fn(() => Promise.resolve([])),
}));
jest.mock('@features/reviews/services/reviewsService', () => ({
  fetchPublishedReviews: jest.fn(() => Promise.resolve([])),
}));
jest.mock('@features/profile/components/ProfileHeader', () => ({ ProfileHeader: () => null }));
jest.mock('@features/profile/components/BioSection', () => ({ BioSection: () => null }));
jest.mock('@features/profile/components/ContentTabs', () => ({
  ContentTabs: (props: Record<string, unknown>) => { tabProps.push(props); return null; },
}));
jest.mock('@features/profile/components/PortfolioGrid', () => ({ PortfolioGrid: () => null }));
jest.mock('@features/projects/components/DirectProjectSheet', () => ({ DirectProjectSheet: () => null }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { id: string } }) => unknown) => s({ user: { id: 'viewer-1' } }),
}));

const mockGetDocument = getDocument as jest.Mock;

beforeEach(() => {
  tabProps.length = 0;
  mockGetDocument.mockImplementation(async (path: string) =>
    path.includes('/profile/') ? { bio: '', equipment: [], roleSkills: [] } : { id: 'pro-1', displayName: 'Dana', photoURL: null });
});

it.each([
  ['client', ClientBrowseProfileScreen],
  ['pro', ProBrowseProfileScreen],
])('the %s browse profile asks ContentTabs to open on skills', async (_mode, Screen) => {
  render(<Screen />);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

  expect(tabProps.length).toBeGreaterThan(0);
  expect(tabProps[0].initialSection).toBe('skills');
});
