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

/**
 * Where the end-date reminder lands. Sweep 4b tells the client "the project ends
 * in two days — change the date if it is wrong" and routes them to this screen;
 * these assert that what it asks for is actually possible when they arrive.
 */
describe('the end-date reminder has somewhere to land', () => {
  async function renderScreen() {
    const r = render(<ProjectDetailsScreen />);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    return r;
  }

  it('shows the client what the date will do', async () => {
    const { queryByText } = await renderScreen();
    expect(queryByText(en.builder.end_date_note)).toBeTruthy();
  });

  it('says plainly that a flexible project never closes on its own', async () => {
    mockGetDocument.mockImplementation(async (path: string) => {
      if (path === 'projects/p1') return { ...project, deadline: 'flexible' } as never;
      if (path.startsWith('users/')) {
        const id = path.split('/')[1];
        return { id, displayName: `Name ${id}`, photoURL: null } as never;
      }
      return null;
    });
    const { queryByText } = await renderScreen();
    expect(queryByText(en.builder.flexible_no_autocomplete)).toBeTruthy();
    expect(queryByText(en.builder.end_date_note)).toBeNull();
  });

  it('does not put the client’s date control in front of a professional', async () => {
    // The date is the client's to move. A professional reading "it will close on
    // its own" as an instruction would be reading someone else's control.
    mockViewer.uid = 'pro-1';
    const { queryByText } = await renderScreen();
    expect(queryByText(en.builder.end_date_note)).toBeNull();
  });
});

/**
 * The client's accelerator. The Phase 4 inversion took the gate away from them —
 * each professional closes their own part, and the end date closes the rest — so
 * the one thing this copy must never do is imply their approval is required.
 */
describe('the client accelerator does not read as an approval', () => {
  async function renderScreen() {
    const r = render(<ProjectDetailsScreen />);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    return r;
  }

  it('offers the action in terms of closing, not of confirming', async () => {
    const { queryByText } = await renderScreen();
    expect(queryByText(en.project_details.mark_complete)).toBeTruthy();
    // The words that would reintroduce the gate. "Confirm" and "approve" describe
    // answering somebody's request; nobody is requesting anything of the client.
    expect(queryByText(/\bConfirm\b/)).toBeNull();
    expect(queryByText(/\bapprove\b/i)).toBeNull();
  });

  it('never shows the accelerator to a professional', async () => {
    mockViewer.uid = 'pro-1';
    const { queryByText } = await renderScreen();
    expect(queryByText(en.project_details.mark_complete)).toBeNull();
  });

  it('states plainly that it is optional, and what happens otherwise', () => {
    // Asserted on the strings rather than by opening the modal, which needs the
    // fee calculation to resolve: the invariant is the WORDING, and it is the
    // thing a future copy pass could quietly undo.
    expect(en.project_details.close_now_body).toMatch(/don’t have to/i);
    expect(en.project_details.close_now_body).toContain('{{date}}');
    // The flexible case is a different sentence, not the same one with a blank:
    // with no end date nothing closes by itself, so promising a date would be a
    // promise the project cannot keep.
    expect(en.project_details.close_now_body_flexible).not.toContain('{{date}}');
    expect(en.project_details.close_now_body_flexible).toMatch(/no end date/i);
    // And neither may mention a fee — the client is never told a professional
    // owes BAMA money (§6).
    for (const copy of [en.project_details.close_now_body, en.project_details.close_now_body_flexible]) {
      expect(copy).not.toMatch(/fee|commission|₪/i);
    }
  });
});

/**
 * THE DOOR TO THE BALANCE SCREEN.
 *
 * Step 4 fixed that screen's row filter and left both entry points to it gated on
 * `owed > 0`. A `didnt_happen` contest zeroes the fee, so the row was correctly
 * kept and there was no longer any way to reach it — a filter fixed one layer in
 * while the layer outside kept the old predicate, which is worse than not fixing
 * it: the data is right and unreachable.
 *
 * Asserted at the SCREEN, not on showsOnBalance. A unit test on the predicate
 * cannot see a call site that stopped calling it — verified by reverting this
 * exact line to `owed > 0` and watching every unit test still pass.
 */
describe('the balance screen stays reachable after a contest', () => {
  /** Contested with didnt_happen: fee voided to zero, still open business. */
  const contested = {
    professionalId: 'pro-1', feeStatus: 'owed', feeRate: 0.03,
    baseAmount: 4000, minFeeApplied: 6, slotActive: true,
    engagementStatus: 'disputed', feeDue: 0, status: 'not_owed',
  };

  async function renderAsPro(f: unknown) {
    mockViewer.uid = 'pro-1';
    mockListenToProjectFee.mockImplementation((_p, _u, callback) => {
      callback(f as never);
      return () => {};
    });
    const r = render(<ProjectDetailsScreen />);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    return r;
  }

  it('offers the balance entry on a contested engagement worth ₪0', async () => {
    const { queryAllByText } = await renderAsPro(contested);
    expect(queryAllByText(en.project_details.pay_fee)).toHaveLength(1);
  });

  it('offers it on a completed engagement awaiting charge with nothing owed', async () => {
    const { queryAllByText } = await renderAsPro({
      ...contested,
      engagementStatus: 'completed', feeDue: 0, feePaid: true, status: 'paid',
      chargeDueAt: { seconds: Math.floor(Date.now() / 1000) + 3 * 86400, nanoseconds: 0 },
    });
    expect(queryAllByText(en.project_details.pay_fee)).toHaveLength(1);
  });

  it('still hides it once the engagement is genuinely settled and closed', async () => {
    // The gate must not become "always on" — that would be a different bug with
    // the same shape, and this suite would otherwise not notice.
    const { queryByText } = await renderAsPro({
      ...contested,
      engagementStatus: 'completed', feeDue: 0, feePaid: true, status: 'paid',
    });
    expect(queryByText(en.project_details.pay_fee)).toBeNull();
  });

  it('never offers it to the client', async () => {
    mockViewer.uid = 'client-1';
    const r = render(<ProjectDetailsScreen />);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(r.queryByText(en.project_details.pay_fee)).toBeNull();
  });
});
