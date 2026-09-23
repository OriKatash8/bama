import React from 'react';
import { render, act } from '@testing-library/react-native';
import ProjectDetailsScreen from '../project-details';
import { getDocument, queryDocuments } from '@core/firebase/firestore';
import { listenToProjectFee } from '@features/pricing/services/feesService';
import { useAuthStore } from '@core/stores/authStore';
import { CLIENT_TAB_ACTIVE, PRO_TAB_ACTIVE } from '@core/navigation/floatingTabBar';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * In the pro app this page is BLUE, everywhere it was purple.
 *
 * The screen has one file and it lives under (client) — both apps push to
 * `/(client)/chat/project-details`. useModeAccent used to read the route's
 * section rather than the viewer's mode, so a professional opening project
 * details got the client's purple on every button, icon and outline.
 *
 * TWO HALVES, because neither covers the other.
 *
 * The render half asserts over the WHOLE serialised tree rather than per prop:
 * the accent reaches dozens of elements and several children fetch it
 * themselves (MemberRow calls useModeAccent directly), so checking the call
 * sites written today would miss the next one. But it only sees what the
 * default render puts on screen — everything inside a closed bottom sheet is
 * invisible to it. Putting a purple literal back on a sheet icon passed it.
 *
 * So the source half backs it up: the file must not name the client's accent at
 * all. Colour comes from useModeAccent, wherever on the page it is used.
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


/** Every colour the client app uses that must not survive into the pro app. */
const CLIENT_PURPLES = [CLIENT_TAB_ACTIVE, '#6D28D9', '#F3EEFE'];

const SCREEN = readFileSync(join(__dirname, '..', 'project-details.tsx'), 'utf8');

async function renderAs(mode: 'client' | 'professional') {
  useAuthStore.setState({ activeMode: mode });
  const r = render(<ProjectDetailsScreen />);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return r;
}

/** Hex comparison is case-insensitive; the file mixes #ffffff and #FFFFFF. */
const tree = (r: { toJSON: () => unknown }) => JSON.stringify(r.toJSON()).toLowerCase();

describe('a professional viewing project details', () => {
  it('has no client purple left anywhere on the page', async () => {
    const r = await renderAs('professional');
    // The page really did load — otherwise an empty tree passes vacuously.
    expect(tree(r)).toContain('name pro-1');

    for (const purple of CLIENT_PURPLES) {
      expect(tree(r)).not.toContain(purple.toLowerCase());
    }
  });

  it('uses the pro blue instead', async () => {
    const r = await renderAs('professional');
    expect(tree(r)).toContain(PRO_TAB_ACTIVE.toLowerCase());
  });
});

describe('a client viewing project details', () => {
  it('still gets purple, and none of the pro blue', async () => {
    // The anchor. Without it, a page that rendered everything in grey — or
    // nothing at all — would satisfy every assertion above.
    const r = await renderAs('client');
    expect(tree(r)).toContain('name pro-1');
    expect(tree(r)).toContain(CLIENT_TAB_ACTIVE.toLowerCase());
    expect(tree(r)).not.toContain(PRO_TAB_ACTIVE.toLowerCase());
  });
});

describe('the page never names a mode colour itself', () => {
  it('hardcodes neither accent, anywhere in the file', () => {
    // The render half above cannot see inside a closed sheet, and most of this
    // page's icons live in one. A literal here is a colour that will not follow
    // the mode no matter who is looking.
    for (const hex of [CLIENT_TAB_ACTIVE, PRO_TAB_ACTIVE, '#F3EEFE', '#E6EDFC']) {
      expect(SCREEN.toLowerCase()).not.toContain(hex.toLowerCase());
    }
  });

  it('takes both the accent and its tint from the hook', () => {
    // The tint is the wash behind a selected row, whose border is already the
    // accent — the two must come from the same place or they disagree in pro.
    expect(SCREEN).toMatch(/const \{ accent: modeAccent, tint: modeTint \} = useModeAccent\(\);/);
    expect(SCREEN).toMatch(/backgroundColor: modeTint/);
  });
});
