import {
  JOIN_REQUEST_NOTIFICATION_TYPE,
  JOIN_REQUEST_NOTIFY_COOLDOWN_MS,
  joinRequestNotice,
  joinRequestNotificationId,
  joinRequestNoticePath,
  shouldNotify,
} from '../communities/joinRequestNotice';

describe('joinRequestNotice', () => {
  it('Hebrew: the community in the title, who asked in the body', () => {
    expect(joinRequestNotice('he', { communityName: 'Gaffers Guild', requesterName: 'Noa Bareket' })).toEqual({
      title: 'Gaffers Guild · בקשת הצטרפות',
      message: 'Noa Bareket ביקש/ה להצטרף לקהילה',
    });
  });

  it('English', () => {
    expect(joinRequestNotice('en', { communityName: 'Gaffers Guild', requesterName: 'Noa Bareket' })).toEqual({
      title: 'Gaffers Guild · Join request',
      message: 'Noa Bareket asked to join your community',
    });
  });

  it('a missing or blank requester name reads as "someone", not "undefined"', () => {
    for (const requesterName of [undefined, null, '', '   ', 42]) {
      expect(joinRequestNotice('en', { communityName: 'C', requesterName }).message).toBe('Someone asked to join your community');
      expect(joinRequestNotice('he', { communityName: 'C', requesterName }).message).toBe('מישהו ביקש/ה להצטרף לקהילה');
    }
  });

  it('a missing community name falls back to the app name', () => {
    expect(joinRequestNotice('en', { communityName: undefined, requesterName: 'Noa' }).title).toBe('BAMA');
    expect(joinRequestNotice('en', { communityName: '  ', requesterName: 'Noa' }).title).toBe('BAMA');
  });

  it('clips an absurdly long name rather than sending it whole', () => {
    const long = 'x'.repeat(500);
    const n = joinRequestNotice('en', { communityName: long, requesterName: long });
    expect(n.title.length).toBeLessThan(100);
    expect(n.message.length).toBeLessThan(100);
  });
});

describe('dedupe id', () => {
  it('is derived from the event id, so a redelivered event maps to the same document', () => {
    expect(joinRequestNotificationId('evt-1')).toBe(joinRequestNotificationId('evt-1'));
    expect(joinRequestNotificationId('evt-1')).not.toBe(joinRequestNotificationId('evt-2'));
  });
});

it('the notification type is the one the app routes on (useNotificationRouting)', () => {
  expect(JOIN_REQUEST_NOTIFICATION_TYPE).toBe('community_join_request');
});

describe('the cooldown', () => {
  const HOUR = 60 * 60 * 1000;
  const NOW = 1_800_000_000_000;

  it('is one hour', () => {
    expect(JOIN_REQUEST_NOTIFY_COOLDOWN_MS).toBe(HOUR);
  });

  it('notifies when there is no stamp yet', () => {
    expect(shouldNotify(undefined, NOW)).toBe(true);
    expect(shouldNotify(null, NOW)).toBe(true);
  });

  it('stays silent inside the window and speaks from exactly one hour on', () => {
    expect(shouldNotify(NOW - 1, NOW)).toBe(false);
    expect(shouldNotify(NOW - 30 * 60 * 1000, NOW)).toBe(false);
    expect(shouldNotify(NOW - (HOUR - 1), NOW)).toBe(false);
    expect(shouldNotify(NOW - HOUR, NOW)).toBe(true);
    expect(shouldNotify(NOW - 5 * HOUR, NOW)).toBe(true);
  });

  it('a stamp it cannot read does not silence the owner', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, '123' as unknown as number]) {
      expect(shouldNotify(bad, NOW)).toBe(true);
    }
  });

  it('a stamp from the far future (clock trouble) cannot silence the owner for good', () => {
    expect(shouldNotify(NOW + 10 * HOUR, NOW)).toBe(true);
    // ...but a stamp only slightly ahead of this machine's clock is still "just now".
    expect(shouldNotify(NOW + 1000, NOW)).toBe(false);
  });

  it('takes a custom window', () => {
    expect(shouldNotify(NOW - 5000, NOW, 10_000)).toBe(false);
    expect(shouldNotify(NOW - 10_000, NOW, 10_000)).toBe(true);
  });

  it('keeps the stamp where only the server can reach it: a chats subcollection no rule matches', () => {
    expect(joinRequestNoticePath('c1', 'u1')).toBe('chats/c1/joinRequestNotices/u1');
  });
});
