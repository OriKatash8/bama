import React from 'react';
import { render, act, fireEvent } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import ProjectDetailsScreen from '../project-details';
import { getDocument, queryDocuments } from '@core/firebase/firestore';
import { listenToProjectFee } from '@features/pricing/services/feesService';
import { useAuthStore } from '@core/stores/authStore';
import { CLIENT_TAB_ACTIVE, PRO_TAB_ACTIVE } from '@core/navigation/floatingTabBar';
import en from '@core/i18n/translations/en.json';

/**
 * THE "UPDATE PRICE" POP-UP: white background and black text in both modes
 * (it used the theme's pale-blue card and grey labels), and the send button in
 * the viewer's mode colour — purple for a client, blue for a pro.
 */

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ projectId: 'p1' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useNavigation: () => ({ getState: () => undefined }),
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

async function openPriceRequest() {
  const r = await renderLoaded();
  await act(async () => { fireEvent.press(r.getAllByText(en.project_details.update)[0]); });
  return r;
}

const flat = (style: unknown) => (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;

function expectLook(r: Awaited<ReturnType<typeof openPriceRequest>>, accent: string) {
  const sheet = r.getByTestId('price-request-sheet');
  expect(flat(sheet.props.style).backgroundColor).toBe('#FFFFFF');
  // Every piece of text in it is black — except the send button's white label.
  const texts = sheet.findAll((n) => n.type === Text);
  expect(texts.length).toBeGreaterThan(3);
  const send = r.getByTestId('price-request-send');
  for (const t of texts) {
    if (send.findAll((n) => n === t).length) continue;
    expect(flat(t.props.style).color).toBe('#000000');
  }
  expect(flat(send.props.style).backgroundColor).toBe(accent);
}

it('client: white, black text, purple send button', async () => {
  useAuthStore.setState({ activeMode: 'client' });
  const r = await openPriceRequest();
  expect(r.getByText(en.project_details.request_payment_update)).toBeTruthy();
  expectLook(r, CLIENT_TAB_ACTIVE);
});

it('professional: white, black text, blue send button', async () => {
  mockViewer.uid = 'pro-1';
  mockListenToProjectFee.mockImplementation((_projectId, _proId, callback) => {
    callback({ professionalId: 'pro-1', feeStatus: 'owed', feeRate: 0.03, baseAmount: 4000, minFeeApplied: 6, slotActive: true, engagementStatus: 'hired' } as never);
    return () => {};
  });
  useAuthStore.setState({ activeMode: 'professional' });
  const r = await openPriceRequest();
  expectLook(r, PRO_TAB_ACTIVE);
});
