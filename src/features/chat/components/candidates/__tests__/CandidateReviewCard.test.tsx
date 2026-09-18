import React from 'react';
import { Alert, Platform, StyleSheet } from 'react-native';
import { render, act, fireEvent } from '@testing-library/react-native';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

let mockLang = 'en';
let mockUsers: Record<string, unknown> = {};
let mockAccepted: { offers: unknown[]; bundles: unknown[] } = { offers: [], bundles: [] };
let mockRequests: unknown[] = [];
let mockPushAccepted: (d: unknown) => void = () => {};
const mockPush = jest.fn();
const mockToast = jest.fn();
const mockConfirm = jest.fn();
const mockReject = jest.fn();
const mockCreatePR = jest.fn();
const mockDialog = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (sel: (s: { language: string }) => unknown) => sel({ language: mockLang }),
}));
jest.mock('@core/stores/uiStore', () => ({
  useUiStore: (sel: (s: { showToast: unknown }) => unknown) => sel({ showToast: mockToast }),
}));
jest.mock('@utils/confirmDialog', () => ({ confirmDialog: (...a: unknown[]) => mockDialog(...a) }));
jest.mock('@core/firebase/firestore', () => ({ subscribeToCollection: jest.fn() }));
jest.mock('@core/firebase/functions', () => ({ callFunction: () => jest.fn() }));
jest.mock('@core/firebase/config', () => ({ db: {}, auth: {} }));
jest.mock('firebase/firestore', () => ({ where: jest.fn(), doc: jest.fn(), getDoc: jest.fn() }));
jest.mock('../../../hooks/useUserBasics', () => ({ useUserBasics: () => mockUsers }));
jest.mock('../../../services/paymentService', () => ({
  listenToPaymentRequests: (_p: string, _u: string, cb: (r: unknown[]) => void) => { cb(mockRequests); return () => {}; },
  createPaymentRequest: (...a: unknown[]) => mockCreatePR(...a),
}));
jest.mock('../../../services/candidateService', () => {
  const actual = jest.requireActual('../../../services/candidateService');
  return {
    ...actual,
    listenToAcceptedOffers: (_p: string, _pro: string | null, cb: (d: unknown) => void) => { mockPushAccepted = cb; cb(mockAccepted); return () => {}; },
    confirmCandidate: (...a: unknown[]) => mockConfirm(...a),
    rejectCandidate: (...a: unknown[]) => mockReject(...a),
  };
});

import { CandidateReviewCard } from '../CandidateReviewCard';
const { SLIDE_MS } = jest.requireActual('../carousel');

const CLIENT = 'client-1';
const offer = (professionalId: string, over: Record<string, unknown> = {}) => ({
  id: `o-${professionalId}-${String(over.category ?? 'Editor')}`, projectId: 'p1', professionalId, category: 'Editor',
  price: 500, status: 'accepted', review: 'pending', createdAt: null, ...over,
});
const named = { 'pro-a': { displayName: 'Avi', photoURL: null }, 'pro-b': { displayName: 'Beni', photoURL: null } };

async function renderCard() {
  const r = render(<CandidateReviewCard projectId="p1" chatId="c1" clientId={CLIENT} />);
  await act(async () => {});
  return r;
}
const disabled = (el: { props: { accessibilityState?: { disabled?: boolean } } }) => !!el.props.accessibilityState?.disabled;
/**
 * Paging is animated — the card is carried off before the next one is swapped
 * in — so a press only lands once both halves of the slide have run.
 */
const settle = async () => {
  await act(async () => { await new Promise((done) => setTimeout(done, SLIDE_MS * 2 + 60)); });
};
/** Two pending professionals render as a carousel: page to the next one. */
const next = async (r: Pick<ReturnType<typeof render>, 'getByTestId'>) => {
  await act(async () => { fireEvent.press(r.getByTestId('carousel-next')); });
  await settle();
};
const prev = async (r: Pick<ReturnType<typeof render>, 'getByTestId'>) => {
  await act(async () => { fireEvent.press(r.getByTestId('carousel-prev')); });
  await settle();
};

beforeEach(() => {
  jest.clearAllMocks();
  mockLang = 'en';
  mockUsers = named;
  mockAccepted = { offers: [offer('pro-a'), offer('pro-b', { category: 'Sound Recordist', price: 300 })], bundles: [] };
  mockRequests = [];
  mockDialog.mockResolvedValue(true);
  mockConfirm.mockResolvedValue({ ok: true, confirmed: 1, activated: false });
  mockReject.mockResolvedValue({ ok: true, dmSent: true, activated: false });
});

it('renders nothing when nobody is under review', async () => {
  mockAccepted = { offers: [offer('pro-a', { review: 'confirmed' }), offer('pro-b', { status: 'removed' })], bundles: [] };
  const { toJSON } = await renderCard();
  expect(toJSON()).toBeNull();
});

it('a single professional under review: one row, no carousel', async () => {
  mockAccepted = { offers: [offer('pro-a')], bundles: [] };
  const { getByTestId, getByText, queryByTestId } = await renderCard();
  expect(getByTestId('candidate-row-pro-a')).toBeTruthy();
  expect(getByText('Avi')).toBeTruthy();
  expect(queryByTestId('candidate-carousel')).toBeNull();
  expect(queryByTestId('carousel-prev')).toBeNull();
  expect(queryByTestId('carousel-dots')).toBeNull();
});

it("a rejected candidate's removed offer (stale review: 'pending') is not shown", async () => {
  mockAccepted = { offers: [offer('pro-a'), offer('pro-b', { status: 'removed' })], bundles: [] };
  const { queryByTestId } = await renderCard();
  expect(queryByTestId('candidate-row-pro-b')).toBeNull();
});

describe('a name that has not resolved locks the row', () => {
  it('unresolved: placeholder name and all three actions disabled', async () => {
    mockUsers = { 'pro-b': named['pro-b'] };
    const r = await renderCard();
    expect(r.getByTestId('candidate-name-pro-a').props.children).toBe(en.candidate_review.name_loading);
    for (const id of ['relevant', 'not-relevant', 'price']) expect(disabled(r.getByTestId(`candidate-${id}-pro-a`))).toBe(true);
    await next(r);
    for (const id of ['relevant', 'not-relevant', 'price']) expect(disabled(r.getByTestId(`candidate-${id}-pro-b`))).toBe(false);
  });

  it('missing user doc (null): stays disabled', async () => {
    mockUsers = { ...named, 'pro-a': null };
    const { getByTestId } = await renderCard();
    expect(disabled(getByTestId('candidate-relevant-pro-a'))).toBe(true);
    expect(disabled(getByTestId('candidate-not-relevant-pro-a'))).toBe(true);
  });

  it('enables once the name arrives', async () => {
    mockUsers = {};
    const r = await renderCard();
    expect(disabled(r.getByTestId('candidate-relevant-pro-a'))).toBe(true);
    mockUsers = named;
    r.rerender(<CandidateReviewCard projectId="p1" chatId="c1" clientId={CLIENT} />);
    await act(async () => {});
    expect(disabled(r.getByTestId('candidate-relevant-pro-a'))).toBe(false);
  });
});

describe('blocked by a pending price change', () => {
  it('waiting on the professional: informational line, רלוונטי and שינוי מחיר disabled, לא רלוונטי enabled', async () => {
    mockRequests = [{ id: 'r1', professionalId: 'pro-a', fromUserId: CLIENT, toUserId: 'pro-a', status: 'pending' }];
    const r = await renderCard();
    expect(r.getByTestId('candidate-waiting-pro-pro-a').props.children).toBe('Waiting for Avi to answer');
    expect(r.queryByTestId('candidate-answer-pro-a')).toBeNull();
    expect(disabled(r.getByTestId('candidate-relevant-pro-a'))).toBe(true);
    expect(disabled(r.getByTestId('candidate-price-pro-a'))).toBe(true);
    expect(disabled(r.getByTestId('candidate-not-relevant-pro-a'))).toBe(false);
    await next(r);
    expect(disabled(r.getByTestId('candidate-relevant-pro-b'))).toBe(false);
  });

  it('waiting on the client: an action line that opens the payments section', async () => {
    mockRequests = [{ id: 'r2', professionalId: 'pro-b', fromUserId: 'pro-b', toUserId: CLIENT, status: 'pending' }];
    const r = await renderCard();
    await next(r);
    const { getByTestId, queryByTestId } = r;
    expect(queryByTestId('candidate-waiting-pro-pro-b')).toBeNull();
    expect(disabled(getByTestId('candidate-relevant-pro-b'))).toBe(true);
    await act(async () => { fireEvent.press(getByTestId('candidate-answer-pro-b')); });
    expect(mockPush).toHaveBeenCalledWith('/(client)/(tabs)/chats/project-details?projectId=p1&chatId=c1&section=payments');
  });

  it('a pending change on ANOTHER role of the same professional still blocks רלוונטי', async () => {
    mockAccepted = { offers: [offer('pro-a'), offer('pro-a', { category: 'Sound Recordist' })], bundles: [] };
    mockRequests = [{ id: 'r3', professionalId: 'pro-a', category: 'Sound Recordist', fromUserId: CLIENT, toUserId: 'pro-a', status: 'pending' }];
    const { getByTestId } = await renderCard();
    expect(disabled(getByTestId('candidate-relevant-pro-a'))).toBe(true);
  });
});

describe('רלוונטי', () => {
  it('asks through confirmDialog, then confirms and toasts', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const { getByTestId } = await renderCard();
    await act(async () => { fireEvent.press(getByTestId('candidate-relevant-pro-a')); });
    expect(mockDialog).toHaveBeenCalledWith('Confirm Avi?', expect.stringContaining('₪500'), expect.objectContaining({ destructive: false }));
    expect(mockConfirm).toHaveBeenCalledWith('p1', 'pro-a');
    expect(mockToast).toHaveBeenCalledWith('Avi is confirmed', 'success');
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('a cancelled dialog confirms nothing', async () => {
    mockDialog.mockResolvedValue(false);
    const { getByTestId } = await renderCard();
    await act(async () => { fireEvent.press(getByTestId('candidate-relevant-pro-a')); });
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('a server refusal becomes a readable toast, not a code', async () => {
    mockConfirm.mockRejectedValue(new Error('price-change-pending'));
    const { getByTestId } = await renderCard();
    await act(async () => { fireEvent.press(getByTestId('candidate-relevant-pro-a')); });
    expect(mockToast).toHaveBeenCalledWith("There's an open price change with Avi", 'error');
  });
});

describe('לא רלוונטי', () => {
  it('opens the reason sheet and sends the trimmed reason', async () => {
    const r = await renderCard();
    await next(r);
    const { getByTestId } = r;
    await act(async () => { fireEvent.press(getByTestId('candidate-not-relevant-pro-b')); });
    fireEvent.changeText(getByTestId('reject-reason-input'), '  different style  ');
    await act(async () => { fireEvent.press(getByTestId('reject-confirm')); });
    expect(mockReject).toHaveBeenCalledWith('p1', 'pro-b', 'different style');
    expect(mockToast).toHaveBeenCalledWith('Beni was removed from the project', 'success');
  });

  it('tells the client when the reason could not be delivered', async () => {
    mockReject.mockResolvedValue({ ok: true, dmSent: false, activated: false });
    const r = await renderCard();
    await next(r);
    const { getByTestId } = r;
    await act(async () => { fireEvent.press(getByTestId('candidate-not-relevant-pro-b')); });
    fireEvent.changeText(getByTestId('reject-reason-input'), 'x');
    await act(async () => { fireEvent.press(getByTestId('reject-confirm')); });
    expect(mockToast).toHaveBeenCalledWith("Beni was removed, but the reason couldn't be delivered", 'error');
  });
});

it('שינוי מחיר sends a per-role request for the chosen role', async () => {
  const r = await renderCard();
    await next(r);
    const { getByTestId } = r;
  await act(async () => { fireEvent.press(getByTestId('candidate-price-pro-b')); });
  fireEvent.changeText(getByTestId('price-amount-input'), '350');
  await act(async () => { fireEvent.press(getByTestId('price-send')); });
  expect(mockCreatePR).toHaveBeenCalledWith('p1', expect.objectContaining({
    professionalId: 'pro-b', category: 'Sound Recordist', proposedAmount: 350,
  }));
});

describe('direction', () => {
  it.each([['he', 'row-reverse'], ['en', 'row']])('%s rows flow %s', async (lang, dir) => {
    mockLang = lang;
    const { getByTestId, getByText, getAllByText } = await renderCard();
    expect(StyleSheet.flatten(getByTestId('candidate-identity-pro-a').props.style).flexDirection).toBe(dir);
    expect(StyleSheet.flatten(getByTestId('candidate-actions-pro-a').props.style).flexDirection).toBe(dir);
    const tr = lang === 'he' ? he : en;
    expect(getByText(tr.candidate_review.title)).toBeTruthy();
    // One professional shown at a time — exact match, and 'לא רלוונטי' does not count.
    expect(getAllByText(tr.candidate_review.relevant)).toHaveLength(1);
  });
});

describe('lines that carry a name set their writing direction explicitly', () => {
  // A line whose first word is a name takes its direction from that name unless
  // told otherwise: an English line starting with a Hebrew name rendered RTL on web.
  it.each([['en', 'ltr'], ['he', 'rtl']])('%s → %s', async (lang, dir) => {
    mockLang = lang;
    mockRequests = [
      { id: 'r1', professionalId: 'pro-a', fromUserId: CLIENT, toUserId: 'pro-a', status: 'pending' },
      { id: 'r2', professionalId: 'pro-b', fromUserId: 'pro-b', toUserId: CLIENT, status: 'pending' },
    ];
    const r = await renderCard();
    expect(StyleSheet.flatten(r.getByTestId('candidate-waiting-pro-pro-a').props.style).writingDirection).toBe(dir);
    expect(StyleSheet.flatten(r.getByTestId('candidate-name-pro-a').props.style).writingDirection).toBe(dir);
    await next(r);
    const answerLine = r.getByTestId('candidate-answer-pro-b');
    const text = answerLine.findAll((n: { props: { style?: unknown } }) =>
      (StyleSheet.flatten(n.props.style as never) as { writingDirection?: string } | undefined)?.writingDirection !== undefined);
    expect(text.length).toBeGreaterThan(0);
    expect(StyleSheet.flatten(text[0].props.style).writingDirection).toBe(dir);
  });
});

it("shows the professional's own רלוונטי as a tag on his row", async () => {
  mockAccepted = { offers: [offer('pro-a', { proAccepted: true }), offer('pro-b', { category: 'Sound Recordist' })], bundles: [] };
  const r = await renderCard();
  expect(r.getByTestId('candidate-pro-accepted-pro-a').props.children).toBe('✓ Avi confirmed');
  await next(r);
  expect(r.getByTestId('candidate-row-pro-b')).toBeTruthy();
  expect(r.queryByTestId('candidate-pro-accepted-pro-b')).toBeNull();
});

describe('carousel (2+ pending)', () => {
  const three = () => ({ offers: [offer('pro-a'), offer('pro-b', { category: 'Sound Recordist', price: 300 }), offer('pro-c', { category: 'Lighting Tech', price: 200 })], bundles: [] });
  beforeEach(() => { mockUsers = { ...named, 'pro-c': { displayName: 'Chen', photoURL: null } }; clock = 1000; });

  it('shows one professional at a time, with dots for position and current', async () => {
    mockAccepted = three();
    const r = await renderCard();
    expect(r.getByTestId('candidate-row-pro-a')).toBeTruthy();
    expect(r.queryByTestId('candidate-row-pro-b')).toBeNull();
    expect(r.getByTestId('carousel-dots').props.accessibilityLabel).toBe('1/3');
    const dot = (i: number) => StyleSheet.flatten(r.getByTestId(`carousel-dot-${i}`).props.style).backgroundColor;
    expect(dot(0)).toBe('#004aad');
    expect(dot(1)).not.toBe('#004aad');
  });

  it('chevrons page through and stop at the ends', async () => {
    mockAccepted = three();
    const r = await renderCard();
    expect(disabled(r.getByTestId('carousel-prev'))).toBe(true);
    await next(r);
    expect(r.getByTestId('candidate-row-pro-b')).toBeTruthy();
    expect(r.getByTestId('carousel-dots').props.accessibilityLabel).toBe('2/3');
    await next(r);
    expect(r.getByTestId('candidate-row-pro-c')).toBeTruthy();
    expect(disabled(r.getByTestId('carousel-next'))).toBe(true);
    await prev(r);
    expect(r.getByTestId('candidate-row-pro-b')).toBeTruthy();
  });

  /**
   * Drives a real horizontal drag through the responder system, so the gesture
   * is exercised as the finger exercises it. Each step needs its own timestamp:
   * PanResponder ignores a move it has already accounted for.
   */
  const START = 200;
  let clock = 1000;
  const touchEvent = (to: number) => {
    clock += 100;
    return {
      nativeEvent: { touches: [{ identifier: 1, pageX: to, pageY: 10, timestamp: clock, target: 1 }], identifier: 1, pageX: to, pageY: 10, timestamp: clock },
      touchHistory: {
        numberActiveTouches: 1, indexOfSingleActiveTouch: 0, mostRecentTimeStamp: clock,
        touchBank: [null, {
          touchActive: true, startPageX: START, startPageY: 10, startTimeStamp: 1000,
          currentPageX: to, currentPageY: 10, currentTimeStamp: clock,
          previousPageX: START, previousPageY: 10, previousTimeStamp: clock - 100,
        }],
      },
    };
  };
  // The responder props are invoked directly: fireEvent does not dispatch
  // responder events, and it is PanResponder's own gesture maths we want to run.
  const handlers = (r: Pick<ReturnType<typeof render>, 'getByTestId'>) =>
    r.getByTestId('candidate-carousel').props as {
      onResponderGrant: (e: unknown) => void;
      onResponderMove: (e: unknown) => void;
      onResponderRelease: (e: unknown) => void;
    };
  const dragBy = async (r: Pick<ReturnType<typeof render>, 'getByTestId'>, dx: number) => {
    const h = handlers(r);
    await act(async () => {
      h.onResponderGrant(touchEvent(START));
      h.onResponderMove(touchEvent(START + dx));
    });
  };
  const releaseAt = async (r: Pick<ReturnType<typeof render>, 'getByTestId'>, dx: number) => {
    await act(async () => { handlers(r).onResponderRelease(touchEvent(START + dx)); });
    await settle();
  };
  const shift = (r: Pick<ReturnType<typeof render>, 'getByTestId'>) =>
    StyleSheet.flatten(r.getByTestId('carousel-slider').props.style).transform[0].translateX;

  it('the card follows the finger, and is carried the rest of the way on release', async () => {
    mockAccepted = three();
    const r = await renderCard();
    await dragBy(r, -45);
    expect(shift(r)).toBe(-45);            // moved with the finger, not after it
    await releaseAt(r, -70);
    expect(r.getByTestId('candidate-row-pro-b')).toBeTruthy();
    expect(shift(r)).toBe(0);              // and came to rest square
  });

  it('dragging back from the first professional resists, and nothing pages', async () => {
    mockAccepted = three();
    const r = await renderCard();
    await dragBy(r, 80);
    expect(shift(r)).toBe(20);             // a quarter of the drag: the end of the list, felt
    await releaseAt(r, 80);
    expect(r.getByTestId('candidate-row-pro-a')).toBeTruthy();
    expect(shift(r)).toBe(0);
  });

  it('dragging on past the last professional resists too, and nothing pages', async () => {
    mockAccepted = three();
    const r = await renderCard();
    await next(r);
    await next(r);                         // showing C, the last one
    await dragBy(r, -80);
    expect(shift(r)).toBe(-20);
    await releaseAt(r, -80);
    expect(r.getByTestId('candidate-row-pro-c')).toBeTruthy();
    expect(shift(r)).toBe(0);
  });

  it('on the web the card claims the horizontal axis, so the browser cannot go back under it', async () => {
    mockAccepted = three();
    const was = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    try {
      const r = await renderCard();
      const style = StyleSheet.flatten(r.getByTestId('candidate-carousel').props.style);
      expect(style.touchAction).toBe('pan-y');
      expect(style.overscrollBehaviorX).toBe('contain');
    } finally {
      Object.defineProperty(Platform, 'OS', { value: was, configurable: true });
    }
  });

  it('a page carries the card off first: the row changes only once the slide has run', async () => {
    mockAccepted = three();
    const r = await renderCard();
    await act(async () => { fireEvent.press(r.getByTestId('carousel-next')); });
    expect(r.getByTestId('candidate-row-pro-a')).toBeTruthy(); // still there, on its way out
    await settle();
    expect(r.getByTestId('candidate-row-pro-b')).toBeTruthy();
  });

  it('the carousel takes horizontal swipes, and the card itself slides', async () => {
    mockAccepted = three();
    const r = await renderCard();
    const props = r.getByTestId('candidate-carousel').props;
    expect(typeof props.onMoveShouldSetResponder).toBe('function');
    // Follows the finger, is carried on release, and goes back if the gesture
    // is taken away mid-drag.
    expect(typeof props.onResponderMove).toBe('function');
    expect(typeof props.onResponderRelease).toBe('function');
    expect(typeof props.onResponderTerminate).toBe('function');
    // The row is what moves; the dots are outside it and stay put.
    const slider = r.getByTestId('carousel-slider');
    expect(StyleSheet.flatten(slider.props.style).transform[0]).toHaveProperty('translateX');
    expect(slider.props.children.props.testID).toBe('candidate-row-pro-a');
  });

  it('buttons act on the shown professional only', async () => {
    mockAccepted = three();
    const r = await renderCard();
    await next(r);
    await act(async () => { fireEvent.press(r.getByTestId('candidate-relevant-pro-b')); });
    expect(mockConfirm).toHaveBeenCalledWith('p1', 'pro-b');
    expect(r.queryByTestId('candidate-relevant-pro-a')).toBeNull();
    expect(r.queryByTestId('candidate-relevant-pro-c')).toBeNull();
  });

  it('when the shown professional is resolved, the next one takes his place (live update)', async () => {
    mockAccepted = three();
    const r = await renderCard();
    await next(r); // showing B (2/3)
    expect(r.getByTestId('candidate-row-pro-b')).toBeTruthy();
    await act(async () => {
      mockPushAccepted({ offers: [offer('pro-a'), offer('pro-b', { review: 'confirmed' }), offer('pro-c', { category: 'Lighting Tech' })], bundles: [] });
    });
    expect(r.queryByTestId('candidate-row-pro-b')).toBeNull();
    expect(r.getByTestId('candidate-row-pro-c')).toBeTruthy(); // advanced, not back to A
    expect(r.getByTestId('carousel-dots').props.accessibilityLabel).toBe('2/2');
  });

  it('when an EARLIER professional is resolved, the shown one stays (live update)', async () => {
    mockAccepted = three();
    const r = await renderCard();
    await next(r);
    await next(r); // showing C (3/3)
    await act(async () => {
      mockPushAccepted({ offers: [offer('pro-a', { status: 'removed' }), offer('pro-b', { category: 'Sound Recordist' }), offer('pro-c', { category: 'Lighting Tech' })], bundles: [] });
    });
    expect(r.getByTestId('candidate-row-pro-c')).toBeTruthy();
    expect(r.getByTestId('carousel-dots').props.accessibilityLabel).toBe('2/2');
  });

  it('down to one pending professional: the carousel goes away', async () => {
    mockAccepted = three();
    const r = await renderCard();
    await act(async () => {
      mockPushAccepted({ offers: [offer('pro-a', { review: 'confirmed' }), offer('pro-b', { status: 'removed' }), offer('pro-c', { category: 'Lighting Tech' })], bundles: [] });
    });
    expect(r.getByTestId('candidate-row-pro-c')).toBeTruthy();
    expect(r.queryByTestId('candidate-carousel')).toBeNull();
  });

  it('resolveShownIndex: the table', async () => {
    const { resolveShownIndex } = jest.requireActual('../carousel');
    expect(resolveShownIndex(['pro-b', 'pro-c'], 'pro-c', 2)).toBe(1); // A resolved while C shown
    expect(resolveShownIndex(['pro-a', 'pro-c'], 'pro-b', 1)).toBe(1); // shown B resolved → C advances in
    expect(resolveShownIndex(['pro-a', 'pro-b'], 'pro-c', 2)).toBe(1); // shown last resolved → clamps to new last
    expect(resolveShownIndex(['pro-a'], 'pro-b', 1)).toBe(0);
  });

  it.each([
    ['en', 'row', 'ChevronLeft', 'ChevronRight'],
    ['he', 'row-reverse', 'ChevronRight', 'ChevronLeft'],
  ])('%s: identity row flows %s; previous chevron is %s, next is %s', async (lang, dir, prevIcon, nextIcon) => {
    mockLang = lang;
    mockAccepted = three();
    const r = await renderCard();
    const identity = r.getByTestId('candidate-identity-pro-a');
    expect(StyleSheet.flatten(identity.props.style).flexDirection).toBe(dir);
    // "previous" is the FIRST child of the row in both languages; row-reverse is
    // what puts it on the right in Hebrew.
    const children = identity.props.children.filter(Boolean);
    expect(children[0].props.testID).toBe('carousel-prev');
    expect(children[children.length - 1].props.testID).toBe('carousel-next');
    const lucide = jest.requireActual('lucide-react-native');
    expect(children[0].props.children.type).toBe(lucide[prevIcon]);
    expect(children[children.length - 1].props.children.type).toBe(lucide[nextIcon]);
    expect(StyleSheet.flatten(r.getByTestId('carousel-dots').props.style).flexDirection).toBe(dir);
  });

  it('is no taller than a single-professional card: the dots line is paid for by row padding', () => {
    const src: string = require('fs').readFileSync(require('path').join(__dirname, '..', 'CandidateReviewCard.tsx'), 'utf8');
    const num = (re: RegExp) => Number((src.match(re) ?? [])[1]);
    const rowPad = num(/row: \{ paddingVertical: (\d+)/);
    const carouselPad = num(/rowCarousel: \{ paddingVertical: (\d+)/);
    const dotsHeight = num(/dots: \{[^}]*height: (\d+)/);
    const dotsMargin = num(/dots: \{[^}]*marginTop: (\d+)/);
    expect(2 * carouselPad + dotsHeight + dotsMargin).toBeLessThanOrEqual(2 * rowPad);
  });
});

describe('the carousel gesture', () => {
  const { carouselPanConfig } = jest.requireActual('../carousel');
  const wire = (over: Record<string, unknown> = {}) => {
    const calls = { drag: [] as number[], step: [] as number[], settle: 0 };
    const cfg = carouselPanConfig({
      locked: () => false,
      rtl: () => false,
      ends: () => ({ atStart: false, atEnd: false }),
      screenWidth: () => 400,
      onDrag: (x: number) => calls.drag.push(x),
      onStep: (s: number) => calls.step.push(s),
      onSettle: () => { calls.settle += 1; },
      ...over,
    });
    return { cfg, calls };
  };

  it('moves the card with the finger, by exactly what was dragged', () => {
    const { cfg, calls } = wire();
    cfg.onPanResponderMove(null, { dx: -30, dy: 2, moveX: 170 });
    cfg.onPanResponderMove(null, { dx: -75, dy: 4, moveX: 125 });
    expect(calls.drag).toEqual([-30, -75]);
  });

  it('at the last professional, a forward drag moves the card only a little', () => {
    const { cfg, calls } = wire({ ends: () => ({ atStart: false, atEnd: true }) });
    cfg.onPanResponderMove(null, { dx: -80, dy: 0, moveX: 120 });
    expect(calls.drag).toEqual([-20]);
  });

  const withSwipeReports = async () => {
    mockAccepted = { offers: [offer('pro-a'), offer('pro-b', { category: 'Sound Recordist' }), offer('pro-c', { category: 'Lighting Tech' })], bundles: [] };
    const swipeable: boolean[] = [];
    const r = render(<CandidateReviewCard projectId="p1" chatId="c1" clientId={CLIENT} onSwipeableChange={(v) => swipeable.push(v)} />);
    await act(async () => {});
    return { r, swipeable, last: () => swipeable[swipeable.length - 1] };
  };

  it('tells the screen when it becomes swipeable, and again when the list shrinks', async () => {
    const { last } = await withSwipeReports();
    expect(last()).toBe(true);
    // Down to one professional: nothing left to page through.
    await act(async () => {
      mockPushAccepted({ offers: [offer('pro-a', { review: 'confirmed' }), offer('pro-b', { status: 'removed' }), offer('pro-c', { category: 'Lighting Tech' })], bundles: [] });
    });
    expect(last()).toBe(false);
  });

  it('gives the screen its gesture back when the card goes away', async () => {
    const { r, last } = await withSwipeReports();
    expect(last()).toBe(true);   // still swipeable at the moment it unmounts
    r.unmount();
    expect(last()).toBe(false);
  });

  it('a single professional never asks the screen to stand down', async () => {
    mockAccepted = { offers: [offer('pro-a')], bundles: [] };
    const swipeable: boolean[] = [];
    render(<CandidateReviewCard projectId="p1" chatId="c1" clientId={CLIENT} onSwipeableChange={(v) => swipeable.push(v)} />);
    await act(async () => {});
    expect(swipeable.some(Boolean)).toBe(false);
  });

  it('decides on where the drag STARTED, not on x0 — which is still 0 while the claim is being made', () => {
    const { cfg } = wire();
    // The shape RN really hands over mid-claim: x0 not filled in yet, moveX
    // current. Reading x0 here put every drag on the left edge and refused
    // the lot, which is exactly how swiping stopped working.
    expect(cfg.onMoveShouldSetPanResponder(null, { dx: -40, dy: 5, moveX: 160, x0: 0 })).toBe(true);
  });

  it('leaves the screen edges to the screen: a drag that starts there is not claimed', () => {
    const { cfg } = wire();
    // Paging the card and swiping the screen away are the same motion; on the
    // edges the screen wins, so going back still works.
    expect(cfg.onMoveShouldSetPanResponder(null, { dx: -40, dy: 5, moveX: -20 })).toBe(false);
    expect(cfg.onMoveShouldSetPanResponder(null, { dx: -40, dy: 5, moveX: 350 })).toBe(false);
    expect(cfg.onMoveShouldSetPanResponder(null, { dx: -40, dy: 5, moveX: 160 })).toBe(true);
  });

  it('never hands the drag back once it has it', () => {
    expect(wire().cfg.onPanResponderTerminationRequest()).toBe(false);
  });

  it('claims clearly horizontal drags only, and never while a slide is playing', () => {
    const { cfg } = wire();
    expect(cfg.onMoveShouldSetPanResponder(null, { dx: -40, dy: 5, moveX: 160 })).toBe(true);
    expect(cfg.onMoveShouldSetPanResponder(null, { dx: -8, dy: 0, moveX: 192 })).toBe(false);  // a tap
    expect(cfg.onMoveShouldSetPanResponder(null, { dx: -20, dy: 30, moveX: 180 })).toBe(false); // scrolling
    const locked = wire({ locked: () => true });
    expect(locked.cfg.onMoveShouldSetPanResponder(null, { dx: -40, dy: 5, moveX: 160 })).toBe(false);
    locked.cfg.onPanResponderMove(null, { dx: -40, dy: 5, moveX: 160 });
    expect(locked.calls.drag).toEqual([]);
  });

  it('on release: a real swipe pages, a short drag falls back', () => {
    const { cfg, calls } = wire();
    cfg.onPanResponderRelease(null, { dx: -60, dy: 0, moveX: 140 });
    expect(calls.step).toEqual([1]);
    cfg.onPanResponderRelease(null, { dx: 60, dy: 0, moveX: 260 });
    expect(calls.step).toEqual([1, -1]);
    cfg.onPanResponderRelease(null, { dx: -20, dy: 0, moveX: 180 });
    expect(calls.step).toEqual([1, -1]);
    expect(calls.settle).toBe(1);
  });

  it('RTL: swiping right pages forward', () => {
    const { cfg, calls } = wire({ rtl: () => true });
    cfg.onPanResponderRelease(null, { dx: 60, dy: 0, moveX: 260 });
    expect(calls.step).toEqual([1]);
  });

  it('a finger lifted mid-slide is ignored: the slide already in flight wins', () => {
    const { cfg, calls } = wire({ locked: () => true });
    cfg.onPanResponderRelease(null, { dx: -60, dy: 0, moveX: 140 });
    cfg.onPanResponderTerminate();
    expect(calls.step).toEqual([]);
    expect(calls.settle).toBe(0);
  });

  it('losing the gesture puts the card back', () => {
    const { cfg, calls } = wire();
    cfg.onPanResponderTerminate();
    expect(calls.settle).toBe(1);
    expect(calls.step).toEqual([]);
  });
});

describe('dragStartX: where the finger went down', () => {
  const { dragStartX } = jest.requireActual('../carousel');
  it('works it back from where the finger is now', () => {
    expect(dragStartX({ moveX: 260, dx: 10 })).toBe(250);
    expect(dragStartX({ moveX: 140, dx: -60 })).toBe(200);
    expect(dragStartX({ moveX: 200, dx: 0 })).toBe(200);
  });
});

describe('startedAtEdge: whose gesture is it', () => {
  const { startedAtEdge, EDGE_PX } = jest.requireActual('../carousel');
  it('the strip along either edge belongs to the screen', () => {
    expect(startedAtEdge(0, 400)).toBe(true);
    expect(startedAtEdge(EDGE_PX, 400)).toBe(true);
    expect(startedAtEdge(400, 400)).toBe(true);
    expect(startedAtEdge(400 - EDGE_PX, 400)).toBe(true);
  });
  it('everything between belongs to the card', () => {
    expect(startedAtEdge(EDGE_PX + 1, 400)).toBe(false);
    expect(startedAtEdge(200, 400)).toBe(false);
    expect(startedAtEdge(400 - EDGE_PX - 1, 400)).toBe(false);
  });
});

describe('pageSwipeGuard: the browser must not read a card swipe as "go back"', () => {
  const { pageSwipeGuard } = jest.requireActual('../carousel');
  it('claims the horizontal axis on the web', () => {
    expect(pageSwipeGuard('web')).toEqual({ touchAction: 'pan-y', overscrollBehaviorX: 'contain' });
  });
  it('leaves native alone', () => {
    expect(pageSwipeGuard('ios')).toBeNull();
    expect(pageSwipeGuard('android')).toBeNull();
  });
});

describe('dragOffset: how far the card follows the finger', () => {
  const { dragOffset } = jest.requireActual('../carousel');
  it('tracks the finger one-to-one when there is somewhere to go', () => {
    expect(dragOffset(-50, false, true, false)).toBe(-50);  // at the start, dragging toward next
    expect(dragOffset(50, false, false, true)).toBe(50);    // at the end, dragging back
    expect(dragOffset(-50, false, false, false)).toBe(-50); // in the middle
  });
  it('resists past the first professional, and past the last', () => {
    expect(dragOffset(60, false, true, false)).toBe(15);    // LTR: back, already first
    expect(dragOffset(-60, false, false, true)).toBe(-15);  // LTR: next, already last
  });
  it('RTL mirrors which end resists', () => {
    expect(dragOffset(60, true, false, true)).toBe(15);     // RTL: right is next, already last
    expect(dragOffset(-60, true, true, false)).toBe(-15);   // RTL: left is back, already first
    expect(dragOffset(60, true, true, false)).toBe(60);     // RTL: right is next, room to go
  });
  it('a single professional at both ends still moves, softly', () => {
    expect(dragOffset(40, false, true, true, 4)).toBe(10);
    expect(dragOffset(-40, false, true, true, 4)).toBe(-10);
  });
});

describe('slidePlan: the card leaves one way, the next arrives from the other', () => {
  const { slidePlan } = jest.requireActual('../carousel');
  it.each([[1, false], [-1, false], [1, true], [-1, true]])('step %s, rtl %s', (step, rtl) => {
    const { out, from } = slidePlan(step, rtl, 300);
    expect(Math.abs(out)).toBe(300);
    expect(from).toBe(-out); // opposite edges, never the same side
  });
});

describe('exitSign: which way the card leaves', () => {
  const { exitSign } = jest.requireActual('../carousel');
  it('LTR: the next card pushes the shown one off to the left', () => {
    expect(exitSign(1, false)).toBe(-1);
    expect(exitSign(-1, false)).toBe(1);
  });
  it('RTL mirrors it', () => {
    expect(exitSign(1, true)).toBe(1);
    expect(exitSign(-1, true)).toBe(-1);
  });
});

describe('swipeStep', () => {
  const { swipeStep } = jest.requireActual('../carousel');
  it('LTR: swipe left → next, swipe right → previous', () => {
    expect(swipeStep(-60, false)).toBe(1);
    expect(swipeStep(60, false)).toBe(-1);
  });
  it('RTL mirrors it: swipe right → next, swipe left → previous', () => {
    expect(swipeStep(60, true)).toBe(1);
    expect(swipeStep(-60, true)).toBe(-1);
  });
  it('short drags do nothing', () => {
    expect(swipeStep(20, false)).toBe(0);
    expect(swipeStep(-39, true)).toBe(0);
  });
});

describe('instruction line', () => {
  it.each([['en', en], ['he', he]])('%s: tells the client to talk with the crew before deciding, single and carousel', async (lang, tr) => {
    mockLang = lang;
    mockAccepted = { offers: [offer('pro-a')], bundles: [] };
    const single = await renderCard();
    expect(single.getByTestId('candidate-instruction').props.children).toBe(tr.candidate_review.client_instruction);
    single.unmount();
    mockAccepted = { offers: [offer('pro-a'), offer('pro-b', { category: 'Sound Recordist' })], bundles: [] };
    const multi = await renderCard();
    expect(multi.getByTestId('candidate-instruction').props.children).toBe(tr.candidate_review.client_instruction);
    const align = StyleSheet.flatten(multi.getByTestId('candidate-instruction').props.style).textAlign;
    expect(align).toBe(lang === 'he' ? 'right' : 'left');
  });
});
