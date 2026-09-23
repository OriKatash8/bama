import { renderHook, act } from '@testing-library/react-native';
import { onSnapshot, updateDoc } from 'firebase/firestore';
import { usePendingMentions, MAX_PENDING_MENTIONS } from '../usePendingMentions';
import { useAuthStore } from '@core/stores/authStore';

/**
 * Mentions waiting for the user — the state behind the chat-list @ pill and
 * jump-to-mention.
 *
 * Deliberately NOT derived from unreadCount: an unread count means "activity"
 * and a mention means "someone needs you", and community channels never bump
 * unreadCount at all, so a pill derived from it would never appear there. That
 * independence is also what lets clearing work through one path for group chats
 * and channels alike.
 */

jest.mock('firebase/firestore', () => ({
  doc: jest.fn((_db, ...p: string[]) => ({ path: p.join('/') })),
  onSnapshot: jest.fn(),
  updateDoc: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@core/firebase/config', () => ({ db: {} }));

const mockOnSnapshot = onSnapshot as jest.Mock;
const mockUpdateDoc = updateDoc as jest.Mock;

const entry = (over: Partial<{ chatId: string; channelId: string | null; messageId: string; at: { seconds: number } }>) => ({
  chatId: 'c1', channelId: null, messageId: 'm1', at: { seconds: 100 }, ...over,
});

/** Feed the hook a user document. */
function seed(pendingMentions: unknown[]) {
  mockOnSnapshot.mockImplementation((_ref, onNext: (s: unknown) => void) => {
    onNext({ data: () => ({ pendingMentions }) });
    return () => {};
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateDoc.mockResolvedValue(undefined);
  useAuthStore.setState({
    user: { id: 'u-me', email: 'm@e.com', displayName: 'Me', photoURL: null, createdAt: { seconds: 0, nanoseconds: 0 } },
    activeMode: 'client', isLoading: false,
  });
});

describe('what the chat list reads', () => {
  it('reports the chats with a mention waiting', () => {
    seed([entry({ chatId: 'c1' }), entry({ chatId: 'c2', messageId: 'm2' })]);
    const { result } = renderHook(() => usePendingMentions());
    expect([...result.current.chatIds].sort()).toEqual(['c1', 'c2']);
  });

  it('is empty for a signed-out user, without a write', () => {
    useAuthStore.setState({ user: null });
    const { result } = renderHook(() => usePendingMentions());
    expect(result.current.all).toEqual([]);
    expect(mockOnSnapshot).not.toHaveBeenCalled();
  });
});

describe('which mention to jump to', () => {
  it('takes the OLDEST unseen one for that chat', () => {
    seed([
      entry({ messageId: 'newer', at: { seconds: 300 } }),
      entry({ messageId: 'oldest', at: { seconds: 100 } }),
      entry({ messageId: 'middle', at: { seconds: 200 } }),
    ]);
    const { result } = renderHook(() => usePendingMentions());
    expect(result.current.firstFor('c1', null)?.messageId).toBe('oldest');
  });

  it('keys on chat AND channel, so another channel does not match', () => {
    seed([entry({ chatId: 'com', channelId: 'gear', messageId: 'in-gear' })]);
    const { result } = renderHook(() => usePendingMentions());
    expect(result.current.firstFor('com', 'gear')?.messageId).toBe('in-gear');
    expect(result.current.firstFor('com', 'general')).toBeUndefined();
    expect(result.current.firstFor('com', null)).toBeUndefined();
  });

  it('keeps only the newest entries when the list has run away', () => {
    // The server appends with arrayUnion and does not cap — capping there would
    // cost one read per recipient, which is the fan-out cost the trigger exists
    // to avoid. The trim happens here, where somebody is actually looking.
    seed(Array.from({ length: 70 }, (_, i) => entry({ messageId: `m${i}`, at: { seconds: i } })));
    const { result } = renderHook(() => usePendingMentions());
    expect(result.current.all).toHaveLength(MAX_PENDING_MENTIONS);
    expect(result.current.all[0].messageId).toBe('m20');
  });
});

describe('clearing on open', () => {
  it('drops only this chat and channel', async () => {
    seed([
      entry({ chatId: 'com', channelId: 'gear', messageId: 'a' }),
      entry({ chatId: 'com', channelId: 'general', messageId: 'b' }),
      entry({ chatId: 'other', channelId: null, messageId: 'c' }),
    ]);
    const { result } = renderHook(() => usePendingMentions());
    await act(async () => { await result.current.clear('com', 'gear'); });

    const written = mockUpdateDoc.mock.calls[0][1].pendingMentions as { messageId: string }[];
    expect(written.map((m) => m.messageId).sort()).toEqual(['b', 'c']);
  });

  it('works the same for a group chat, which has no channel', async () => {
    seed([entry({ chatId: 'g1', channelId: null, messageId: 'a' }), entry({ chatId: 'g2', messageId: 'b' })]);
    const { result } = renderHook(() => usePendingMentions());
    await act(async () => { await result.current.clear('g1', null); });
    expect((mockUpdateDoc.mock.calls[0][1].pendingMentions as { messageId: string }[]).map((m) => m.messageId))
      .toEqual(['b']);
  });

  it('writes NOTHING when there is nothing to remove', async () => {
    // The rule only lets the owner shrink the list, so a no-change write would
    // be denied outright.
    seed([entry({ chatId: 'c1' })]);
    const { result } = renderHook(() => usePendingMentions());
    await act(async () => { await result.current.clear('somewhere-else', null); });
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });
});
