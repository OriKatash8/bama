import React from 'react';
import { render, act, fireEvent } from '@testing-library/react-native';
import ProjectDetailsScreen from '../project-details';
import { getDocument, queryDocuments } from '@core/firebase/firestore';
import { Linking } from 'react-native';
import { listenToProjectFee } from '@features/pricing/services/feesService';

/**
 * THE OTHER SIDE'S PHONE NUMBER, ON PROJECT DETAILS.
 *
 * Private until the professional's part has ended. Then the client sees that
 * pro's number on the pro's card, and the pro sees the client's number on the
 * client's card; tapping it calls. Each card asks only when the viewer can tell
 * it is allowed — the server (getContactPhone) decides for real.
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
const mockPhoneCalls: [string | undefined, string, boolean][] = [];
jest.mock('@features/projects/hooks/useRevealedPhone', () => ({
  useRevealedPhone: (projectId: string | undefined, userId: string, eligible: boolean) => {
    mockPhoneCalls.push([projectId, userId, eligible]);
    return eligible ? (userId === 'client-1' ? '+97231234567' : '+972501234567') : null;
  },
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

let project: Record<string, unknown>;

const mockGetDocument = getDocument as jest.MockedFunction<typeof getDocument>;
const mockQueryDocuments = queryDocuments as jest.MockedFunction<typeof queryDocuments>;
const mockFee = listenToProjectFee as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockPhoneCalls.length = 0;
  mockViewer.uid = 'client-1';
  project = {
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
  mockGetDocument.mockImplementation(async (path: string) => {
    if (path === 'projects/p1') return project as never;
    if (path.startsWith('users/')) {
      const id = path.split('/')[1];
      return { id, displayName: `Name ${id}`, photoURL: null } as never;
    }
    return null;
  });
  mockQueryDocuments.mockImplementation(async () => [] as never);
  mockFee.mockImplementation(() => () => {});
});

async function renderLoaded() {
  const r = render(<ProjectDetailsScreen />);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return r;
}

describe('the client', () => {
  it('sees a pro\'s number once that pro\'s part has ended, and tapping it calls', async () => {
    project.endedEngagementIds = ['pro-1'];
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
    const r = await renderLoaded();

    const row = r.getByTestId('member-phone');
    expect(r.getByText('050-123-4567')).toBeTruthy();
    fireEvent.press(row);
    expect(open).toHaveBeenCalledWith('tel:+972501234567');
    expect(mockPhoneCalls).toContainEqual(['p1', 'pro-1', true]);
    open.mockRestore();
  });

  it('sees nothing while the pro is still working', async () => {
    const r = await renderLoaded();
    expect(r.queryByTestId('member-phone')).toBeNull();
    expect(mockPhoneCalls).toContainEqual(['p1', 'pro-1', false]);
  });
});

describe('the professional', () => {
  beforeEach(() => { mockViewer.uid = 'pro-1'; });

  it('sees the client\'s number once their own part has ended', async () => {
    mockFee.mockImplementation((_p: string, _u: string, cb: (f: unknown) => void) => {
      cb({ engagementStatus: 'completed' });
      return () => {};
    });
    const r = await renderLoaded();
    expect(r.getByText('03-123-4567')).toBeTruthy();
    expect(mockPhoneCalls).toContainEqual(['p1', 'client-1', true]);
  });

  it('sees nothing while their part is still open', async () => {
    mockFee.mockImplementation((_p: string, _u: string, cb: (f: unknown) => void) => {
      cb({ engagementStatus: 'hired' });
      return () => {};
    });
    const r = await renderLoaded();
    expect(r.queryByTestId('member-phone')).toBeNull();
  });
});
