import React from 'react';
import { Alert, Modal, Text } from 'react-native';
import { render, act, fireEvent } from '@testing-library/react-native';
import en from '@core/i18n/translations/en.json';
import ClientBrowseProfileScreen from '../[userId]';
import ProBrowseProfileScreen from '../../../../../(professional)/(tabs)/browse/profile/[userId]';
import { getDocument } from '@core/firebase/firestore';
import { addDoc } from 'firebase/firestore';

/**
 * A PROFILE OPENED FROM A CHAT (the chat passes `?from=`).
 *
 * - from a PROJECT chat: Block is hidden everywhere on the page, Report stays.
 * - from any chat: the chevron goes back (to the chat), not to Browse.
 * - a user with no professional profile gets a basic page, not "not found".
 */

jest.mock('@features/blocking/components/BlockUserSheet', () => ({
  BlockUserSheet: ({ visible, targetUserId }: { visible: boolean; targetUserId: string }) => {
    const { Text: T } = jest.requireActual('react-native');
    return visible ? <T testID="block-sheet">{targetUserId}</T> : null;
  },
}));
jest.mock('@core/stores/blockStore', () => ({
  useBlockStore: (s: (x: { blocked: string[] }) => unknown) => s({ blocked: [] }),
}));
let mockParams: Record<string, string> = { userId: 'pro-1' };
let mockCanGoBack = true;
const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: mockPush, back: mockBack, canGoBack: () => mockCanGoBack }),
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
  ContentTabs: () => null,
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
const PROFILE = { bio: 'Bio', equipment: [], roleSkills: [] };
const USER = { id: 'pro-1', displayName: 'Dana', photoURL: null };

function load(opts: { profile: object | null; user: object | null }) {
  mockGetDocument.mockImplementation(async (path: string) => (path.includes('/profile/') ? opts.profile : opts.user));
}

async function renderLoaded(Screen: React.ComponentType) {
  const r = render(<Screen />);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return r;
}

beforeEach(() => {
  mockParams = { userId: 'pro-1' };
  mockCanGoBack = true;
  mockBack.mockClear();
  mockPush.mockClear();
  load({ profile: PROFILE, user: USER });
});

const SCREENS = [['client', ClientBrowseProfileScreen], ['pro', ProBrowseProfileScreen]] as const;

describe.each(SCREENS)('%s profile', (_mode, Screen) => {
  it('from a PROJECT chat: no Block (title row or labelled), Report still there', async () => {
    mockParams = { userId: 'pro-1', from: 'projectChat' };
    const r = await renderLoaded(Screen);
    expect(r.queryByTestId('profile-block')).toBeNull();
    expect(r.queryByTestId('profile-block-labelled')).toBeNull();
    expect(r.getByTestId('profile-report')).toBeTruthy();
    expect(r.getByTestId('profile-report-labelled')).toBeTruthy();
  });

  it('from any other chat, or from nowhere: Block is still offered', async () => {
    for (const from of ['chat', undefined]) {
      mockParams = from ? { userId: 'pro-1', from } : { userId: 'pro-1' };
      const r = await renderLoaded(Screen);
      expect(r.getByTestId('profile-block')).toBeTruthy();
      expect(r.getByTestId('profile-block-labelled')).toBeTruthy();
      r.unmount();
    }
  });

  it('opened from a chat, the chevron goes BACK to it; from nowhere it goes to Browse as before', async () => {
    mockParams = { userId: 'pro-1', from: 'projectChat' };
    let r = await renderLoaded(Screen);
    fireEvent.press(r.getByTestId('profile-back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
    r.unmount();

    mockParams = { userId: 'pro-1' };
    r = await renderLoaded(Screen);
    fireEvent.press(r.getByTestId('profile-back'));
    expect(mockBack).toHaveBeenCalledTimes(1); // unchanged
    expect(mockPush).toHaveBeenCalledWith('/(client)/(tabs)/browse');
  });

  it('with nothing to go back to, the chevron falls back to Browse', async () => {
    mockParams = { userId: 'pro-1', from: 'chat' };
    mockCanGoBack = false;
    const r = await renderLoaded(Screen);
    fireEvent.press(r.getByTestId('profile-back'));
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/(client)/(tabs)/browse');
  });

  it('a client with no professional profile: a basic page with name, Report and Block — not "not found"', async () => {
    load({ profile: null, user: USER });
    const r = await renderLoaded(Screen);
    expect(r.queryByText(en.profile.not_found)).toBeNull();
    expect(r.getByTestId('profile-report')).toBeTruthy();
    expect(r.getByTestId('profile-block')).toBeTruthy();
    // none of the professional page: no "tell us about your project" button
    expect(r.queryByText(en.search.tell_us_about_project)).toBeNull();
  });

  it('a client with no pro profile, opened from a project chat: Report only', async () => {
    load({ profile: null, user: USER });
    mockParams = { userId: 'pro-1', from: 'projectChat' };
    const r = await renderLoaded(Screen);
    expect(r.queryByTestId('profile-block')).toBeNull();
    expect(r.getByTestId('profile-report')).toBeTruthy();
  });

  it('a professional still gets the full page', async () => {
    const r = await renderLoaded(Screen);
    expect(r.getByText(en.search.tell_us_about_project)).toBeTruthy();
  });

  it('a user who does not exist (deleted account): "not found" with Block (not from a project chat)', async () => {
    load({ profile: null, user: null });
    const r = await renderLoaded(Screen);
    expect(r.getByText(en.profile.not_found)).toBeTruthy();
    expect(r.getByTestId('profile-block-fallback')).toBeTruthy();
  });

  it('a deleted account opened from a project chat: "not found", no Block', async () => {
    load({ profile: null, user: null });
    mockParams = { userId: 'pro-1', from: 'projectChat' };
    const r = await renderLoaded(Screen);
    expect(r.getByText(en.profile.not_found)).toBeTruthy();
    expect(r.queryByTestId('profile-block-fallback')).toBeNull();
  });
});
