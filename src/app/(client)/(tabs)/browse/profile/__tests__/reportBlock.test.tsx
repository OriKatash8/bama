import React from 'react';
import { Alert, Modal, Text } from 'react-native';
import { render, act, fireEvent } from '@testing-library/react-native';
import en from '@core/i18n/translations/en.json';
import ClientBrowseProfileScreen from '../[userId]';
import ProBrowseProfileScreen from '../../../../../(professional)/(tabs)/browse/profile/[userId]';
import { getDocument } from '@core/firebase/firestore';
import { addDoc } from 'firebase/firestore';

/**
 * REPORT AND BLOCK WORK ON A LOADED PROFILE.
 *
 * Block's sheet used to be rendered only in the loading branch, so on a
 * profile that had loaded, tapping Block set state nothing showed.
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

beforeEach(() => {
  mockGetDocument.mockImplementation(async (path: string) =>
    path.includes('/profile/') ? { bio: '', equipment: [], roleSkills: [] } : { id: 'pro-1', displayName: 'Dana', photoURL: null });
});

async function renderLoaded(Screen: React.ComponentType) {
  const r = render(<Screen />);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return r;
}

const reportOpen = (r: ReturnType<typeof render>) =>
  r.UNSAFE_getAllByType(Modal).some((m) => m.props.visible && r.UNSAFE_root.findAllByType(Text).length >= 0 && JSON.stringify(m.props.children ? 1 : 0) && m.findAllByType(Text).some((t) => t.props.children === en.report.title));

it.each([
  ['client', ClientBrowseProfileScreen],
  ['pro', ProBrowseProfileScreen],
])('on the %s browse profile, Block opens the block sheet for that user', async (_mode, Screen) => {
  const r = await renderLoaded(Screen);
  expect(r.queryByTestId('block-sheet')).toBeNull();
  fireEvent.press(r.getByTestId('profile-block'));
  expect(r.getByTestId('block-sheet').props.children).toBe('pro-1');
});

it.each([
  ['client', ClientBrowseProfileScreen],
  ['pro', ProBrowseProfileScreen],
])('on the %s browse profile, Report opens the report form', async (_mode, Screen) => {
  const r = await renderLoaded(Screen);
  expect(reportOpen(r)).toBe(false);
  fireEvent.press(r.getByTestId('profile-report'));
  expect(reportOpen(r)).toBe(true);
});

it.each([
  ['client', ClientBrowseProfileScreen],
  ['pro', ProBrowseProfileScreen],
])('on the %s browse profile, a report that fails to send says so, not "min 20 characters"', async (_mode, Screen) => {
  (addDoc as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'permission-denied' }));
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const r = await renderLoaded(Screen);
  fireEvent.press(r.getByTestId('profile-report'));
  fireEvent.changeText(r.getByPlaceholderText(en.report.reason_placeholder), 'He kept messaging me after I asked him to stop.');
  await act(async () => { fireEvent.press(r.getByText(en.report.submit)); });
  expect(alert).toHaveBeenCalledWith(en.report.failed_title, en.report.failed);
  alert.mockRestore();
});
