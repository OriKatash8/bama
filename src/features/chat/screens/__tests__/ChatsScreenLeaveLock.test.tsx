import React from 'react';
import { render, act, fireEvent } from '@testing-library/react-native';
import { ChatsScreen } from '../ChatsScreen';
import { listenToMyFees } from '@features/pricing/services/feesService';
import { removeMemberFromGroup } from '../../services/chatService';
import { useUiStore } from '@core/stores/uiStore';
import { getDoc } from 'firebase/firestore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

/**
 * Leaving a PROJECT chat waits for the project to be over: completed, the
 * dispute window ended, and no dispute open. Until then the row shows a lock in
 * place of the trash, and tapping it explains when (or why not) in a toast —
 * never an Alert, and never a word about fees. Cancelled projects stay open.
 * firestore.rules enforces the same thing on the server.
 */

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSegments: () => ['(client)'],
  useFocusEffect: () => {},
}));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('@core/firebase/config', () => ({ db: {}, auth: { currentUser: null } }));
jest.mock('firebase/firestore', () => ({ getDoc: jest.fn(), doc: jest.fn(), updateDoc: jest.fn(), onSnapshot: jest.fn(() => () => {}) }));
jest.mock('../../services/chatService', () => ({ removeMemberFromGroup: jest.fn() }));
jest.mock('@utils/confirmDialog', () => ({ confirmDialog: jest.fn(async () => true) }));
jest.mock('@features/pricing/services/feesService', () => ({ listenToMyFees: jest.fn() }));
jest.mock('@features/notifications/hooks/useNotifPermissionPrompt', () => ({
  useNotifPermissionPrompt: () => ({ visible: false, dismiss: jest.fn() }),
}));
jest.mock('@features/notifications/components/NotifPermissionBanner', () => ({
  NotifPermissionBanner: () => null,
}));
let mockLanguage = 'en';
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLanguage }),
}));
let mockUid = 'client-1';
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { id: string } }) => unknown) => s({ user: { id: mockUid } }),
}));

const mockGetDoc = getDoc as jest.MockedFunction<typeof getDoc>;
const mockListenToMyFees = listenToMyFees as jest.MockedFunction<typeof listenToMyFees>;
const mockRemove = removeMemberFromGroup as jest.MockedFunction<typeof removeMemberFromGroup>;

const DAY = 86_400_000;
const at = (ms: number) => ({ seconds: Math.floor(ms / 1000), nanoseconds: 0, toMillis: () => Math.floor(ms / 1000) * 1000 });
const chats = [{
  id: 'chat-1', type: 'group', projectId: 'p1', name: 'Three-camera shoot',
  members: ['client-1', 'pro-1'], lastMessage: { text: 'done', timestamp: null },
}] as never;

async function renderWith(project: Record<string, unknown>, opts: { uid?: string; lang?: 'en' | 'he'; fee?: Record<string, unknown> } = {}) {
  mockLanguage = opts.lang ?? 'en';
  mockUid = opts.uid ?? 'client-1';
  mockGetDoc.mockImplementation(async () => ({
    exists: () => true,
    data: () => ({ clientId: 'client-1', professionalIds: ['pro-1'], reviewsCompleted: true, ...project }),
  }) as never);
  mockListenToMyFees.mockImplementation((_id, cb) => {
    cb(new Map(opts.fee ? [['p1', { projectId: 'p1', professionalId: mockUid, ...opts.fee }]] : []) as never);
    return () => {};
  });
  const r = render(<ChatsScreen chats={chats} />);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return r;
}

let toast: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  toast = jest.spyOn(useUiStore.getState(), 'showToast').mockImplementation(() => {});
});
afterEach(() => toast.mockRestore());

describe('leaving a project chat', () => {
  it('inside the dispute window: a lock, not the trash; tapping says from when', async () => {
    const ends = Date.now() + 3 * DAY;
    const r = await renderWith({ status: 'completed', disputeWindowEndsAt: at(ends) });
    expect(r.queryByTestId('chat-trash-chat-1')).toBeNull();
    fireEvent.press(r.getByTestId('chat-lock-chat-1'), { stopPropagation: () => {} });
    const date = new Date(Math.floor(ends / 1000) * 1000).toLocaleDateString('en-GB');
    expect(toast).toHaveBeenCalledWith(en.chats.leave_locked_until.replace('{{date}}', date), 'info');
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('the message is in Hebrew for a Hebrew reader', async () => {
    const ends = Date.now() + DAY;
    const r = await renderWith({ status: 'completed', disputeWindowEndsAt: at(ends) }, { lang: 'he' });
    fireEvent.press(r.getByTestId('chat-lock-chat-1'), { stopPropagation: () => {} });
    const date = new Date(Math.floor(ends / 1000) * 1000).toLocaleDateString('he-IL');
    expect(toast).toHaveBeenCalledWith(he.chats.leave_locked_until.replace('{{date}}', date), 'info');
  });

  it('an open dispute on the project: lock, and the dispute message', async () => {
    const r = await renderWith({ status: 'completed', adminReviewPending: true });
    fireEvent.press(r.getByTestId('chat-lock-chat-1'), { stopPropagation: () => {} });
    expect(toast).toHaveBeenCalledWith(en.chats.leave_locked_dispute, 'info');
  });

  it("a professional's own engagement under review locks it for them", async () => {
    const r = await renderWith(
      { status: 'completed', adminReviewPending: false },
      { uid: 'pro-1', fee: { adminReviewPending: true, engagementStatus: 'disputed' } },
    );
    fireEvent.press(r.getByTestId('chat-lock-chat-1'), { stopPropagation: () => {} });
    expect(toast).toHaveBeenCalledWith(en.chats.leave_locked_dispute, 'info');
  });

  it('after the window, no dispute: the trash is back and removes the chat', async () => {
    const r = await renderWith({ status: 'completed', disputeWindowEndsAt: at(Date.now() - DAY), adminReviewPending: false });
    expect(r.queryByTestId('chat-lock-chat-1')).toBeNull();
    await act(async () => { fireEvent.press(r.getByTestId('chat-trash-chat-1'), { stopPropagation: () => {} }); });
    expect(mockRemove).toHaveBeenCalledWith('chat-1', 'client-1');
  });

  it('a cancelled project stays unlocked', async () => {
    const r = await renderWith({ status: 'cancelled', disputeWindowEndsAt: at(Date.now() + DAY) });
    expect(r.queryByTestId('chat-trash-chat-1')).not.toBeNull();
    expect(r.queryByTestId('chat-lock-chat-1')).toBeNull();
  });

  it('a running project shows neither', async () => {
    const r = await renderWith({ status: 'in_progress' });
    expect(r.queryByTestId('chat-trash-chat-1')).toBeNull();
    expect(r.queryByTestId('chat-lock-chat-1')).toBeNull();
  });

  it('neither message mentions fees or payment', () => {
    for (const s of [en.chats.leave_locked_until, en.chats.leave_locked_dispute]) expect(s).not.toMatch(/fee|pay/i);
    for (const s of [he.chats.leave_locked_until, he.chats.leave_locked_dispute]) expect(s).not.toMatch(/עמלה|תשלום/);
  });
});
