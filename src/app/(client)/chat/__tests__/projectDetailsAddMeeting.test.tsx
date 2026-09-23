import React from 'react';
import { render, act, fireEvent } from '@testing-library/react-native';
import ProjectDetailsScreen from '../project-details';
import { getDocument, queryDocuments } from '@core/firebase/firestore';
import { addMeeting, listenToMeetings } from '@features/chat/services/meetingService';
import en from '@core/i18n/translations/en.json';

/**
 * Add meeting on project details: a title, a date and at least one invitee are
 * required. The hour and the location are optional.
 *
 * A meeting saved without them still stores `time: ''` and `location: ''`
 * rather than leaving the fields out: the meetings listener orders by `time`,
 * and Firestore drops documents that lack an orderBy field, so a meeting with
 * no time field would silently never appear.
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
const mockAddMeeting = addMeeting as jest.MockedFunction<typeof addMeeting>;
const mockListenToMeetings = listenToMeetings as jest.MockedFunction<typeof listenToMeetings>;
const pd = en.project_details;

beforeEach(() => {
  jest.clearAllMocks();
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

async function renderLoaded() {
  const r = render(<ProjectDetailsScreen />);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return r;
}

async function openAndFillRequired(r: Awaited<ReturnType<typeof renderLoaded>>) {
  fireEvent.press(r.getByTestId('add-meeting-pill'));
  fireEvent.changeText(r.getByPlaceholderText(pd.meeting_title_placeholder), 'Kickoff');
  // The label and the empty picker row both read "Date"; the row is the last one.
  const dateTexts = r.getAllByText(pd.meeting_date);
  fireEvent.press(dateTexts[dateTexts.length - 1]); // opens the (mocked) calendar
  fireEvent.press(r.getByText('pick-date'));
  // The name is also on the member card; the invitee row in the sheet is the last one.
  const names = r.getAllByText('Name pro-1');
  fireEvent.press(names[names.length - 1]);
}

it('labels the hour and the location as optional', async () => {
  const r = await renderLoaded();
  fireEvent.press(r.getByTestId('add-meeting-pill'));
  expect(r.getByText(pd.meeting_time_optional)).toBeTruthy();
  expect(r.getByText(pd.meeting_location_optional)).toBeTruthy();
});

it('adds a meeting with no hour and no location, storing both as empty strings', async () => {
  const r = await renderLoaded();
  await openAndFillRequired(r);
  const confirm = r.getByTestId('add-meeting-confirm');
  expect(confirm.props.accessibilityState?.disabled).toBeFalsy();
  await act(async () => { fireEvent.press(confirm); });
  expect(mockAddMeeting).toHaveBeenCalledTimes(1);
  expect(mockAddMeeting.mock.calls[0][2]).toEqual(expect.objectContaining({
    title: 'Kickoff', date: '2099-01-15', time: '', location: '', invitedIds: ['pro-1'],
  }));
});

it('still keeps the title, date and invitees required', async () => {
  const r = await renderLoaded();
  fireEvent.press(r.getByTestId('add-meeting-pill'));
  fireEvent.changeText(r.getByPlaceholderText(pd.meeting_title_placeholder), 'Kickoff');
  await act(async () => { fireEvent.press(r.getByTestId('add-meeting-confirm')); });
  expect(mockAddMeeting).not.toHaveBeenCalled();
});

it('shows a meeting with no hour or location without an empty clock row', async () => {
  mockListenToMeetings.mockImplementation((_p, cb) => {
    cb([{ id: 'm1', projectId: 'p1', title: 'No time yet', date: '2099-01-15', time: '', location: '',
      invitedIds: ['pro-1'], createdBy: 'client-1', createdAt: null } as never]);
    return () => {};
  });
  const r = await renderLoaded();
  expect(r.getByText('No time yet')).toBeTruthy();
  expect(r.queryByTestId('meeting-time-row')).toBeNull();
  expect(r.queryByTestId('meeting-location-row')).toBeNull();
});

it('a past meeting with no hour still counts as past, so the upcoming one shows first', async () => {
  mockListenToMeetings.mockImplementation((_p, cb) => {
    cb([
      { id: 'old', projectId: 'p1', title: 'Last year', date: '2020-01-01', time: '', location: '',
        invitedIds: ['pro-1'], createdBy: 'client-1', createdAt: null },
      { id: 'new', projectId: 'p1', title: 'Upcoming', date: '2099-01-15', time: '10:00', location: '',
        invitedIds: ['pro-1'], createdBy: 'client-1', createdAt: null },
    ] as never);
    return () => {};
  });
  const r = await renderLoaded();
  // The carousel shows one meeting at a time: upcoming first, past ones after.
  expect(r.getByText('Upcoming')).toBeTruthy();
  expect(r.queryByText('Last year')).toBeNull();
});
