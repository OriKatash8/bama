import React from 'react';
import { render, act } from '@testing-library/react-native';
import { ChatsScreen } from '../ChatsScreen';
import { listenToMyFees } from '@features/pricing/services/feesService';
import { getDoc } from 'firebase/firestore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

/**
 * "The team is ready" on the chat list, instead of the raw Hebrew.
 *
 * When the last seat is filled, activateProject writes a system message and
 * copies it onto the chat's `lastMessage`
 * (functions/src/lifecycle/candidates.ts:258): `🎬 הצוות נסגר: <names>`. The
 * chat room turns that into a localised pill, but the list rendered
 * `lastMessage.text` verbatim — so an English reader saw Hebrew and an emoji,
 * and everyone saw a list of names where a status line belongs.
 *
 * Only the PREVIEW is replaced. The message itself, the push body and the room
 * are untouched.
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
jest.mock('@utils/confirmDialog', () => ({ confirmDialog: jest.fn() }));
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
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { id: string } }) => unknown) => s({ user: { id: 'client-1' } }),
}));

const mockGetDoc = getDoc as jest.MockedFunction<typeof getDoc>;
const mockListenToMyFees = listenToMyFees as jest.MockedFunction<typeof listenToMyFees>;

const chat = (text: string) => ([{
  id: 'chat-1', type: 'group', projectId: 'p1', name: 'Three-camera shoot',
  members: ['client-1', 'pro-1'], lastMessage: { text, timestamp: null },
}] as never);

async function renderWith(text: string, language: 'en' | 'he' = 'en') {
  mockLanguage = language;
  mockGetDoc.mockImplementation(async () => ({
    exists: () => true,
    // in_progress and reviews done: no completedLine, so the preview is the
    // only thing under test.
    data: () => ({ status: 'in_progress', clientId: 'client-1', professionalIds: ['pro-1'], reviewsCompleted: true }),
  }) as never);
  mockListenToMyFees.mockImplementation((_id, cb) => { cb(new Map()); return () => {}; });
  const r = render(<ChatsScreen chats={chat(text)} />);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return r;
}

describe('the crew-ready preview', () => {
  it('replaces the raw Hebrew with the reader’s own wording', async () => {
    const r = await renderWith('🎬 הצוות נסגר: דנה כהן, אורי');
    expect(r.queryByText(en.chats.crew_ready)).not.toBeNull();
    expect(r.queryByText('🎬 הצוות נסגר: דנה כהן, אורי')).toBeNull();
  });

  it('works for the form with no names', async () => {
    const r = await renderWith('🎬 הצוות נסגר');
    expect(r.queryByText(en.chats.crew_ready)).not.toBeNull();
  });

  it('reads in Hebrew for a Hebrew reader', async () => {
    const r = await renderWith('🎬 הצוות נסגר: דנה כהן', 'he');
    expect(r.queryByText(he.chats.crew_ready)).not.toBeNull();
  });

  it('drops the names — this is a status line, not a roster', async () => {
    const r = await renderWith('🎬 הצוות נסגר: דנה כהן, אורי');
    expect(r.queryByText(/דנה כהן/)).toBeNull();
  });

  it('leaves an ordinary message completely alone', async () => {
    // The anchor: without it, a preview that always printed the crew line would
    // satisfy everything above.
    const r = await renderWith('On my way');
    expect(r.queryByText('On my way')).not.toBeNull();
    expect(r.queryByText(en.chats.crew_ready)).toBeNull();
  });

  it('leaves another system message alone', async () => {
    const r = await renderWith('📅 פגישה חדשה');
    expect(r.queryByText('📅 פגישה חדשה')).not.toBeNull();
    expect(r.queryByText(en.chats.crew_ready)).toBeNull();
  });
});
