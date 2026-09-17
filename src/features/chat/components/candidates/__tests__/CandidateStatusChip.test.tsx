import React from 'react';
import { StyleSheet } from 'react-native';
import { render, act, fireEvent } from '@testing-library/react-native';
import he from '@core/i18n/translations/he.json';

let mockLang = 'en';
let mockAccepted: { offers: unknown[]; bundles: unknown[] } = { offers: [], bundles: [] };
let mockRequests: unknown[] = [];
const mockPush = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (sel: (s: { language: string }) => unknown) => sel({ language: mockLang }),
}));
jest.mock('firebase/firestore', () => ({ where: jest.fn() }));
jest.mock('@core/firebase/firestore', () => ({ subscribeToCollection: jest.fn() }));
jest.mock('@core/firebase/functions', () => ({ callFunction: () => jest.fn() }));
jest.mock('../../../services/paymentService', () => ({
  listenToPaymentRequests: (_p: string, _u: string, cb: (r: unknown[]) => void) => { cb(mockRequests); return () => {}; },
}));
jest.mock('../../../services/candidateService', () => ({
  ...jest.requireActual('../../../services/candidateService'),
  listenToAcceptedOffers: (_p: string, proId: string | null, cb: (d: unknown) => void) => {
    if (!proId) throw new Error('the chip must scope the query to the professional');
    cb(mockAccepted); return () => {};
  },
}));

import { CandidateStatusChip } from '../CandidateStatusChip';

const PRO = 'pro-a';
const offer = (over: Record<string, unknown> = {}) => ({
  id: 'o1', projectId: 'p1', professionalId: PRO, category: 'Editor', price: 500, status: 'accepted', createdAt: null, ...over,
});
async function renderChip(projectStatus = 'open') {
  const r = render(<CandidateStatusChip projectId="p1" chatId="c1" proId={PRO} projectStatus={projectStatus} />);
  await act(async () => {});
  return r;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLang = 'en';
  mockAccepted = { offers: [offer({ review: 'pending' })], bundles: [] };
  mockRequests = [];
});

it('amber while pending, with his price', async () => {
  const { getByTestId, getByText } = await renderChip();
  expect(getByTestId('chip-pending')).toBeTruthy();
  expect(getByText("Waiting for the client's decision")).toBeTruthy();
  expect(getByTestId('chip-price').props.children[0]).toBe('Your price: ₪500');
});

it('green once confirmed', async () => {
  mockAccepted = { offers: [offer({ review: 'confirmed' })], bundles: [] };
  const { getByTestId, getByText } = await renderChip();
  expect(getByTestId('chip-confirmed')).toBeTruthy();
  expect(getByText("You're confirmed")).toBeTruthy();
});

it('gone once the project is in progress', async () => {
  mockAccepted = { offers: [offer({ review: 'confirmed' })], bundles: [] };
  const { toJSON } = await renderChip('in_progress');
  expect(toJSON()).toBeNull();
});

it('no chip for a hire from before the review card', async () => {
  mockAccepted = { offers: [offer()], bundles: [] };
  const { toJSON } = await renderChip();
  expect(toJSON()).toBeNull();
});

it('a bundle is priced once', async () => {
  mockAccepted = {
    offers: [offer({ id: 'x', bundleId: 'b1', price: 400, review: 'pending' })],
    bundles: [{ id: 'b1', projectId: 'p1', professionalId: PRO, slots: [{ category: 'Editor' }], bundlePrice: 600, offerIds: ['x'], status: 'accepted', review: 'pending' }],
  };
  const { getByTestId } = await renderChip();
  expect(getByTestId('chip-price').props.children[0]).toBe('Your price: ₪600');
});

it('a price change the client asked for is an action that opens payments', async () => {
  mockRequests = [{ id: 'r', professionalId: PRO, fromUserId: 'client', toUserId: PRO, status: 'pending' }];
  const { getByTestId, queryByTestId } = await renderChip();
  expect(queryByTestId('chip-waiting-client')).toBeNull();
  await act(async () => { fireEvent.press(getByTestId('chip-client-asked')); });
  expect(mockPush).toHaveBeenCalledWith('/(client)/(tabs)/chats/project-details?projectId=p1&chatId=c1&section=payments');
});

it('his own pending request is shown as waiting on the client', async () => {
  mockRequests = [{ id: 'r', professionalId: PRO, fromUserId: PRO, toUserId: 'client', status: 'pending' }];
  const { getByTestId, queryByTestId } = await renderChip();
  expect(getByTestId('chip-waiting-client')).toBeTruthy();
  expect(queryByTestId('chip-client-asked')).toBeNull();
});

it('Hebrew flows right to left', async () => {
  mockLang = 'he';
  const { getByTestId, getByText } = await renderChip();
  expect(getByText(he.candidate_review.chip_pending)).toBeTruthy();
  const line = getByTestId('chip-pending').parent?.parent;
  expect(StyleSheet.flatten(line?.props.style).flexDirection).toBe('row-reverse');
});
