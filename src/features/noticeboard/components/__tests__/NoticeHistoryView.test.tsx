import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { NoticeHistoryView } from '../NoticeHistoryView';
import { hasNoticeHistory } from '../../history';
import { updateDocument } from '@core/firebase/firestore';
import en from '@core/i18n/translations/en.json';
import { MAX_OFFER_PRICE } from '@core/constants/pricing';

/**
 * History on the noticeboard, in the page: two tab pills (hidden notices, sent
 * offers) over a vertical list. Hidden notices are board cards with Restore;
 * sent offers keep their status and the pending-price edit.
 */

const mockShowToast = jest.fn();
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('@core/firebase/firestore', () => ({ updateDocument: jest.fn(() => Promise.resolve()) }));
jest.mock('firebase/firestore', () => ({ increment: (n: number) => ({ inc: n }), serverTimestamp: () => 'ts' }));
jest.mock('@core/stores/uiStore', () => ({
  useUiStore: Object.assign(
    (s?: (x: { isDark: boolean; showToast: jest.Mock }) => unknown) => {
      const state = { isDark: false, showToast: mockShowToast };
      return s ? s(state) : state;
    },
    {},
  ),
}));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));

const h = en.history;
const tap = { stopPropagation: jest.fn() };

const project = (id: string, title: string) => ({
  id, title, clientId: 'c1', status: 'open', description: '', location: 'Ashdod', deadline: '', exec: '',
  crewSlots: [{ category: 'Editor', quantity: 1 }], createdAt: { seconds: 1_700_000_000 },
}) as never;

const priceOffer = (id: string, status: string, price = 500) => ({
  kind: 'price' as const, id, projectTitle: `Project ${id}`, ts: 1_700_000_000,
  data: { id, projectId: `p-${id}`, professionalId: 'me', category: 'Editor', price, status } as never,
});
const bundleOffer = (id: string) => ({
  kind: 'bundle' as const, id, projectTitle: `Bundle ${id}`, ts: 1_700_000_000,
  data: { id, projectId: `p-${id}`, professionalId: 'me', bundlePrice: 900, individualTotal: 1000, status: 'pending' } as never,
});

function view(extra: Record<string, unknown> = {}) {
  const props = {
    offers: [], offersLoading: false, hidden: [], hiddenLoading: false,
    onRestore: jest.fn(), onOpenProject: jest.fn(), posters: {}, cardWidth: 320, ...extra,
  };
  return { r: render(<NoticeHistoryView {...(props as unknown as React.ComponentProps<typeof NoticeHistoryView>)} />), props };
}

beforeEach(() => jest.clearAllMocks());

describe('hasNoticeHistory', () => {
  it('is true with a sent offer or a restorable hidden notice, false with neither', () => {
    expect(hasNoticeHistory(0, 0)).toBe(false);
    expect(hasNoticeHistory(1, 0)).toBe(true);
    expect(hasNoticeHistory(0, 1)).toBe(true);
  });
});

it('shows the two tabs in order: hidden notices, then sent offers', () => {
  const { r } = view();
  const tabs = r.getAllByRole('tab');
  expect(tabs.map((el) => el.props.accessibilityLabel)).toEqual([h.tab_hidden, h.tab_sent]);
});

it('opens on sent offers when one is pending (what the badge points to)', () => {
  const { r } = view({ offers: [priceOffer('o1', 'pending')], hidden: [project('p1', 'Hidden one')] });
  expect(r.getByRole('tab', { name: h.tab_sent }).props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
  expect(r.getByText('Project o1')).toBeTruthy();
});

it('otherwise opens on hidden notices when there are some', () => {
  const { r } = view({ offers: [priceOffer('o1', 'accepted')], hidden: [project('p1', 'Hidden one')] });
  expect(r.getByRole('tab', { name: h.tab_hidden }).props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
  expect(r.getByText('Hidden one')).toBeTruthy();
  expect(r.queryByText('Project o1')).toBeNull();
});

it('hidden notices are board cards with Restore and no ✕; tapping a card opens the project', () => {
  const p = project('p1', 'Hidden one');
  const { r, props } = view({ hidden: [p] });
  expect(r.queryByTestId('notice-dismiss')).toBeNull();
  fireEvent.press(r.getByRole('button', { name: h.restore }), tap);
  expect(props.onRestore).toHaveBeenCalledWith('p1');
  fireEvent.press(r.getByText('Hidden one'));
  expect(props.onOpenProject).toHaveBeenCalledWith(p);
});

it('switches to sent offers: status and price per offer', () => {
  const { r } = view({ offers: [priceOffer('o1', 'rejected', 750)], hidden: [project('p1', 'Hidden one')] });
  fireEvent.press(r.getByRole('tab', { name: h.tab_sent }));
  expect(r.getByText('Project o1')).toBeTruthy();
  expect(r.getByText(h.status_rejected)).toBeTruthy();
  expect(r.getByText(/₪750/)).toBeTruthy();
  expect(r.queryByText('Hidden one')).toBeNull();
});

it('edits a pending individual offer price: price, editedAt and editCount', async () => {
  const { r } = view({ offers: [priceOffer('o1', 'pending', 500)] });
  fireEvent.press(r.getByRole('button', { name: h.edit_price }));
  fireEvent.changeText(r.getByDisplayValue('500'), '650');
  await act(async () => { fireEvent.press(r.getByRole('button', { name: h.save })); });
  expect(updateDocument).toHaveBeenCalledWith('priceOffers/o1', { price: 650, editedAt: 'ts', editCount: { inc: 1 } });
});

it('edits a bundle through bundlePrice', async () => {
  const { r } = view({ offers: [bundleOffer('b1')] });
  fireEvent.press(r.getByRole('button', { name: h.edit_price }));
  fireEvent.changeText(r.getByDisplayValue('900'), '950');
  await act(async () => { fireEvent.press(r.getByRole('button', { name: h.save })); });
  expect(updateDocument).toHaveBeenCalledWith('bundleOffers/b1', { bundlePrice: 950, editedAt: 'ts', editCount: { inc: 1 } });
});

it('refuses a price outside the allowed range', async () => {
  const { r } = view({ offers: [priceOffer('o1', 'pending', 500)] });
  fireEvent.press(r.getByRole('button', { name: h.edit_price }));
  fireEvent.changeText(r.getByDisplayValue('500'), String(MAX_OFFER_PRICE + 1));
  await act(async () => { fireEvent.press(r.getByRole('button', { name: h.save })); });
  expect(updateDocument).not.toHaveBeenCalled();
  expect(mockShowToast).toHaveBeenCalled();
});

it('an empty tab says so', () => {
  // Nothing pending and nothing hidden: it opens on sent offers.
  const { r } = view();
  expect(r.getByText(h.empty_sent_title)).toBeTruthy();
  fireEvent.press(r.getByRole('tab', { name: h.tab_hidden }));
  expect(r.getByText(h.empty_hidden_title)).toBeTruthy();
});

it('sent-offer cards are as wide as the board cards, not edge to edge', () => {
  const { StyleSheet } = jest.requireActual<typeof import('react-native')>('react-native');
  const { r } = view({ offers: [priceOffer('o1', 'pending')], cardWidth: 300 });
  // Walk up from the title to the card container and check its width.
  type Node = { props: { style?: unknown }; parent: Node | null };
  let node: Node | null = r.getByText('Project o1') as unknown as Node;
  let found = false;
  while (node) {
    const style = (StyleSheet.flatten(node.props.style as never) ?? {}) as { width?: number };
    if (style.width === 300) { found = true; break; }
    node = node.parent;
  }
  expect(found).toBe(true);
});
