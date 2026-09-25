import React from 'react';
import { render, act, fireEvent } from '@testing-library/react-native';
import ProjectDetailsScreen from '../project-details';
import { getDocument, queryDocuments } from '@core/firebase/firestore';
import { updateDoc } from 'firebase/firestore';

/**
 * ADD PROFESSIONAL ON PROJECT DETAILS REACHES THE NOTICEBOARD.
 *
 * It used to write `crewSlots: arrayUnion(...newSlots)`. arrayUnion skips an
 * element equal to one already stored, so adding a second "camera ×1" to a
 * project that had one wrote nothing: the screen showed the new role (it
 * patched its own state), the board never did. The whole merged array is
 * written now, with a same-kind slot's quantity raised instead of a duplicate.
 *
 * A project sent directly to one pro is shown on the board to that pro only.
 * Adding roles means the client wants more people, so it goes public:
 * targetProfessionalId is cleared.
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

let project: Record<string, unknown>;

const mockGetDocument = getDocument as jest.MockedFunction<typeof getDocument>;
const mockQueryDocuments = queryDocuments as jest.MockedFunction<typeof queryDocuments>;
const mockUpdateDoc = updateDoc as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
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
  mockUpdateDoc.mockResolvedValue(undefined);
});

async function addCamera() {
  const r = render(<ProjectDetailsScreen />);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  fireEvent.press(r.getByText('+ Add professional'));
  await act(async () => { fireEvent.press(r.getByText('post-camera')); });
  expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
  return mockUpdateDoc.mock.calls[0][1] as Record<string, unknown>;
}

it('raises the quantity of a role the project already has, and reopens it', async () => {
  const updates = await addCamera();

  expect(updates.crewSlots).toEqual([{ category: 'Video Photographer', quantity: 2 }]);
  expect(updates.status).toBe('open');
});

it('does not touch targetProfessionalId on a board project', async () => {
  const updates = await addCamera();

  expect(updates).not.toHaveProperty('targetProfessionalId');
});

it('makes a direct project public', async () => {
  project.targetProfessionalId = 'pro-1';

  const updates = await addCamera();

  expect(updates.targetProfessionalId).toBeNull();
});
