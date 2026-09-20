import React from 'react';
import { render, act, fireEvent } from '@testing-library/react-native';
import ProjectDetailsScreen from '../project-details';
import { getDocument, queryDocuments } from '@core/firebase/firestore';
import { listenToMeetings, deleteMeeting } from '@features/chat/services/meetingService';
import { listenToMissions, deleteMission } from '@features/chat/services/missionService';
import { confirmDialog } from '@utils/confirmDialog';
import en from '@core/i18n/translations/en.json';

/**
 * Finished work can be cleared away: a done mission and a meeting that has
 * already happened say so in their title, and their detail sheet carries the
 * trash that removes them. Work still ahead offers no such thing.
 */

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ projectId: 'p1' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
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
  deleteMeeting: jest.fn(() => Promise.resolve()),
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
jest.mock('@utils/confirmDialog', () => ({ confirmDialog: jest.fn(() => Promise.resolve(true)) }));
jest.mock('@features/reviews/components/ReviewFlow', () => ({ ReviewFlow: () => null }));
jest.mock('@features/chat/components/ChatMediaSection', () => ({ ChatMediaSection: () => null }));
jest.mock('@features/crew/components', () => ({
  // The calendar is a real picker in the app; here one press picks a fixed day.
  MiniCalendar: ({ onSelect }: { onSelect: (iso: string) => void }) => {
    const { Text } = require('react-native');
    return <Text onPress={() => onSelect('2099-01-15')}>pick-date</Text>;
  },
  MiniTimePicker: () => null, RolePickerModal: () => null,
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
  status: 'open',
  deadline: '2099-12-31',
  location: '',
  description: '',
  crewSlots: [],
  createdAt: { seconds: 1_700_000_000, nanoseconds: 0 },
  professionalIds: ['pro-1'],
  slotHolders: ['pro-1'],
  filledSlots: [{ professionalId: 'pro-1', category: 'Editor', subcategory: 'Video Editor', slotIndex: 0 }],
};

const mockGetDocument = getDocument as jest.MockedFunction<typeof getDocument>;
const mockQueryDocuments = queryDocuments as jest.MockedFunction<typeof queryDocuments>;
const mockListenToMeetings = listenToMeetings as jest.MockedFunction<typeof listenToMeetings>;
const pd = en.project_details;

beforeEach(() => {
  jest.clearAllMocks();
  mockConfirm.mockResolvedValue(true);
  mockGetDocument.mockImplementation(async (path: string) => {
    if (path === 'projects/p1') return project as never;
    if (path.startsWith('users/')) {
      const id = path.split('/')[1];
      return { id, displayName: `Name ${id}`, photoURL: null } as never;
    }
    return null;
  });
  mockQueryDocuments.mockImplementation(async () => [] as never);
  mockListenToMeetings.mockImplementation(() => () => {});
});


const mockListenToMissions = listenToMissions as jest.MockedFunction<typeof listenToMissions>;
const mockDeleteMission = deleteMission as jest.MockedFunction<typeof deleteMission>;
const mockDeleteMeeting = deleteMeeting as jest.MockedFunction<typeof deleteMeeting>;
const mockConfirm = confirmDialog as jest.MockedFunction<typeof confirmDialog>;

const PAST = '2020-01-15';
const FUTURE = '2099-01-15';

function withMission(status: 'todo' | 'done') {
  mockListenToMissions.mockImplementation(((_p: string, cb: (m: unknown[]) => void) => {
    cb([{ id: 'm1', title: 'Deliver cut', status, assignedTo: ['pro-1'], projectId: 'p1' }]);
    return () => {};
  }) as never);
}
function withMeeting(date: string) {
  mockListenToMeetings.mockImplementation(((_p: string, cb: (m: unknown[]) => void) => {
    cb([{ id: 'mt1', title: 'Kickoff', date, time: '10:00', location: '', invitedIds: ['pro-1'], projectId: 'p1' }]);
    return () => {};
  }) as never);
}

async function renderLoaded() {
  const r = render(<ProjectDetailsScreen />);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return r;
}

it('a done mission says it can be closed, and the sheet\'s trash removes it', async () => {
  withMission('done');
  const r = await renderLoaded();
  const title = r.getByText(`Deliver cut - ${pd.tap_to_close}`);

  await act(async () => { fireEvent.press(title); });
  await act(async () => { fireEvent.press(r.getByTestId('mission-close')); });
  expect(mockDeleteMission).toHaveBeenCalledWith('p1', 'm1');
});

it('a mission still to do neither says it nor offers the trash', async () => {
  withMission('todo');
  const r = await renderLoaded();
  expect(r.getByText('Deliver cut')).toBeTruthy();
  expect(r.queryByText(`Deliver cut - ${pd.tap_to_close}`)).toBeNull();
  await act(async () => { fireEvent.press(r.getByText('Deliver cut')); });
  expect(r.queryByTestId('mission-close')).toBeNull();
});

it('a meeting that already happened says it can be closed, and its trash removes it', async () => {
  withMeeting(PAST);
  const r = await renderLoaded();
  await act(async () => { fireEvent.press(r.getByText(`Kickoff - ${pd.tap_to_close}`)); });
  await act(async () => { fireEvent.press(r.getByTestId('meeting-close')); });
  expect(mockDeleteMeeting).toHaveBeenCalledWith('p1', 'mt1');
});

it('a meeting still ahead neither says it nor offers the trash', async () => {
  withMeeting(FUTURE);
  const r = await renderLoaded();
  expect(r.queryByText(`Kickoff - ${pd.tap_to_close}`)).toBeNull();
  await act(async () => { fireEvent.press(r.getByText('Kickoff')); });
  expect(r.queryByTestId('meeting-close')).toBeNull();
});

it('asks before closing, and keeps the mission when the answer is no', async () => {
  mockConfirm.mockResolvedValue(false);
  withMission('done');
  const r = await renderLoaded();
  await act(async () => { fireEvent.press(r.getByText(`Deliver cut - ${pd.tap_to_close}`)); });
  await act(async () => { fireEvent.press(r.getByTestId('mission-close')); });
  expect(mockConfirm).toHaveBeenCalledTimes(1);
  expect(mockDeleteMission).not.toHaveBeenCalled();
  // The sheet stays open, so the trash is still there to try again.
  expect(r.getByTestId('mission-close')).toBeTruthy();
});

it('asks before closing a past meeting too', async () => {
  mockConfirm.mockResolvedValue(false);
  withMeeting(PAST);
  const r = await renderLoaded();
  await act(async () => { fireEvent.press(r.getByText(`Kickoff - ${pd.tap_to_close}`)); });
  await act(async () => { fireEvent.press(r.getByTestId('meeting-close')); });
  expect(mockDeleteMeeting).not.toHaveBeenCalled();
});
