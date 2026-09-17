import React from 'react';
import { Alert, StyleSheet } from 'react-native';
import { render, act, fireEvent } from '@testing-library/react-native';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

let mockLang = 'en';
let mockUsers: Record<string, unknown> = {};
let mockAccepted: { offers: unknown[]; bundles: unknown[] } = { offers: [], bundles: [] };
let mockRequests: unknown[] = [];
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
    listenToAcceptedOffers: (_p: string, _pro: string | null, cb: (d: unknown) => void) => { cb(mockAccepted); return () => {}; },
    confirmCandidate: (...a: unknown[]) => mockConfirm(...a),
    rejectCandidate: (...a: unknown[]) => mockReject(...a),
  };
});

import { CandidateReviewCard } from '../CandidateReviewCard';

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

it('one row per professional under review, with name, role and price', async () => {
  const { getByTestId, getByText, queryByTestId } = await renderCard();
  expect(getByTestId('candidate-row-pro-a')).toBeTruthy();
  expect(getByTestId('candidate-row-pro-b')).toBeTruthy();
  expect(getByText('Avi')).toBeTruthy();
  expect(getByText('₪300')).toBeTruthy();
  expect(queryByTestId('candidate-row-pro-c')).toBeNull();
});

it("a rejected candidate's removed offer (stale review: 'pending') is not shown", async () => {
  mockAccepted = { offers: [offer('pro-a'), offer('pro-b', { status: 'removed' })], bundles: [] };
  const { queryByTestId } = await renderCard();
  expect(queryByTestId('candidate-row-pro-b')).toBeNull();
});

describe('a name that has not resolved locks the row', () => {
  it('unresolved: placeholder name and all three actions disabled', async () => {
    mockUsers = { 'pro-b': named['pro-b'] };
    const { getByTestId } = await renderCard();
    expect(getByTestId('candidate-name-pro-a').props.children).toBe(en.candidate_review.name_loading);
    for (const id of ['relevant', 'not-relevant', 'price']) {
      expect(disabled(getByTestId(`candidate-${id}-pro-a`))).toBe(true);
      expect(disabled(getByTestId(`candidate-${id}-pro-b`))).toBe(false);
    }
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
    const { getByTestId, queryByTestId } = await renderCard();
    expect(getByTestId('candidate-waiting-pro-pro-a').props.children).toBe('Waiting for Avi to answer');
    expect(queryByTestId('candidate-answer-pro-a')).toBeNull();
    expect(disabled(getByTestId('candidate-relevant-pro-a'))).toBe(true);
    expect(disabled(getByTestId('candidate-price-pro-a'))).toBe(true);
    expect(disabled(getByTestId('candidate-not-relevant-pro-a'))).toBe(false);
    expect(disabled(getByTestId('candidate-relevant-pro-b'))).toBe(false);
  });

  it('waiting on the client: an action line that opens the payments section', async () => {
    mockRequests = [{ id: 'r2', professionalId: 'pro-b', fromUserId: 'pro-b', toUserId: CLIENT, status: 'pending' }];
    const { getByTestId, queryByTestId } = await renderCard();
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
    const { getByTestId } = await renderCard();
    await act(async () => { fireEvent.press(getByTestId('candidate-not-relevant-pro-b')); });
    fireEvent.changeText(getByTestId('reject-reason-input'), '  different style  ');
    await act(async () => { fireEvent.press(getByTestId('reject-confirm')); });
    expect(mockReject).toHaveBeenCalledWith('p1', 'pro-b', 'different style');
    expect(mockToast).toHaveBeenCalledWith('Beni was removed from the project', 'success');
  });

  it('tells the client when the reason could not be delivered', async () => {
    mockReject.mockResolvedValue({ ok: true, dmSent: false, activated: false });
    const { getByTestId } = await renderCard();
    await act(async () => { fireEvent.press(getByTestId('candidate-not-relevant-pro-b')); });
    fireEvent.changeText(getByTestId('reject-reason-input'), 'x');
    await act(async () => { fireEvent.press(getByTestId('reject-confirm')); });
    expect(mockToast).toHaveBeenCalledWith("Beni was removed, but the reason couldn't be delivered", 'error');
  });
});

it('שינוי מחיר sends a per-role request for the chosen role', async () => {
  const { getByTestId } = await renderCard();
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
    // Two rows, so each label appears twice — exact match, and 'לא רלוונטי' does not count.
    expect(getAllByText(tr.candidate_review.relevant)).toHaveLength(2);
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
    const { getByTestId } = await renderCard();
    expect(StyleSheet.flatten(getByTestId('candidate-waiting-pro-pro-a').props.style).writingDirection).toBe(dir);
    expect(StyleSheet.flatten(getByTestId('candidate-name-pro-a').props.style).writingDirection).toBe(dir);
    const answerLine = getByTestId('candidate-answer-pro-b');
    const text = answerLine.findAll((n: { props: { style?: unknown } }) =>
      (StyleSheet.flatten(n.props.style as never) as { writingDirection?: string } | undefined)?.writingDirection !== undefined);
    expect(text.length).toBeGreaterThan(0);
    expect(StyleSheet.flatten(text[0].props.style).writingDirection).toBe(dir);
  });
});
