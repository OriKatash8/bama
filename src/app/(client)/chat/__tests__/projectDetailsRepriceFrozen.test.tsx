import React from 'react';
import { render, act } from '@testing-library/react-native';
import ProjectDetailsScreen from '../project-details';
import { getDocument, queryDocuments } from '@core/firebase/firestore';
import { listenToProjectFee } from '@features/pricing/services/feesService';
import en from '@core/i18n/translations/en.json';

/**
 * A finished engagement is frozen, AT THE SCREEN.
 *
 * `createPaymentRequest` refuses once a professional has marked their part
 * finished, so a live "Update" button on their row can only ever tap into an
 * error. Both viewers are covered, because each learns of the finish a
 * different way: the professional from their own fee document, the client — who
 * may not read one (§6) — from `endedEngagementIds` on the project.
 *
 * Every case asserts the button's PRESENCE on an open engagement as well as its
 * absence on a finished one. Without that half, a screen that renders no buttons
 * at all passes the whole file.
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

const mockViewer = { uid: 'client-1' };
jest.mock('@core/firebase/config', () => ({
  db: {},
  get auth() { return { currentUser: mockViewer }; },
}));
jest.mock('@core/firebase/functions', () => ({ callFunction: () => jest.fn() }));
// The phone row asks a callable once a part has ended; not what this file tests.
jest.mock('@features/projects/hooks/useRevealedPhone', () => ({ useRevealedPhone: () => null }));
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
  listenToMeetings: jest.fn(noop), addMeeting: jest.fn(),
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
  MiniCalendar: () => null, MiniTimePicker: () => null, RolePickerModal: () => null,
}));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (selector: (s: { language: string }) => unknown) => selector({ language: 'en' }),
}));
jest.mock('@core/stores/uiStore', () => ({
  useUiStore: () => ({ showToast: jest.fn() }),
}));

const PROS = ['pro-1', 'pro-2'];

/** `endedEngagementIds` is set per test; everything else is fixed. */
const projectState: { endedEngagementIds?: string[] } = {};

const project = () => ({
  clientId: 'client-1',
  title: 'Two-camera shoot',
  status: 'open',
  deadline: '2026-08-31',
  location: 'Tel Aviv',
  description: '',
  crewSlots: [],
  createdAt: { seconds: 1_700_000_000, nanoseconds: 0 },
  professionalIds: PROS,
  slotHolders: PROS,
  filledSlots: PROS.map((professionalId, i) => ({
    professionalId, category: 'Editor', subcategory: 'Video Editor', slotIndex: i,
  })),
  ...(projectState.endedEngagementIds ? { endedEngagementIds: projectState.endedEngagementIds } : {}),
});

/** An accepted offer each. MemberRow renders no price block — and therefore no
 *  Update button — without one, so these are what makes the positive half real. */
const OFFERS = PROS.map((professionalId, i) => ({
  id: `o${i}`, projectId: 'p1', professionalId, price: 4000 + i * 500,
  status: 'accepted', category: 'Editor', bundleId: null,
}));

const mockGetDocument = getDocument as jest.MockedFunction<typeof getDocument>;
const mockQueryDocuments = queryDocuments as jest.MockedFunction<typeof queryDocuments>;
const mockListenToProjectFee = listenToProjectFee as jest.MockedFunction<typeof listenToProjectFee>;

beforeEach(() => {
  jest.clearAllMocks();
  mockViewer.uid = 'client-1';
  delete projectState.endedEngagementIds;
  mockGetDocument.mockImplementation(async (path: string) => {
    if (path === 'projects/p1') return project() as never;
    if (path.startsWith('users/')) {
      const id = path.split('/')[1];
      return { id, displayName: `Name ${id}`, photoURL: null } as never;
    }
    return null;
  });
  mockQueryDocuments.mockImplementation(async () => OFFERS as never);
  mockListenToProjectFee.mockImplementation(() => () => {});
});

async function renderLoaded() {
  const r = render(<ProjectDetailsScreen />);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return r;
}

describe('the client', () => {
  it('may update the price while both professionals are still working', async () => {
    const { queryAllByText } = await renderLoaded();
    expect(queryAllByText('Name pro-1')).toHaveLength(1);
    expect(queryAllByText(en.project_details.update)).toHaveLength(2);
  });

  it('loses the button for the professional who finished, and keeps the other', async () => {
    projectState.endedEngagementIds = ['pro-1'];
    const { queryAllByText } = await renderLoaded();
    // Both rows are still on screen — finishing does not un-hire anyone.
    expect(queryAllByText('Name pro-1')).toHaveLength(1);
    expect(queryAllByText('Name pro-2')).toHaveLength(1);
    // ...but only the one still working can be repriced.
    expect(queryAllByText(en.project_details.update)).toHaveLength(1);
  });

  it('loses it for everyone once both have finished', async () => {
    projectState.endedEngagementIds = PROS;
    const { queryAllByText } = await renderLoaded();
    expect(queryAllByText(en.project_details.update)).toHaveLength(0);
  });

  it('keeps the button on a project the derivation has never stamped', async () => {
    // A legacy project carries no `endedEngagementIds` at all. A missing array
    // must read as "nobody has finished" — reading it as "everybody has" would
    // silently take the button away from every project written before this.
    delete projectState.endedEngagementIds;
    const { queryAllByText } = await renderLoaded();
    expect(queryAllByText(en.project_details.update)).toHaveLength(2);
  });
});

describe('the professional, on their own row', () => {
  const fee = (engagementStatus: string) => ({
    professionalId: 'pro-1', feeStatus: 'owed', feeRate: 0.03,
    baseAmount: 4000, minFeeApplied: 6, slotActive: true, engagementStatus,
  });

  function viewAs(engagementStatus: string) {
    mockViewer.uid = 'pro-1';
    mockListenToProjectFee.mockImplementation((_projectId, _proId, callback) => {
      callback(fee(engagementStatus) as never);
      return () => {};
    });
  }

  it('may update their own price while hired', async () => {
    viewAs('hired');
    const { queryAllByText } = await renderLoaded();
    // Only their OWN row carries a price block, so exactly one button.
    expect(queryAllByText(en.project_details.update)).toHaveLength(1);
  });

  it('loses it once they have marked their part finished', async () => {
    viewAs('completed');
    const { queryAllByText } = await renderLoaded();
    expect(queryAllByText(en.project_details.update)).toHaveLength(0);
  });

  it('does not get it back by contesting the fee', async () => {
    // A contest puts the fee in front of a human; it does not reopen the work.
    viewAs('disputed');
    const { queryAllByText } = await renderLoaded();
    expect(queryAllByText(en.project_details.update)).toHaveLength(0);
  });

  it('loses it from their own fee even before the project cache catches up', async () => {
    // applyDerivedProjectState is deliberately not atomic, so `endedEngagementIds`
    // can lag their completion by a round trip. Their own engagement is the
    // authority on their own row.
    viewAs('completed');
    delete projectState.endedEngagementIds;
    const { queryAllByText } = await renderLoaded();
    expect(queryAllByText(en.project_details.update)).toHaveLength(0);
  });
});
