import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import ProfessionalChatsScreen from '../index';
import { addDoc } from 'firebase/firestore';
import en from '@core/i18n/translations/en.json';

/**
 * The community request form takes one or more categories (chips, no maximum) and
 * needs at least one. It writes `categories` plus the legacy `category` (= the first),
 * so an older admin build still reads one.
 */

const mockToast = jest.fn();

jest.mock('react-native-reanimated', () => require('../../../../../testing/reanimatedMock').reanimatedMock());
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  SafeAreaInsetsContext: require('react').createContext(null),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ tab: 'communities' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useSegments: () => ['(professional)'],
}));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('@core/firebase/storage', () => ({ uploadFile: jest.fn() }));
jest.mock('@core/firebase/config', () => ({ db: {} }));
jest.mock('@core/firebase/firestore', () => ({ setDocument: jest.fn() }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn((_db, name: string) => name),
  addDoc: jest.fn(() => Promise.resolve({ id: 'req1' })),
  serverTimestamp: jest.fn(() => 'TS'),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  onSnapshot: jest.fn(() => () => {}),
  getDocs: jest.fn(() => Promise.resolve({ docs: [] })),
  doc: jest.fn(),
  updateDoc: jest.fn(),
  increment: jest.fn(),
  arrayUnion: jest.fn(),
}));
jest.mock('@features/courses/components/SubmitCourseModal', () => ({ SubmitCourseModal: () => null }));
jest.mock('@features/courses/components/CourseFilterSheet', () => ({ CourseFilterSheet: () => null }));
jest.mock('@features/chat/screens/ChatsScreen', () => ({ ChatsScreen: () => null }));
jest.mock('@features/chat/hooks/useUserChats', () => ({ useUserChats: () => ({ chats: [], loading: false }) }));
jest.mock('@features/chat/components/CommunityDiscoveryTab', () => ({ CommunityDiscoveryTab: () => null }));
jest.mock('@components/empty-state/AnimatedEmptyState', () => ({ AnimatedEmptyState: () => null }));
jest.mock('@core/contact/useBamaMail', () => ({ useBamaMail: () => ({ open: jest.fn() }) }));
jest.mock('@core/navigation/floatingTabBar', () => ({
  useTabBarHeight: () => 80, TAB_BAR_CONTENT_GAP: 12, FAB_SIZE: 56,
  useModeAccent: () => ({ accent: '#1D4ED8' }),
  useTabBarClearance: () => 80,
}));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: unknown) => unknown) => s({ user: { id: 'u1', displayName: 'Rona' }, activeMode: 'professional' }),
}));
jest.mock('@core/stores/demoStore', () => ({ useDemoStore: (s: (x: unknown) => unknown) => s({}) }));
jest.mock('@core/stores/uiStore', () => ({
  useUiStore: Object.assign(
    (s?: (x: unknown) => unknown) => (s ? s({ showToast: mockToast }) : { showToast: mockToast }),
    { getState: () => ({ showToast: mockToast }) },
  ),
}));

const mockAddDoc = addDoc as jest.Mock;

async function openForm() {
  const r = render(<ProfessionalChatsScreen />);
  await act(async () => {});
  // The "+" button opens the request modal.
  fireEvent.press(r.getByTestId('community-request-fab'));
  fireEvent.changeText(r.getByPlaceholderText(en.communities.name_placeholder), 'Sony shooters');
  fireEvent.changeText(r.getByPlaceholderText(en.communities.description_placeholder), 'For Sony users');
  return r;
}

beforeEach(() => { mockAddDoc.mockClear(); mockToast.mockClear(); });

it('needs at least one category', async () => {
  const r = await openForm();
  await act(async () => { fireEvent.press(r.getByText(en.communities.submit)); });
  expect(mockAddDoc).not.toHaveBeenCalled();
  expect(mockToast).toHaveBeenCalledWith(en.communities.category_required, 'error');
});

it('takes several categories and sends them all, plus the legacy first one', async () => {
  const r = await openForm();
  fireEvent.press(r.getByTestId('comm-category-Still Photographer'));
  fireEvent.press(r.getByTestId('comm-category-Video Photographer'));
  fireEvent.press(r.getByTestId('comm-category-Editor'));
  await act(async () => { fireEvent.press(r.getByText(en.communities.submit)); });
  const payload = mockAddDoc.mock.calls[0][1];
  expect(payload.categories).toEqual(['Video Photographer', 'Still Photographer', 'Editor']);
  expect(payload.category).toBe('Video Photographer');
});

it('a chip toggles off again', async () => {
  const r = await openForm();
  fireEvent.press(r.getByTestId('comm-category-Editor'));
  expect(r.getByTestId('comm-category-Editor').props.accessibilityState.checked).toBe(true);
  fireEvent.press(r.getByTestId('comm-category-Editor'));
  expect(r.getByTestId('comm-category-Editor').props.accessibilityState.checked).toBe(false);
});
