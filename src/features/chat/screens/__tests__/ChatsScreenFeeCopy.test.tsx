import React from 'react';
import { render, act } from '@testing-library/react-native';
import { ChatsScreen } from '../ChatsScreen';
import { listenToMyFees } from '@features/pricing/services/feesService';
import { getDoc } from 'firebase/firestore';
import en from '@core/i18n/translations/en.json';

/**
 * WHAT THE CHAT LIST SAYS ABOUT MONEY.
 *
 * Both assertions here are about a CALL SITE, not a predicate, and that is
 * deliberate: the bugs were call sites asking the wrong question, and a unit test
 * on `engagementStanding` or `feePaidEarly` passes against either of them. The
 * previous attempt at this proved it — reverting a call site left every unit test
 * green.
 *
 * The two questions the row was getting wrong:
 *   - "Paid" pill  — asked `outstandingFee === 0`, which a voided fee satisfies.
 *   - completed line — asked the PROJECT's status, which a contest reopens.
 */

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSegments: () => ['(professional)'],
  useFocusEffect: () => {},
}));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('@core/firebase/config', () => ({
  db: {}, auth: { currentUser: { uid: 'pro-1' } },
}));
jest.mock('firebase/firestore', () => ({ getDoc: jest.fn(), doc: jest.fn() }));
jest.mock('../../services/chatService', () => ({ removeMemberFromGroup: jest.fn() }));
jest.mock('@utils/confirmDialog', () => ({ confirmDialog: jest.fn() }));
jest.mock('@features/pricing/services/feesService', () => ({ listenToMyFees: jest.fn() }));
jest.mock('@features/notifications/hooks/useNotifPermissionPrompt', () => ({
  useNotifPermissionPrompt: () => ({ visible: false, dismiss: jest.fn() }),
}));
jest.mock('@features/notifications/components/NotifPermissionBanner', () => ({
  NotifPermissionBanner: () => null,
}));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { id: string } }) => unknown) => s({ user: { id: 'pro-1' } }),
}));

const mockGetDoc = getDoc as jest.MockedFunction<typeof getDoc>;
const mockListenToMyFees = listenToMyFees as jest.MockedFunction<typeof listenToMyFees>;

/** One group chat, on a project this professional is hired on. */
const chat = {
  id: 'chat-1', type: 'group', projectId: 'p1', name: 'Three-camera shoot',
  members: ['client-1', 'pro-1'], lastMessage: { text: 'hi', timestamp: null },
} as never;

/** The project as it looks AFTER a contest: reopened, because disputed is not
 *  terminal and the derivation reopens around it (derive.ts:187). */
const reopenedProject = {
  status: 'open', clientId: 'client-1', professionalIds: ['pro-1'], reviewsCompleted: true,
};

const baseFee = {
  professionalId: 'pro-1', feeStatus: 'owed', feeRate: 0.03,
  baseAmount: 4000, minFeeApplied: 6, slotActive: true,
};

function withFee(fee: unknown, project = reopenedProject) {
  mockGetDoc.mockImplementation(async () => ({
    exists: () => true, data: () => project,
  }) as never);
  mockListenToMyFees.mockImplementation((_id, cb) => {
    cb(new Map([['p1', fee as never]]));
    return () => {};
  });
}

async function renderList() {
  const r = render(<ChatsScreen chats={[chat]} />);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return r;
}

beforeEach(() => jest.clearAllMocks());

describe('a contested engagement is never described as paid or settled', () => {
  /** didnt_happen: fee voided to zero, nobody paid, admin still looking. */
  const contested = {
    ...baseFee, engagementStatus: 'disputed', feeDue: 0, status: 'not_owed', feePaid: false,
  };

  it('shows NO "Paid" pill — nothing was paid, the fee was voided', async () => {
    withFee(contested);
    const { queryByText } = await renderList();
    expect(queryByText(en.chats.fee_paid_pill)).toBeNull();
  });

  it('does not call it settled', async () => {
    withFee(contested);
    const { queryByText } = await renderList();
    expect(queryByText(en.chats.completed_pro_settled)).toBeNull();
  });

  it('says it is with our team, rather than dropping the line entirely', async () => {
    // The old code keyed on the project, which the contest reopened, so the row
    // silently lost its line. Saying nothing is not the same as saying nothing
    // is wrong.
    withFee(contested);
    const { queryByText } = await renderList();
    expect(queryByText(en.chats.completed_pro_review)).toBeTruthy();
  });
});

describe('a genuine early payment still reads as paid', () => {
  // The guard against over-correcting: if `feePaidEarly` became "never", these
  // would be the only thing to notice.
  const paidEarly = {
    ...baseFee, engagementStatus: 'hired', feeDue: 0, feePaid: true,
    status: 'paid', paidAmount: 120,
  };

  it('shows the Paid pill on an open engagement that really was paid', async () => {
    withFee(paidEarly);
    const { queryByText } = await renderList();
    expect(queryByText(en.chats.fee_paid_pill)).toBeTruthy();
  });

  it('shows no Paid pill while the fee is still outstanding', async () => {
    withFee({ ...baseFee, engagementStatus: 'hired', feeDue: 120, feePaid: false });
    const { queryByText } = await renderList();
    expect(queryByText(en.chats.fee_paid_pill)).toBeNull();
  });
});

describe('a finished engagement still gets its completed line', () => {
  it('owing — says the balance is outstanding', async () => {
    withFee({ ...baseFee, engagementStatus: 'completed', feeDue: 120, feePaid: false });
    const { queryByText } = await renderList();
    expect(queryByText(en.chats.completed_pro)).toBeTruthy();
  });

  it('settled — says complete, with no amount', async () => {
    withFee({
      ...baseFee, engagementStatus: 'completed', feeDue: 0, feePaid: true, status: 'paid',
    });
    const { queryByText } = await renderList();
    expect(queryByText(en.chats.completed_pro_settled)).toBeTruthy();
  });

  it('reads the ENGAGEMENT, not the project — finished inside a still-open project', async () => {
    // Another professional is still working, so the project is open. This one's
    // own part is done and the row must say so.
    withFee(
      { ...baseFee, engagementStatus: 'completed', feeDue: 120, feePaid: false },
      { ...reopenedProject, status: 'open' },
    );
    const { queryByText } = await renderList();
    expect(queryByText(en.chats.completed_pro)).toBeTruthy();
  });
});
