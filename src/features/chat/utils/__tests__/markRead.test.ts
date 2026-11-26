import { shouldMarkRead, unreadFieldPath } from '../markRead';

const base = { ready: true, focused: true, foreground: true, unread: 2 };

describe('shouldMarkRead', () => {
  it('marks when on screen, in the foreground, with something counted', () => {
    expect(shouldMarkRead(base)).toBe(true);
  });
  it('does not write when nothing is counted (no loop against its own snapshot)', () => {
    expect(shouldMarkRead({ ...base, unread: 0 })).toBe(false);
  });
  it('waits for the open-time count to be captured, or the divider would read 0', () => {
    expect(shouldMarkRead({ ...base, ready: false })).toBe(false);
  });
  it('does not count a chat as read while it is behind another screen or the app is backgrounded', () => {
    expect(shouldMarkRead({ ...base, focused: false })).toBe(false);
    expect(shouldMarkRead({ ...base, foreground: false })).toBe(false);
  });
});

describe('unreadFieldPath', () => {
  it('is my own entry of the chat counter for dm / group / purchase', () => {
    for (const t of ['dm', 'group', 'purchase']) expect(unreadFieldPath(t, 'u1', null)).toBe('unreadCount.u1');
  });
  it('is my entry for the OPEN channel in a community — never a community-wide count', () => {
    expect(unreadFieldPath('community', 'u1', 'general')).toBe('channelUnread.u1.general');
    expect(unreadFieldPath('community', 'u1', null)).toBeNull();
  });
  it('is nothing until the chat type is known', () => {
    expect(unreadFieldPath(null, 'u1', null)).toBeNull();
  });
});
