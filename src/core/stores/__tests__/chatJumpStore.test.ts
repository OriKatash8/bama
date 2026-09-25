import { useChatJumpStore } from '../chatJumpStore';

/**
 * A search result asks the chat room to open a channel at a message. The room
 * takes the request once — a second focus must not jump again — and only its
 * own: a request for another chat is left for that chat.
 */

beforeEach(() => useChatJumpStore.setState({ pending: null }));

it('hands the request to its chat once, then forgets it', () => {
  useChatJumpStore.getState().request({ chatId: 'c1', channelId: 'market', messageId: 'm9' });

  expect(useChatJumpStore.getState().take('c1')).toEqual({ chatId: 'c1', channelId: 'market', messageId: 'm9' });
  expect(useChatJumpStore.getState().take('c1')).toBeNull();
});

it('leaves a request for another chat alone', () => {
  useChatJumpStore.getState().request({ chatId: 'c2', channelId: 'general', messageId: 'm1' });

  expect(useChatJumpStore.getState().take('c1')).toBeNull();
  expect(useChatJumpStore.getState().take('c2')?.messageId).toBe('m1');
});

it('a newer request replaces an older one', () => {
  useChatJumpStore.getState().request({ chatId: 'c1', channelId: 'a', messageId: 'old' });
  useChatJumpStore.getState().request({ chatId: 'c1', channelId: 'b', messageId: 'new' });
  expect(useChatJumpStore.getState().take('c1')?.messageId).toBe('new');
});
