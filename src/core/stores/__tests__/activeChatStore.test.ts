import { useActiveChatStore, isForActiveChat } from '../activeChatStore';
import { handleForegroundNotification } from '@core/notifications/foregroundHandler';
import type * as Notifications from 'expo-notifications';

/**
 * A push for the chat on screen is not shown while the app is open; every other
 * push is. The store says which chat (and community channel) is on screen.
 */

function push(data: Record<string, unknown>): Notifications.Notification {
  return { request: { content: { data } } } as unknown as Notifications.Notification;
}

beforeEach(() => {
  useActiveChatStore.setState({ chatId: null, channelId: null });
});

it('suppresses a message in the chat on screen', () => {
  useActiveChatStore.getState().setActive('c1', null);
  expect(isForActiveChat({ type: 'message', chatId: 'c1' })).toBe(true);
});

it('shows a message from another chat', () => {
  useActiveChatStore.getState().setActive('c1', null);
  expect(isForActiveChat({ type: 'message', chatId: 'c2' })).toBe(false);
});

it('shows everything when no chat is on screen', () => {
  expect(isForActiveChat({ type: 'message', chatId: 'c1' })).toBe(false);
});

it('shows non-message pushes about the same chat (e.g. offer accepted)', () => {
  useActiveChatStore.getState().setActive('c1', null);
  expect(isForActiveChat({ type: 'offer_accepted', chatId: 'c1', projectId: 'p1' })).toBe(false);
});

it('community: suppresses only the channel on screen', () => {
  useActiveChatStore.getState().setActive('com', 'general');
  expect(isForActiveChat({ type: 'message', chatId: 'com', channelId: 'general' })).toBe(true);
  expect(isForActiveChat({ type: 'message', chatId: 'com', channelId: 'market' })).toBe(false);
});

it('clear only forgets the chat it names', () => {
  const s = useActiveChatStore.getState();
  s.setActive('c2', null);
  s.clear('c1'); // a room that is no longer the active one leaving late
  expect(useActiveChatStore.getState().chatId).toBe('c2');
  s.clear('c2');
  expect(useActiveChatStore.getState().chatId).toBeNull();
});

it('the foreground handler hides banner, list and sound for the active chat only', async () => {
  useActiveChatStore.getState().setActive('c1', null);
  expect(await handleForegroundNotification(push({ type: 'message', chatId: 'c1' }))).toEqual({
    shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false,
  });
  expect(await handleForegroundNotification(push({ type: 'message', chatId: 'c2' }))).toEqual({
    shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false,
  });
});
