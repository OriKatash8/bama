import React from 'react';
import { render, act } from '@testing-library/react-native';
import ProjectDetailsScreen from '../project-details';
import { getDocument, queryDocuments } from '@core/firebase/firestore';
import { listenToProjectFee } from '@features/pricing/services/feesService';
import en from '@core/i18n/translations/en.json';

/**
 * §6, AT THE SCREEN. A client must never learn what a professional owes BAMA —
 * not the amount, not that one is owed at all — and one professional must never
 * see another's.
 *
 * Deliberately NOT a per-prop assertion. Checking that the MemberRow call site
 * passes `undefined` proves the three lines written today are right; it cannot
 * see a future child that reads the fee from a store, a context, or a second
 * listener. This renders the whole screen as a client, with three hired
 * professionals who all owe money, and asserts that no fee string reaches the
 * output by ANY route.
 *
 * If this fails, do not relax it. It is the one test standing between the client
 * and a number they are contractually not allowed to see.
 */

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ projectId: 'p1' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
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
jest.mock('@features/crew/components', () => ({
  MiniCalendar: () => null, MiniTimePicker: () => null, RolePickerModal: () => null,
}));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (selector: (s: { language: string }) => unknown) => selector({ language: 'en' }),
}));
jest.mock('@core/stores/uiStore', () => ({
  // Called bare, not with a selector.
  useUiStore: () => ({ showToast: jest.fn() }),
}));

const PROS = ['pro-1', 'pro-2', 'pro-3'];

const project = {
  clientId: 'client-1',
  title: 'Three-camera shoot',
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
};

const mockGetDocument = getDocument as jest.MockedFunction<typeof getDocument>;
const mockQueryDocuments = queryDocuments as jest.MockedFunction<typeof queryDocuments>;

/**
 * Accepted price offers, one per professional. NOT optional scenery: `payment`
 * is what makes MemberRow render its price block, and the fee line lives INSIDE
 * that block. With no offers the block never renders, the fee line cannot
 * render either, and every assertion below passes for the wrong reason — which
 * is exactly what happened the first time this test was written.
 */
const OFFERS = PROS.map((professionalId, i) => ({
  id: `o${i}`, projectId: 'p1', professionalId, price: 4000 + i * 500,
  status: 'accepted', bundleId: null,
}));
const mockListenToProjectFee = listenToProjectFee as jest.MockedFunction<typeof listenToProjectFee>;

beforeEach(() => {
  jest.clearAllMocks();
  mockViewer.uid = 'client-1';
  mockGetDocument.mockImplementation(async (path: string) => {
    if (path === 'projects/p1') return project as never;
    if (path.startsWith('users/')) {
      const id = path.split('/')[1];
      return { id, displayName: `Name ${id}`, photoURL: null } as never;
    }
    return null;
  });
  mockQueryDocuments.mockImplementation(async () => OFFERS as never);
  mockListenToProjectFee.mockImplementation(() => () => {});
});

/** Every string the screen can use to say something about a fee. */
const FEE_STRINGS = [
  en.project_details.fee_line,
  en.project_details.fee_line_min,
  en.project_details.fee_included,
  en.project_details.fee_paid,
  en.project_details.pay_fee,
  en.engagement.mark_complete,
  en.engagement.awaiting_client,
  en.engagement.contest,
  en.engagement.contest_open,
];

describe('§6 — the client is never shown a professional’s fee', () => {
  /** Render and let the screen's async load settle, so the assertions run
   *  against the loaded page rather than the spinner — a blank tree would pass
   *  every one of them vacuously. */
  async function renderLoaded() {
    // render() wraps itself in act; nesting a second one unmounts the renderer
    // before the awaited body resolves. Render first, then flush the load.
    const r = render(<ProjectDetailsScreen />);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    return r;
  }

  it('renders no fee text of any kind for three hired professionals who all owe', async () => {
    const { queryByText, toJSON } = await renderLoaded();
    // The page really is loaded and really has the three professionals on it.
    expect(queryByText('Name pro-1')).toBeTruthy();
    expect(queryByText('Name pro-3')).toBeTruthy();
    // The price block IS rendering — this is what the client is allowed to see,
    // and it is the block the fee line would appear inside. Without this the
    // assertions below prove nothing.
    expect(queryByText('₪4,000')).toBeTruthy();

    for (const s of FEE_STRINGS) {
      // The templated ones carry {{vars}}; match on their fixed prefix.
      const literal = s.split('{{')[0].trim();
      if (literal.length < 3) continue;
      expect(
        queryByText(new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))),
      ).toBeNull();
    }

    // Belt and braces, over the whole serialised tree rather than the text
    // queries: the client legitimately sees prices they PAY, so this asserts on
    // the fee vocabulary rather than on the shekel sign.
    const tree = JSON.stringify(toJSON());
    expect(tree).not.toContain('BAMA fee');
    expect(tree).not.toContain('minimum fee');
  });

  it('never subscribes to a fee document while the viewer is the client', async () => {
    // Upstream of the prop guard: if the listener never runs there is no fee in
    // state for any component to read, however it goes looking for one.
    await renderLoaded();
    expect(mockListenToProjectFee).not.toHaveBeenCalled();
  });

  it('offers no engagement action to the client on anybody’s row', async () => {
    // The Step 2 addition, at the screen. `onMarkComplete` is passed through the
    // same predicate as `fee`; this asserts the consequence rather than the prop.
    const { queryByText } = await renderLoaded();
    expect(queryByText(en.engagement.mark_complete)).toBeNull();
    expect(queryByText(en.engagement.awaiting_client)).toBeNull();
    expect(queryByText(en.engagement.contest)).toBeNull();
    expect(queryByText(en.engagement.contest_open)).toBeNull();
  });
});

describe('the professional sees their OWN engagement and nobody else’s', () => {
  const hired = {
    professionalId: 'pro-1', feeStatus: 'owed', feeRate: 0.03,
    baseAmount: 4000, minFeeApplied: 6, slotActive: true,
    engagementStatus: 'hired',
  };

  beforeEach(() => {
    mockViewer.uid = 'pro-1';
    mockListenToProjectFee.mockImplementation((_projectId, _proId, callback) => {
      callback(hired as never);
      return () => {};
    });
  });

  async function renderAsPro() {
    const r = render(<ProjectDetailsScreen />);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    return r;
  }

  it('offers the mark-complete action, once', async () => {
    // The positive half. Without it every assertion in the suite above is
    // satisfied by a screen that renders nothing.
    const { queryAllByText } = await renderAsPro();
    expect(queryAllByText(en.engagement.mark_complete)).toHaveLength(1);
  });

  it('subscribes to exactly one fee document — their own', async () => {
    await renderAsPro();
    expect(mockListenToProjectFee).toHaveBeenCalledTimes(1);
    expect(mockListenToProjectFee).toHaveBeenCalledWith('p1', 'pro-1', expect.any(Function));
  });

  it('shows one fee line, not three', async () => {
    // pro-2 and pro-3 are on the same project and owe their own fees. Neither
    // amount may appear on pro-1's screen.
    const { queryAllByText } = await renderAsPro();
    expect(queryAllByText(/BAMA fee/)).toHaveLength(1);
  });
});

describe('the contest is offered to one professional and to nobody else', () => {
  /** Completed, inside the charge window — the only state that offers a contest. */
  const completed = {
    professionalId: 'pro-1', feeStatus: 'owed', feeRate: 0.03,
    baseAmount: 4000, minFeeApplied: 6, slotActive: false,
    engagementStatus: 'completed',
    chargeDueAt: { seconds: Math.floor(Date.now() / 1000) + 3 * 86400, nanoseconds: 0 },
  };

  beforeEach(() => {
    mockListenToProjectFee.mockImplementation((_projectId, _proId, callback) => {
      callback(completed as never);
      return () => {};
    });
  });

  async function renderScreen() {
    const r = render(<ProjectDetailsScreen />);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    return r;
  }

  it('offers it to the professional whose engagement it is, with the deadline', async () => {
    mockViewer.uid = 'pro-1';
    const { queryAllByText } = await renderScreen();
    expect(queryAllByText(en.engagement.contest)).toHaveLength(1);
    // The deadline is spelled out rather than left to be inferred from a button
    // that will one day quietly stop appearing.
    const prefix = en.engagement.contest_window.split('{{')[0].trim();
    expect(queryAllByText(new RegExp(prefix))).toHaveLength(1);
  });

  it('offers the CLIENT nothing, on any row, even though a fee is live', async () => {
    // mockViewer stays 'client-1'. The fee listener never runs for a client, so
    // there is nothing in state to leak — and the assertion holds at the screen
    // rather than at the prop, which is the point.
    const { queryByText } = await renderScreen();
    expect(queryByText(en.engagement.contest)).toBeNull();
    expect(queryByText(new RegExp(en.engagement.contest_window.split('{{')[0].trim()))).toBeNull();
    expect(queryByText(/BAMA fee/)).toBeNull();
  });
});
