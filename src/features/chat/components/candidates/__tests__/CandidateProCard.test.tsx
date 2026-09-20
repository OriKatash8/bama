import React from 'react';
import { Alert, StyleSheet } from 'react-native';
import { render, act, fireEvent } from '@testing-library/react-native';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

let mockLang = 'en';
let mockAccepted: { offers: unknown[]; bundles: unknown[] } = { offers: [], bundles: [] };
let mockHistory: unknown[] = [];
const mockPush = jest.fn();
const mockToast = jest.fn();
const mockDialog = jest.fn();
const mockAck = jest.fn();
const mockDecline = jest.fn();
const mockCreatePR = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  // The buttons take their colour from the mode the route is in.
  useSegments: () => ['(professional)'],
}));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (sel: (s: { language: string }) => unknown) => sel({ language: mockLang }),
}));
jest.mock('@core/stores/uiStore', () => ({
  useUiStore: (sel: (s: { showToast: unknown }) => unknown) => sel({ showToast: mockToast }),
}));
jest.mock('@utils/confirmDialog', () => ({ confirmDialog: (...a: unknown[]) => mockDialog(...a) }));
jest.mock('firebase/firestore', () => ({ where: jest.fn() }));
jest.mock('@core/firebase/firestore', () => ({ subscribeToCollection: jest.fn() }));
jest.mock('@core/firebase/functions', () => ({ callFunction: () => jest.fn() }));
jest.mock('@core/firebase/config', () => ({ db: {}, auth: {} }));
jest.mock('../../../services/paymentService', () => ({
  createPaymentRequest: (...a: unknown[]) => mockCreatePR(...a),
}));
jest.mock('../../../services/candidateService', () => ({
  ...jest.requireActual('../../../services/candidateService'),
  listenToAcceptedOffers: (_p: string, proId: string | null, cb: (d: unknown) => void) => {
    if (!proId) throw new Error('the pro card must scope the query to the professional');
    cb(mockAccepted); return () => {};
  },
  listenToMyPriceRequestHistory: (_p: string, _u: string, cb: (d: unknown) => void) => { cb(mockHistory); return () => {}; },
  acknowledgeCandidacy: (...a: unknown[]) => mockAck(...a),
  declineCandidacy: (...a: unknown[]) => mockDecline(...a),
}));

import { CandidateProCard } from '../CandidateProCard';

const PRO = 'pro-a';
const offer = (over: Record<string, unknown> = {}) => ({
  id: 'o1', projectId: 'p1', professionalId: PRO, category: 'Editor', price: 500, status: 'accepted', createdAt: null, ...over,
});
const ts = (ms: number) => ({ toMillis: () => ms });
const req = (from: string, status: string, t: number, over: Record<string, unknown> = {}) => ({
  id: `r${t}`, projectId: 'p1', professionalId: PRO, category: 'Editor', fromUserId: from, toUserId: from === PRO ? 'client' : PRO,
  status, createdAt: ts(t), currentAmount: 500, proposedAmount: 600, ...over,
});
async function renderCard(projectStatus = 'open') {
  const r = render(<CandidateProCard projectId="p1" chatId="c1" proId={PRO} projectStatus={projectStatus} />);
  await act(async () => {});
  return r;
}
const disabled = (el: { props: { accessibilityState?: { disabled?: boolean } } }) => !!el.props.accessibilityState?.disabled;

beforeEach(() => {
  jest.clearAllMocks();
  mockLang = 'en';
  mockAccepted = { offers: [offer({ review: 'pending' })], bundles: [] };
  mockHistory = [];
  mockDialog.mockResolvedValue(true);
  mockAck.mockResolvedValue({ ok: true, acknowledged: 1 });
  mockDecline.mockResolvedValue({ ok: true, activated: false });
});

describe('visibility', () => {
  it('nothing for a hire from before the review card', async () => {
    mockAccepted = { offers: [offer()], bundles: [] };
    expect((await renderCard()).toJSON()).toBeNull();
  });
  it('nothing once the project is in progress', async () => {
    expect((await renderCard('in_progress')).toJSON()).toBeNull();
  });
});

describe('under review, not yet acknowledged', () => {
  it('shows his price and the three actions, no status pill', async () => {
    const { getByTestId, queryByTestId } = await renderCard();
    expect(getByTestId('chip-price').props.children[0]).toBe('Your price: ₪500');
    for (const id of ['pro-relevant', 'pro-not-relevant', 'pro-price']) expect(disabled(getByTestId(id))).toBe(false);
    expect(queryByTestId('chip-pending')).toBeNull();
  });

  it('רלוונטי: the dialog warns about the price one-way door, then acknowledges', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const { getByTestId } = await renderCard();
    await act(async () => { fireEvent.press(getByTestId('pro-relevant')); });
    const [title, body, labels] = mockDialog.mock.calls[0];
    expect(title).toBe(en.candidate_review.pro_confirm_title);
    expect(body).toContain("won't be able to propose a new price");
    expect(labels).toEqual(expect.objectContaining({ destructive: false }));
    expect(mockAck).toHaveBeenCalledWith('p1');
    expect(mockToast).toHaveBeenCalledWith(en.candidate_review.pro_confirmed_toast, 'success');
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('לא רלוונטי: destructive "Leave the project?" dialog, then declines; cancel does nothing', async () => {
    const { getByTestId } = await renderCard();
    mockDialog.mockResolvedValueOnce(false);
    await act(async () => { fireEvent.press(getByTestId('pro-not-relevant')); });
    expect(mockDecline).not.toHaveBeenCalled();
    await act(async () => { fireEvent.press(getByTestId('pro-not-relevant')); });
    expect(mockDialog.mock.calls[1][0]).toBe(en.candidate_review.pro_decline_title);
    expect(mockDialog.mock.calls[1][2]).toEqual(expect.objectContaining({ destructive: true }));
    expect(mockDecline).toHaveBeenCalledWith('p1');
  });

  it('a refusal becomes a readable toast', async () => {
    mockDecline.mockRejectedValue(new Error('not-under-review'));
    const { getByTestId } = await renderCard();
    await act(async () => { fireEvent.press(getByTestId('pro-not-relevant')); });
    expect(mockToast).toHaveBeenCalledWith(en.candidate_review.pro_err_not_under_review, 'error');
  });

  it('שינוי מחיר: sends his one unprompted request without a professionalId', async () => {
    const { getByTestId } = await renderCard();
    await act(async () => { fireEvent.press(getByTestId('pro-price')); });
    fireEvent.changeText(getByTestId('price-amount-input'), '650');
    await act(async () => { fireEvent.press(getByTestId('price-send')); });
    expect(mockCreatePR).toHaveBeenCalledWith('p1', { category: 'Editor', proposedAmount: 650, note: undefined });
  });

  it('שינוי מחיר disabled once his unprompted request is used and there is nothing to counter', async () => {
    mockHistory = [req(PRO, 'rejected', 1)];
    const { getByTestId } = await renderCard();
    expect(disabled(getByTestId('pro-price'))).toBe(true);
  });

  it('…enabled again as a counter after he rejects a client proposal', async () => {
    mockHistory = [req(PRO, 'rejected', 1), req('client', 'rejected', 2)];
    const { getByTestId } = await renderCard();
    expect(disabled(getByTestId('pro-price'))).toBe(false);
  });

  it('שינוי מחיר disabled while anything is pending; the client-asked line opens payments', async () => {
    mockHistory = [req('client', 'pending', 1)];
    const { getByTestId } = await renderCard();
    expect(disabled(getByTestId('pro-price'))).toBe(true);
    await act(async () => { fireEvent.press(getByTestId('chip-client-asked')); });
    expect(mockPush).toHaveBeenCalledWith('/(client)/(tabs)/chats/project-details?projectId=p1&chatId=c1&section=payments');
  });

  it('his own pending request reads as waiting on the client', async () => {
    mockHistory = [req(PRO, 'pending', 1)];
    const { getByTestId, queryByTestId } = await renderCard();
    expect(getByTestId('chip-waiting-client')).toBeTruthy();
    expect(queryByTestId('chip-client-asked')).toBeNull();
  });
});

describe('under review, acknowledged', () => {
  beforeEach(() => { mockAccepted = { offers: [offer({ review: 'pending', proAccepted: true })], bundles: [] }; });

  it('no buttons — an amber pill and a note that says WHY he cannot reprice', async () => {
    const { getByTestId, queryByTestId, getByText } = await renderCard();
    expect(queryByTestId('pro-actions')).toBeNull();
    expect(getByTestId('chip-pending')).toBeTruthy();
    expect(getByTestId('pro-acknowledged-note').props.children).toBe(en.candidate_review.pro_acknowledged_note);
    expect(getByText("Waiting for the client's decision")).toBeTruthy();
  });

  it('can still answer a client price change', async () => {
    mockHistory = [req('client', 'pending', 1)];
    const { getByTestId } = await renderCard();
    expect(getByTestId('chip-client-asked')).toBeTruthy();
  });
});

describe('confirmed by the client', () => {
  it('green chip, no actions, no respond-only note', async () => {
    mockAccepted = { offers: [offer({ review: 'confirmed', proAccepted: true })], bundles: [] };
    const { getByTestId, queryByTestId, getByText } = await renderCard();
    expect(getByTestId('chip-confirmed')).toBeTruthy();
    expect(getByText("You're confirmed")).toBeTruthy();
    expect(queryByTestId('pro-actions')).toBeNull();
    expect(queryByTestId('pro-acknowledged-note')).toBeNull();
  });

  it('a bundle is priced once', async () => {
    mockAccepted = {
      offers: [offer({ id: 'x', bundleId: 'b1', price: 400, review: 'confirmed' })],
      bundles: [{ id: 'b1', projectId: 'p1', professionalId: PRO, slots: [{ category: 'Editor' }], bundlePrice: 600, offerIds: ['x'], status: 'accepted', review: 'confirmed' }],
    };
    const { getByTestId } = await renderCard();
    expect(getByTestId('chip-price').props.children[0]).toBe('Your price: ₪600');
  });
});

it.each([['he', 'row-reverse'], ['en', 'row']])('%s: rows flow %s', async (lang, dir) => {
  mockLang = lang;
  const { getByTestId, getAllByText } = await renderCard();
  expect(StyleSheet.flatten(getByTestId('pro-actions').props.style).flexDirection).toBe(dir);
  const tr = lang === 'he' ? he : en;
  expect(getAllByText(tr.candidate_review.relevant)).toHaveLength(1);
});

/**
 * The professional's card is the client's card seen from the other side: the
 * same sections in the same order, and the destructive choice furthest from
 * the thumb.
 */
it('reads header, standing, decision, instructions — with the buttons in the client card s order', async () => {
  const r = await renderCard();
  const order = ['pro-relevant', 'pro-price', 'pro-not-relevant'];
  expect(r.getByTestId('pro-actions').props.children.map((b: { props: { testID: string } }) => b.props.testID)).toEqual(order);
  // Walk the rendered tree: the instructions come after the decision, and the
  // decision after the professional's standing.
  const seen: string[] = [];
  const walk = (n: unknown): void => {
    if (!n || typeof n !== 'object') return;
    const node = n as { props?: { testID?: string }; children?: unknown[] };
    if (node.props?.testID) seen.push(node.props.testID);
    (node.children ?? []).forEach(walk);
  };
  walk(r.toJSON());
  expect(seen.indexOf('chip-price')).toBeLessThan(seen.indexOf('pro-actions'));
  expect(seen.indexOf('pro-actions')).toBeLessThan(seen.indexOf('pro-instruction'));
});

it('wears the mode it is shown in: blue for the professional', async () => {
  const { getByTestId } = await renderCard();
  const styleOf = (id: string) => StyleSheet.flatten(getByTestId(id).props.style);
  expect(styleOf('pro-relevant').backgroundColor).toBe('#1D4ED8');
  expect(styleOf('pro-price').borderColor).toBe('#D4DEF7');
  // Destructive stays red in both modes — it is what it means, not where it is.
  expect(styleOf('pro-not-relevant').borderColor).toBe('#F0D5D7');
});

describe('instruction line', () => {
  it.each([['en', en], ['he', he]])('%s: shown while he still has a decision to make', async (lang, tr) => {
    mockLang = lang;
    const { getByTestId } = await renderCard();
    expect(getByTestId('pro-instruction').props.children).toBe(tr.candidate_review.pro_instruction);
    expect(StyleSheet.flatten(getByTestId('pro-instruction').props.style).textAlign).toBe(lang === 'he' ? 'right' : 'left');
  });
  it('gone once he acknowledged, and once the client confirmed', async () => {
    mockAccepted = { offers: [offer({ review: 'pending', proAccepted: true })], bundles: [] };
    const acked = await renderCard();
    expect(acked.queryByTestId('pro-instruction')).toBeNull();
    acked.unmount();
    mockAccepted = { offers: [offer({ review: 'confirmed' })], bundles: [] };
    const confirmed = await renderCard();
    expect(confirmed.queryByTestId('pro-instruction')).toBeNull();
  });
});
