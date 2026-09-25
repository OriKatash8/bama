import { renderHook, act } from '@testing-library/react-native';
import { useSearchJump } from '../useSearchJump';
import { useChatJumpStore } from '@core/stores/chatJumpStore';

/**
 * Back in the chat room after tapping a search result: switch to the result's
 * channel, and jump to the message only once that channel's messages include it
 * — jumping earlier is a no-op against the previous channel's list. Once.
 */

// Focus is modelled as mount; each test re-renders to deliver new messages.
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return { useFocusEffect: (cb: () => void) => React.useEffect(cb, [cb]) };
});

type Props = { activeChannelId: string; messageIds: string[] };
const setActiveChannelId = jest.fn();
const jumpToMessage = jest.fn();

function mount(initial: Props) {
  return renderHook((p: Props) => useSearchJump({
    chatId: 'c1',
    activeChannelId: p.activeChannelId,
    messageIds: p.messageIds,
    setActiveChannelId,
    jumpToMessage,
  }), { initialProps: initial });
}

beforeEach(() => {
  jest.clearAllMocks();
  useChatJumpStore.setState({ pending: null });
});

it('switches channel, then jumps once the message has loaded', () => {
  useChatJumpStore.getState().request({ chatId: 'c1', channelId: 'market', messageId: 'm9' });
  const r = mount({ activeChannelId: 'general', messageIds: ['g1', 'g2'] });

  expect(setActiveChannelId).toHaveBeenCalledWith('market');
  expect(jumpToMessage).not.toHaveBeenCalled();

  // The channel switched, but its messages have not arrived yet.
  r.rerender({ activeChannelId: 'market', messageIds: ['g1', 'g2'] });
  expect(jumpToMessage).not.toHaveBeenCalled();

  r.rerender({ activeChannelId: 'market', messageIds: ['m8', 'm9'] });
  expect(jumpToMessage).toHaveBeenCalledWith('m9');

  r.rerender({ activeChannelId: 'market', messageIds: ['m8', 'm9', 'm10'] });
  expect(jumpToMessage).toHaveBeenCalledTimes(1);
});

it('jumps straight away when already on that channel with the message loaded', () => {
  useChatJumpStore.getState().request({ chatId: 'c1', channelId: 'general', messageId: 'g2' });
  mount({ activeChannelId: 'general', messageIds: ['g1', 'g2'] });
  expect(jumpToMessage).toHaveBeenCalledWith('g2');
});

it('does nothing without a request, or with one for another chat', () => {
  useChatJumpStore.getState().request({ chatId: 'other', channelId: 'general', messageId: 'g2' });
  mount({ activeChannelId: 'general', messageIds: ['g1', 'g2'] });
  act(() => {});
  expect(setActiveChannelId).not.toHaveBeenCalled();
  expect(jumpToMessage).not.toHaveBeenCalled();
  expect(useChatJumpStore.getState().pending?.chatId).toBe('other');
});
