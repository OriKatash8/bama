import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { CommunityManageModal } from '../CommunityManageModal';
import { addDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { approveJoinRequest, rejectJoinRequest, removeCommunityMember } from '../../services/communityMembership';
import { confirmDialog } from '@utils/confirmDialog';
import en from '@core/i18n/translations/en.json';

/**
 * The owner's manage panel, now opened from the community details page. Approve,
 * reject and remove go through communityMembership (which pairs each membership
 * change with its dashboard event — tested there); the owner can't be removed, General and
 * Market can't be deleted, and a delete asks first. A non-owner gets nothing, and
 * no listener, since the pending-requests query is only provable for the owner.
 */

let mockUid = 'owner-1';
jest.mock('@core/firebase/config', () => ({ db: {}, auth: { get currentUser() { return { uid: mockUid }; } } }));
jest.mock('@core/firebase/storage', () => ({ uploadFile: jest.fn() }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn(() => Promise.resolve({ canceled: true })) }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@utils/confirmDialog', () => ({ confirmDialog: jest.fn(() => Promise.resolve(true)) }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));
jest.mock('../../services/communityMembership', () => ({
  approveJoinRequest: jest.fn(() => Promise.resolve(true)),
  rejectJoinRequest: jest.fn(() => Promise.resolve()),
  removeCommunityMember: jest.fn(() => Promise.resolve()),
}));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn((_db, ...path: string[]) => ({ path: path.join('/') })),
  doc: jest.fn((_db, ...path: string[]) => ({ path: path.join('/') })),
  query: jest.fn((ref) => ref),
  where: jest.fn(),
  orderBy: jest.fn(),
  onSnapshot: jest.fn(),
  updateDoc: jest.fn(() => Promise.resolve()),
  addDoc: jest.fn(() => Promise.resolve()),
  deleteDoc: jest.fn(() => Promise.resolve()),
  arrayUnion: jest.fn((v) => ({ union: v })),
  arrayRemove: jest.fn((v) => ({ remove: v })),
  serverTimestamp: jest.fn(() => 'ts'),
}));

const snapOf = (docs: { id: string; data: Record<string, unknown> }[]) => ({
  docs: docs.map((d) => ({ id: d.id, data: () => d.data })),
});

function setupListeners() {
  (onSnapshot as jest.Mock).mockImplementation((ref: { path: string }, onNext: (s: unknown) => void) => {
    if (ref.path.endsWith('joinRequests')) {
      onNext(snapOf([{ id: 'u9', data: { userId: 'u9', displayName: 'Nina Newcomer' } }]));
    } else if (ref.path.endsWith('channels')) {
      onNext(snapOf([
        { id: 'gen', data: { name: 'General', kind: 'general', createdAt: { seconds: 1 } } },
        { id: 'market', data: { name: 'Market', kind: 'market', createdAt: { seconds: 2 } } },
        { id: 'lights', data: { name: 'lights', createdAt: { seconds: 3 } } },
      ]));
    }
    return () => {};
  });
}

const baseProps = {
  visible: true,
  onClose: jest.fn(),
  chatId: 'c1',
  chatName: 'Gaffers Guild',
  ownerId: 'owner-1',
  photoURL: null,
  members: ['owner-1', 'u2'],
  memberNames: { 'owner-1': 'Olive Owner', u2: 'Ben Boom' },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUid = 'owner-1';
  setupListeners();
});

it('shows pending requests; approve goes through the membership service', async () => {
  const r = render(<CommunityManageModal {...baseProps} />);
  expect(r.getByText('Nina Newcomer')).toBeTruthy();
  await act(async () => { fireEvent.press(r.getByText(en.communities.approve)); });
  expect(approveJoinRequest).toHaveBeenCalledWith('c1', 'u9');
  expect(rejectJoinRequest).not.toHaveBeenCalled();
});

it('reject goes through the membership service', async () => {
  const r = render(<CommunityManageModal {...baseProps} />);
  await act(async () => { fireEvent.press(r.getByText(en.communities.reject)); });
  expect(rejectJoinRequest).toHaveBeenCalledWith('c1', 'u9');
  expect(approveJoinRequest).not.toHaveBeenCalled();
});

it('removes a member; the owner has no remove control', async () => {
  const r = render(<CommunityManageModal {...baseProps} />);
  expect(r.queryByTestId('manage-remove-owner-1')).toBeNull();
  await act(async () => { fireEvent.press(r.getByTestId('manage-remove-u2')); });
  expect(removeCommunityMember).toHaveBeenCalledWith('c1', 'u2', 'owner-1');
});

it('General and Market have no delete; a normal channel deletes after confirming', async () => {
  const r = render(<CommunityManageModal {...baseProps} />);
  expect(r.queryByTestId('manage-delete-channel-gen')).toBeNull();
  expect(r.queryByTestId('manage-delete-channel-market')).toBeNull();
  await act(async () => { fireEvent.press(r.getByTestId('manage-delete-channel-lights')); });
  expect(confirmDialog).toHaveBeenCalled();
  expect(deleteDoc).toHaveBeenCalledWith({ path: 'chats/c1/channels/lights' });
});

it('does not delete a channel when the confirm is declined', async () => {
  (confirmDialog as jest.Mock).mockResolvedValueOnce(false);
  const r = render(<CommunityManageModal {...baseProps} />);
  await act(async () => { fireEvent.press(r.getByTestId('manage-delete-channel-lights')); });
  expect(deleteDoc).not.toHaveBeenCalled();
});

it('adds a channel', async () => {
  const r = render(<CommunityManageModal {...baseProps} />);
  fireEvent.press(r.getByText(en.community.add_channel));
  fireEvent.changeText(r.getByTestId('manage-channel-input'), '  drone ops ');
  await act(async () => { fireEvent.press(r.getByTestId('manage-channel-add')); });
  expect(addDoc).toHaveBeenCalledWith({ path: 'chats/c1/channels' }, expect.objectContaining({ name: 'drone ops', createdBy: 'owner-1' }));
});

it('a non-owner gets nothing and starts no listener', () => {
  mockUid = 'u2';
  const r = render(<CommunityManageModal {...baseProps} />);
  expect(r.toJSON()).toBeNull();
  expect(onSnapshot).not.toHaveBeenCalled();
});

it('does not listen while closed', () => {
  render(<CommunityManageModal {...baseProps} visible={false} />);
  expect(onSnapshot).not.toHaveBeenCalled();
});

describe('ask BAMA to delete the community', () => {
  const c = en.communities;

  it('the owner writes why; the request is saved for BAMA with the community and the reason', async () => {
    const r = render(<CommunityManageModal {...baseProps} />);
    fireEvent.press(r.getByRole('button', { name: c.ask_delete }));
    expect(r.getByText(c.ask_delete_title)).toBeTruthy();

    const send = () => r.getByRole('button', { name: c.ask_delete_send });
    // Too short to send.
    fireEvent.changeText(r.getByPlaceholderText(c.ask_delete_placeholder), 'bye');
    expect(send().props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));

    fireEvent.changeText(r.getByPlaceholderText(c.ask_delete_placeholder), '  We finished the season  ');
    await act(async () => { fireEvent.press(send()); });

    expect(addDoc).toHaveBeenCalledWith(
      { path: 'reports' },
      {
        type: 'community_deletion',
        reporterId: 'owner-1',
        communityId: 'c1',
        communityName: 'Gaffers Guild',
        reason: 'We finished the season',
        evidenceURLs: [],
        status: 'pending',
        createdAt: 'ts',
      },
    );
    // The sheet closes and the panel says it was sent.
    expect(r.queryByText(c.ask_delete_title)).toBeNull();
    expect(r.getByText(c.ask_delete_sent)).toBeTruthy();
  });

  it('cancel sends nothing', () => {
    const r = render(<CommunityManageModal {...baseProps} />);
    fireEvent.press(r.getByRole('button', { name: c.ask_delete }));
    fireEvent.changeText(r.getByPlaceholderText(c.ask_delete_placeholder), 'We finished the season');
    fireEvent.press(r.getByRole('button', { name: c.ask_delete_cancel }));
    expect(r.queryByText(c.ask_delete_title)).toBeNull();
    expect(addDoc).not.toHaveBeenCalledWith({ path: 'reports' }, expect.anything());
  });

  it('a failed send keeps the sheet open with the text, and says so', async () => {
    (addDoc as jest.Mock).mockImplementationOnce(() => Promise.reject(new Error('offline')));
    const r = render(<CommunityManageModal {...baseProps} />);
    fireEvent.press(r.getByRole('button', { name: c.ask_delete }));
    fireEvent.changeText(r.getByPlaceholderText(c.ask_delete_placeholder), 'We finished the season');
    await act(async () => { fireEvent.press(r.getByRole('button', { name: c.ask_delete_send })); });
    expect(r.getByText(c.ask_delete_failed)).toBeTruthy();
    expect(r.getByDisplayValue('We finished the season')).toBeTruthy();
  });
});
