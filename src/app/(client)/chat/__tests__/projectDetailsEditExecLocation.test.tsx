import React from 'react';
import { render, act, fireEvent } from '@testing-library/react-native';
import ProjectDetailsScreen from '../project-details';
import { getDocument, queryDocuments } from '@core/firebase/firestore';
import { calculateProjectFee } from '@features/chat/services/paymentService';
import { updateDoc } from 'firebase/firestore';
import en from '@core/i18n/translations/en.json';

/**
 * THE CLIENT EDITS THE START DATE AND THE LOCATION ON PROJECT DETAILS, not only
 * the end date. Each card wears the pencil and opens its picker — a calendar
 * for the start date (today → the end date), the city list for the location.
 * The professional sees the same cards, not editable.
 */

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ projectId: 'p1' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useNavigation: () => ({ getState: () => undefined }),
  useSegments: () => ['(client)'],
}));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(), MediaTypeOptions: { Images: 'Images' },
}));

// The client is signed in. Every scoping predicate on the screen keys off this
// uid matching project.clientId.
// Switchable, so the same fixture can be rendered through both viewers' eyes.
// The pro's view is not decoration: a test that only ever asserts absence is
// satisfied by a screen that renders nothing at all.
const mockViewer = { uid: 'client-1' };
jest.mock('@core/firebase/config', () => ({
  db: {},
  get auth() { return { currentUser: mockViewer }; },
}));
jest.mock('@core/firebase/functions', () => ({ callFunction: () => jest.fn() }));
jest.mock('@core/firebase/storage', () => ({ uploadFile: jest.fn() }));
jest.mock('firebase/firestore', () => ({
  doc: jest.fn(), updateDoc: jest.fn(), arrayUnion: jest.fn(),
  serverTimestamp: jest.fn(), addDoc: jest.fn(), collection: jest.fn(),
  deleteField: jest.fn(),
  onSnapshot: jest.fn(() => () => {}),
}));

const noop = () => () => {};
jest.mock('@core/firebase/firestore', () => ({
  getDocument: jest.fn(),
  queryDocuments: jest.fn(),
  where: jest.fn(),
}));
jest.mock('@features/pricing/services/feesService', () => ({ listenToProjectFee: jest.fn(noop) }));
jest.mock('@features/chat/services/paymentService', () => ({
  calculateProjectFee: jest.fn(), listenToPaymentRequests: jest.fn(noop),
  createPaymentRequest: jest.fn(), respondToPaymentRequest: jest.fn(),
}));
jest.mock('@features/chat/services/missionService', () => ({
  listenToMissions: jest.fn(noop), addMission: jest.fn(),
  updateMissionStatus: jest.fn(), deleteMission: jest.fn(),
}));
jest.mock('@features/chat/services/meetingService', () => ({
  listenToMeetings: jest.fn(noop), addMeeting: jest.fn(() => Promise.resolve()),
}));
jest.mock('@features/chat/services/removalService', () => ({
  requestRemoval: jest.fn(), acceptRemoval: jest.fn(),
  listenToRemovalRequests: jest.fn(noop), listenToMyRemovalRequest: jest.fn(noop),
}));
jest.mock('@features/projects/services/completionService', () => ({
  markEngagementComplete: jest.fn(), contestEngagement: jest.fn(),
  canDispute: jest.requireActual('@features/projects/utils/completion').canDispute,
  canMarkComplete: jest.requireActual('@features/projects/utils/completion').canMarkComplete,
}));
jest.mock('@features/reviews/components/ReviewFlow', () => ({ ReviewFlow: () => null }));
jest.mock('@features/chat/components/ChatMediaSection', () => ({ ChatMediaSection: () => null }));
// The calendar reports its bounds and picks a fixed day on press.
jest.mock('@features/crew/components', () => ({
  MiniCalendar: ({ onSelect, minDate, maxDate }: { onSelect: (iso: string) => void; minDate?: string; maxDate?: string }) => {
    const { Text } = require('react-native');
    return <Text testID="calendar" onPress={() => onSelect('2099-06-01')}>{`${minDate ?? ''}|${maxDate ?? ''}`}</Text>;
  },
  // One press posts a fixed role, as the real picker does after its two steps.
  MiniTimePicker: () => null,
  RolePickerModal: ({ visible, onPost }: { visible: boolean; onPost: (s: unknown[]) => void }) => {
    const { Text } = require('react-native');
    return visible ? <Text onPress={() => onPost([{ category: 'Video Photographer', quantity: 1 }])}>post-camera</Text> : null;
  },
}));
jest.mock('@features/marketplace/components/CityPickerModal', () => ({
  CityPickerModal: ({ visible, onSelect }: { visible: boolean; onSelect: (c: string) => void }) => {
    const { Text } = require('react-native');
    return visible ? <Text testID="city-picker" onPress={() => onSelect('Haifa')}>cities</Text> : null;
  },
}));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (selector: (s: { language: string }) => unknown) => selector({ language: 'en' }),
}));
jest.mock('@core/stores/uiStore', () => ({
  // Called bare, not with a selector.
  useUiStore: () => ({ showToast: jest.fn() }),
}));

const project = {
  clientId: 'client-1',
  title: 'Shoot',
  status: 'in_progress',
  deadline: '2099-12-31',
  location: 'Tel Aviv',
  exec: '2099-03-01',
  description: '',
  crewSlots: [{ category: 'Video Photographer', quantity: 1 }],
  createdAt: { seconds: 1_700_000_000, nanoseconds: 0 },
  professionalIds: ['pro-1'],
  slotHolders: ['pro-1'],
  filledSlots: [{ professionalId: 'pro-1', category: 'Video Photographer', slotIndex: 0 }],
};

const mockGetDocument = getDocument as jest.MockedFunction<typeof getDocument>;
const mockQueryDocuments = queryDocuments as jest.MockedFunction<typeof queryDocuments>;
const mockUpdateDoc = updateDoc as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetDocument.mockImplementation(async (path: string) => {
    if (path === 'projects/p1') return project as never;
    if (path.startsWith('users/')) return { id: path.split('/')[1], displayName: 'Name', photoURL: null } as never;
    return null;
  });
  mockQueryDocuments.mockImplementation(async () => [] as never);
  (calculateProjectFee as jest.Mock).mockResolvedValue({
    slots: [{ professionalId: 'pro-1', displayName: 'Avi', amount: 1000 }], subtotal: 1000,
  });
});

async function renderScreen() {
  const r = render(<ProjectDetailsScreen />);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return r;
}

afterEach(() => { mockViewer.uid = 'client-1'; });

it('the client moves the start date, between today and the end date', async () => {
  const r = await renderScreen();
  expect(r.getByTestId('edit-exec-badge')).toBeTruthy();
  expect(r.getByText('01/03/99')).toBeTruthy();
  await act(async () => { fireEvent.press(r.getByTestId('meta-exec')); });

  const today = new Date();
  const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  expect(r.getByTestId('calendar').props.children).toBe(`${todayISO}|2099-12-31`);

  await act(async () => { fireEvent.press(r.getByTestId('calendar')); });
  expect(mockUpdateDoc).toHaveBeenCalledWith(undefined, { exec: '2099-06-01' });
  // The card shows the new date straight away.
  expect(r.getByText('01/06/99')).toBeTruthy();
});

it('the client changes the location from the city list', async () => {
  const r = await renderScreen();
  expect(r.getByTestId('edit-location-badge')).toBeTruthy();
  await act(async () => { fireEvent.press(r.getByTestId('meta-location')); });
  await act(async () => { fireEvent.press(r.getByTestId('city-picker')); });

  expect(mockUpdateDoc).toHaveBeenCalledWith(undefined, { location: 'Haifa' });
  expect(r.getByText('Haifa')).toBeTruthy();
});

it('the professional sees both cards, with no pencil and nothing to open', async () => {
  mockViewer.uid = 'pro-1';
  const r = await renderScreen();
  expect(r.queryByTestId('edit-exec-badge')).toBeNull();
  expect(r.queryByTestId('edit-location-badge')).toBeNull();
  await act(async () => { fireEvent.press(r.getByTestId('meta-exec')); });
  await act(async () => { fireEvent.press(r.getByTestId('meta-location')); });
  expect(r.queryByTestId('calendar')).toBeNull();
  expect(r.queryByTestId('city-picker')).toBeNull();
});
