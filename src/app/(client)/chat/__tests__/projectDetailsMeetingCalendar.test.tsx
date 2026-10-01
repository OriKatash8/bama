import React from 'react';
import { render, act, fireEvent } from '@testing-library/react-native';
import ProjectDetailsScreen from '../project-details';
import { getDocument, queryDocuments } from '@core/firebase/firestore';
import { addMeeting, listenToMeetings } from '@features/chat/services/meetingService';
import en from '@core/i18n/translations/en.json';
import { addMeetingToCalendar, canAddToCalendar } from '@features/chat/utils/addMeetingToCalendar';

/**
 * Meetings on project details: a duration (chips, default an hour), an optional
 * link checked to be a full web address, both shown on the meeting, and
 * "Add to calendar" — the phone's own event sheet, or an .ics file on web
 * (addMeetingToCalendar), hidden on a build without the calendar module.
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
jest.mock('@features/chat/utils/addMeetingToCalendar', () => ({
  canAddToCalendar: jest.fn(() => true),
  addMeetingToCalendar: jest.fn(() => Promise.resolve()),
}));
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


const mockCanAdd = canAddToCalendar as jest.MockedFunction<typeof canAddToCalendar>;
const mockAddToCal = addMeetingToCalendar as jest.MockedFunction<typeof addMeetingToCalendar>;

const MEETING = {
  id: 'm1', projectId: 'p1', title: 'Location scout', date: '2099-01-15', time: '10:00', durationMinutes: 90,
  location: 'Herzl 1', link: 'https://zoom.us/j/1', invitedIds: ['pro-1'], createdBy: 'client-1', createdAt: null,
};

function withMeeting(m: Record<string, unknown> = MEETING) {
  mockListenToMeetings.mockImplementation((_p, cb) => { cb([m as never]); return () => {}; });
}

async function openDetail(r: Awaited<ReturnType<typeof renderLoaded>>, title = 'Location scout') {
  fireEvent.press(r.getAllByText(title)[0]);
}

describe('adding', () => {
  it('saves an hour by default', async () => {
    const r = await renderLoaded();
    await openAndFillRequired(r);
    await act(async () => { fireEvent.press(r.getByTestId('add-meeting-confirm')); });
    expect(mockAddMeeting.mock.calls[0][2]).toEqual(expect.objectContaining({ durationMinutes: 60 }));
  });

  it('saves the chosen duration', async () => {
    const r = await renderLoaded();
    await openAndFillRequired(r);
    expect(r.getByText('90 min')).toBeTruthy();
    fireEvent.press(r.getByTestId('meeting-duration-90'));
    await act(async () => { fireEvent.press(r.getByTestId('add-meeting-confirm')); });
    expect(mockAddMeeting.mock.calls[0][2]).toEqual(expect.objectContaining({ durationMinutes: 90 }));
  });

  it('saves a full link, and leaves it out when empty', async () => {
    const r = await renderLoaded();
    await openAndFillRequired(r);
    fireEvent.changeText(r.getByPlaceholderText(pd.meeting_link_placeholder), ' https://zoom.us/j/1 ');
    await act(async () => { fireEvent.press(r.getByTestId('add-meeting-confirm')); });
    expect(mockAddMeeting.mock.calls[0][2]).toEqual(expect.objectContaining({ link: 'https://zoom.us/j/1' }));

    const r2 = await renderLoaded();
    await openAndFillRequired(r2);
    await act(async () => { fireEvent.press(r2.getByTestId('add-meeting-confirm')); });
    expect(mockAddMeeting.mock.calls[1][2]).not.toHaveProperty('link');
  });

  it('refuses a link that is not a full web address, and says so', async () => {
    const r = await renderLoaded();
    await openAndFillRequired(r);
    fireEvent.changeText(r.getByPlaceholderText(pd.meeting_link_placeholder), 'zoom.us/j/1');
    await act(async () => { fireEvent.press(r.getByTestId('add-meeting-confirm')); });
    expect(mockAddMeeting).not.toHaveBeenCalled();
    expect(r.getByText(pd.meeting_link_invalid)).toBeTruthy();
  });

  it('labels the link optional', async () => {
    const r = await renderLoaded();
    fireEvent.press(r.getByTestId('add-meeting-pill'));
    expect(r.getByText(pd.meeting_link_optional)).toBeTruthy();
  });
});

describe('the meeting', () => {
  it('shows the time range and the link', async () => {
    withMeeting();
    const r = await renderLoaded();
    await openDetail(r);
    expect(r.getByText('10:00–11:30', { exact: false })).toBeTruthy();
    expect(r.getByText('https://zoom.us/j/1')).toBeTruthy();
  });

  it('an older meeting with no duration shows an hour', async () => {
    withMeeting({ ...MEETING, durationMinutes: undefined, link: undefined });
    const r = await renderLoaded();
    await openDetail(r);
    expect(r.getByText('10:00–11:00', { exact: false })).toBeTruthy();
  });

  it('"Add to calendar" hands the meeting to the calendar', async () => {
    withMeeting();
    const r = await renderLoaded();
    await openDetail(r);
    await act(async () => { fireEvent.press(r.getByText(pd.add_to_calendar)); });
    expect(mockAddToCal).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1', durationMinutes: 90 }));
  });

  it('is hidden on a build without the calendar module', async () => {
    mockCanAdd.mockReturnValue(false);
    withMeeting();
    const r = await renderLoaded();
    await openDetail(r);
    expect(r.queryByText(pd.add_to_calendar)).toBeNull();
    mockCanAdd.mockReturnValue(true);
  });
});
