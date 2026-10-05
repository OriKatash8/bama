import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { SharedListingCard } from '../ChatRoomScreen';
import en from '@core/i18n/translations/en.json';
import { useAuthStore } from '@core/stores/authStore';
import { getDoc } from 'firebase/firestore';

/**
 * A listing shared into a community chat. The "view listing" action opens the
 * PROFESSIONAL marketplace, and there is no client one, so it is shown to
 * professionals only. A client-mode member (communities now reach them) still
 * sees the card and its content, just not that button.
 */

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }), Stack: { Screen: () => null }, useFocusEffect: () => {} }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@core/firebase/config', () => ({ db: {}, auth: { currentUser: null }, storage: {}, functions: {} }));
jest.mock('firebase/firestore', () => ({ getDoc: jest.fn(), doc: jest.fn(() => ({})) }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: Object.assign((s: (x: { language: string }) => unknown) => s({ language: 'en' }), { getState: () => ({ language: 'en' }) }),
}));

// ChatRoomScreen's other imports reach native audio/video/picker modules this test does not touch.
jest.mock('expo-audio', () => ({
  useAudioRecorder: () => ({}), useAudioPlayer: () => ({}), useAudioPlayerStatus: () => ({}),
  RecordingPresets: { HIGH_QUALITY: {} }, requestRecordingPermissionsAsync: jest.fn(), setAudioModeAsync: jest.fn(), AudioModule: {},
}));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('@components/ui/VideoPlayer', () => ({ VideoPlayer: () => null }));
jest.mock('@core/hooks/useVideoUpload', () => ({ useVideoUpload: () => ({}) }));
jest.mock('@core/firebase/storage', () => ({ uploadFile: jest.fn() }));
jest.mock('react-native-reanimated', () => require('../../../../testing/reanimatedMock').reanimatedMock());
jest.mock('@core/firebase/functions', () => ({ callFunction: () => jest.fn() }));
jest.mock('firebase/storage', () => ({}));
jest.mock('firebase/auth', () => ({}));
jest.mock('@features/chat/components/ChatVideo', () => ({ ChatVideo: () => null }));

const msg = { id: 'm1', type: 'listing', listingId: 'L1', title: 'Arri Alexa', price: 500, senderId: 'u2', timestamp: null, storeName: 'Rent Co' } as never;
const mockGetDoc = getDoc as jest.Mock;

async function show(mode: 'client' | 'professional', listing: { exists: boolean; status?: string } = { exists: true, status: 'active' }) {
  useAuthStore.setState({ activeMode: mode });
  mockGetDoc.mockResolvedValue({ exists: () => listing.exists, data: () => ({ status: listing.status, type: 'rental' }) });
  const r = render(<SharedListingCard msg={msg} />);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return r;
}

beforeEach(() => jest.clearAllMocks());

it('professional: the card has the "view listing" button, and it opens the marketplace', async () => {
  const r = await show('professional');
  fireEvent.press(r.getByText(en.marketplace.view_listing));
  expect(mockPush).toHaveBeenCalledWith('/(professional)/(tabs)/marketplace?listingId=L1');
});

it('client: the card and its content stay, the button is gone', async () => {
  const r = await show('client');
  expect(r.getByText('Arri Alexa')).toBeTruthy();
  expect(r.queryByText(en.marketplace.view_listing)).toBeNull();
  expect(mockPush).not.toHaveBeenCalled();
});

it('client: an unavailable listing still says so (that is information, not an action)', async () => {
  const r = await show('client', { exists: true, status: 'sold' });
  expect(r.getByText(en.marketplace.listing_unavailable)).toBeTruthy();
  expect(r.queryByText(en.marketplace.view_listing)).toBeNull();
});
