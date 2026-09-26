import React from 'react';
import { render, act, fireEvent, within } from '@testing-library/react-native';
import ProjectDetailsScreen from '../project-details';
import { getDocument, queryDocuments } from '@core/firebase/firestore';
import { StyleSheet } from 'react-native';
import { calculateProjectFee } from '@features/chat/services/paymentService';
import { CLIENT_TAB_ACTIVE } from '@core/navigation/floatingTabBar';
import en from '@core/i18n/translations/en.json';

/**
 * THE "CLOSE THE PROJECT NOW" POP-UP: black text on white, and the confirm
 * button in the mode's colour (purple for a client, blue for a pro) as an
 * outline — it used to have no background at all, leaving a white label on white.
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
  MiniCalendar: () => null,
  // One press posts a fixed role, as the real picker does after its two steps.
  MiniTimePicker: () => null,
  RolePickerModal: ({ visible, onPost }: { visible: boolean; onPost: (s: unknown[]) => void }) => {
    const { Text } = require('react-native');
    return visible ? <Text onPress={() => onPost([{ category: 'Video Photographer', quantity: 1 }])}>post-camera</Text> : null;
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
  location: '',
  description: '',
  crewSlots: [{ category: 'Video Photographer', quantity: 1 }],
  createdAt: { seconds: 1_700_000_000, nanoseconds: 0 },
  professionalIds: ['pro-1'],
  slotHolders: ['pro-1'],
  filledSlots: [{ professionalId: 'pro-1', category: 'Video Photographer', slotIndex: 0 }],
};

const mockGetDocument = getDocument as jest.MockedFunction<typeof getDocument>;
const mockQueryDocuments = queryDocuments as jest.MockedFunction<typeof queryDocuments>;
const pd = en.project_details;
const flat = (n: { props: Record<string, unknown> }) => StyleSheet.flatten(n.props.style as never) as Record<string, unknown>;

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

async function openCloseNow() {
  const r = render(<ProjectDetailsScreen />);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  await act(async () => { fireEvent.press(r.getByText(pd.mark_complete)); });
  return r;
}

it('is a white sheet with black text', async () => {
  const r = await openCloseNow();
  const sheet = r.getByTestId('close-now-sheet');
  expect(flat(sheet).backgroundColor).toBe('#FFFFFF');
  // The title repeats the label of the button that opened it — read it inside the sheet.
  const inSheet = within(sheet);
  expect(flat(inSheet.getByText(pd.payment_summary_title)).color).toBe('#000000');
  // Dated or flexible, the explanation opens the same way.
  expect(flat(inSheet.getByText(new RegExp(`^${pd.close_now_body.split('.')[0]}`))).color).toBe('#000000');
  expect(flat(inSheet.getByText(pd.pay_crew)).color).toBe('#000000');
});

it('the close button is an outline in the mode\'s colour, its label in that colour too', async () => {
  const r = await openCloseNow();
  const btn = flat(r.getByTestId('close-now-confirm'));
  expect(btn.borderColor).toBe(CLIENT_TAB_ACTIVE);
  expect(btn.borderWidth).toBeGreaterThanOrEqual(1.5);
  expect(btn.backgroundColor).toBe('#FFFFFF');
  expect(flat(r.getByText(pd.confirm_complete)).color).toBe(CLIENT_TAB_ACTIVE);
});
