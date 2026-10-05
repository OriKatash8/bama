import {
  JOIN_REQUEST_NOTIFICATION_TYPE,
  joinRequestNotice,
  joinRequestNotificationId,
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
