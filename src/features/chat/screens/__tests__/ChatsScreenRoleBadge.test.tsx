import React from 'react';
import { StyleSheet } from 'react-native';
import { render, act, within } from '@testing-library/react-native';
import { ChatsScreen } from '../ChatsScreen';
import { listenToMyFees } from '@features/pricing/services/feesService';
import { getDoc } from 'firebase/firestore';
import en from '@core/i18n/translations/en.json';

/**
 * THE BADGE ON A PROJECT ROW SAYS WHO I AM ON IT, NOT WHERE IT STANDS.
 *
 * The role comes from the project document, never from the mode segment — the
 * router is mocked to the professional tab throughout, so a test that read the
 * mode would call everyone a creator.
 */

let mockUserId = 'pro-1';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSegments: () => ['(professional)'],
  useFocusEffect: () => {},
}));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('@core/firebase/config', () => ({ db: {}, auth: { currentUser: null } }));
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
  useAuthStore: (s: (x: { user: { id: string } }) => unknown) => s({ user: { id: mockUserId } }),
}));

const mockGetDoc = getDoc as jest.MockedFunction<typeof getDoc>;
const mockListenToMyFees = listenToMyFees as jest.MockedFunction<typeof listenToMyFees>;

const chat = {
  id: 'chat-1', type: 'group', projectId: 'p1', name: 'Three-camera shoot',
  members: ['client-1', 'pro-1'], lastMessage: { text: 'hi', timestamp: null },
} as never;

function withProject(project: Record<string, unknown>) {
  mockGetDoc.mockImplementation(async () => ({ exists: () => true, data: () => project }) as never);
  mockListenToMyFees.mockImplementation((_id, cb) => { cb(new Map()); return () => {}; });
}

async function renderAs(userId: string) {
  mockUserId = userId;
  const r = render(<ChatsScreen chats={[chat]} />);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return r;
}

const project = { status: 'in_progress', clientId: 'client-1', professionalIds: ['pro-1'], reviewsCompleted: true };

beforeEach(() => jest.clearAllMocks());

describe('project row role badge', () => {
  it('calls the project owner the client — even from the professional tab', async () => {
    withProject(project);
    const { queryByText } = await renderAs('client-1');
    expect(queryByText(en.chats.role_client)).toBeTruthy();
    expect(queryByText(en.chats.role_creator)).toBeNull();
  });

  it('calls a hired professional the creator', async () => {
    withProject(project);
    const { queryByText } = await renderAs('pro-1');
    expect(queryByText(en.chats.role_creator)).toBeTruthy();
    expect(queryByText(en.chats.role_client)).toBeNull();
  });

  it('the creator badge is violet, on a tint of the same violet', async () => {
    withProject(project);
    const { getByText, getByTestId } = await renderAs('pro-1');
    expect(getByText(en.chats.role_creator)).toHaveStyle({ color: '#1D4ED8' });
    expect(getByTestId('project-badge-chat-1')).toHaveStyle({ backgroundColor: '#E6EDFC' });
  });

  it('the client badge is the client mode blue, on a tint of the same blue', async () => {
    withProject(project);
    const { getByText, getByTestId } = await renderAs('client-1');
    expect(getByText(en.chats.role_client)).toHaveStyle({ color: '#6D28D9' });
    expect(getByTestId('project-badge-chat-1')).toHaveStyle({ backgroundColor: '#F3EEFE' });
  });

  it('self-hire reads as client, matching the row copy', async () => {
    withProject({ ...project, professionalIds: ['client-1'] });
    const { queryByText } = await renderAs('client-1');
    expect(queryByText(en.chats.role_client)).toBeTruthy();
    expect(queryByText(en.chats.role_creator)).toBeNull();
  });

  it('a completed project says "Completed" in place of the role', async () => {
    withProject({ ...project, status: 'completed' });
    // Scoped to the row: the "Completed" filter chip carries the same text.
    const { getByTestId } = await renderAs('client-1');
    const row = within(getByTestId('chat-row-chat-1'));
    expect(row.queryByText(en.chats.status_completed)).toBeTruthy();
    expect(row.queryByText(en.chats.role_client)).toBeNull();
  });

  it('a completed project row is white, not tinted green', async () => {
    withProject({ ...project, status: 'completed' });
    const { getByTestId } = await renderAs('client-1');
    // The row paints no background of its own: it shows the white list
    // container behind it. Only the badge carries the completed green.
    expect(StyleSheet.flatten(getByTestId('chat-row-chat-1').props.style).backgroundColor).toBeUndefined();
    expect(getByTestId('project-badge-chat-1')).toHaveStyle({ backgroundColor: '#E9F5EC' });
  });

  it('no longer shows the project status badge', async () => {
    withProject(project);
    const { queryByText } = await renderAs('pro-1');
    expect(queryByText(en.chats.status_in_progress)).toBeNull();
  });
});
