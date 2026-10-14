import { hiddenSenders, isHiddenByBlock } from '../hidden';

describe('isHiddenByBlock', () => {
  it('hides a blocked person\'s messages', () => {
    expect(isHiddenByBlock({ senderId: 'bob' }, ['bob'])).toBe(true);
    expect(isHiddenByBlock({ senderId: 'carol' }, ['bob'])).toBe(false);
    expect(isHiddenByBlock({ senderId: 'bob' }, [])).toBe(false);
  });

  it('never hides what the app itself says, even from a blocked member', () => {
    expect(isHiddenByBlock({ senderId: 'bob', system: true }, ['bob'])).toBe(false);
    expect(isHiddenByBlock({ senderId: 'bob', kind: 'project_closed' }, ['bob'])).toBe(false);
    expect(isHiddenByBlock({ senderId: 'system' }, ['system'])).toBe(false);
  });

  it('lists only blocked senders that actually have a visible message', () => {
    const msgs = [{ senderId: 'bob' }, { senderId: 'bob' }, { senderId: 'carol' }, { senderId: 'dan', system: true }];
    expect(hiddenSenders(msgs, ['bob', 'dan', 'erin'])).toEqual(['bob']);
  });
});
