import { inviteExitHref } from '../inviteExitHref';

describe('inviteExitHref: every way out of the invite screen names its route group', () => {
  it('client mode stays in (client)', () => {
    expect(inviteExitHref('client', { to: 'community', chatId: 'abc123' })).toBe('/(client)/chat/abc123');
    expect(inviteExitHref('client', { to: 'chats' })).toBe('/(client)/(tabs)/chats');
    expect(inviteExitHref('client', { to: 'home' })).toBe('/(client)/(tabs)/home');
  });

  it('PROFESSIONAL mode stays in (professional) — an invite opened while in pro mode must not land in client', () => {
    expect(inviteExitHref('professional', { to: 'community', chatId: 'abc123' })).toBe('/(professional)/chat/abc123');
    expect(inviteExitHref('professional', { to: 'chats' })).toBe('/(professional)/(tabs)/chats');
    expect(inviteExitHref('professional', { to: 'home' })).toBe('/(professional)/(tabs)/dashboard');
  });

  it('no mode yet defaults to professional, like the chat room (chatGroupOf)', () => {
    expect(inviteExitHref(null, { to: 'community', chatId: 'abc123' })).toBe('/(professional)/chat/abc123');
  });

  it('is never a bare /chat path, in either mode', () => {
    for (const mode of ['client', 'professional', null] as const) {
      for (const target of [{ to: 'community', chatId: 'x1' }, { to: 'chats' }, { to: 'home' }] as const) {
        expect(inviteExitHref(mode, target)).toMatch(/^\/\((client|professional)\)\//);
      }
    }
  });

  it('keeps an odd chat id inside one path segment', () => {
    expect(inviteExitHref('client', { to: 'community', chatId: '../admin' })).toBe('/(client)/chat/..%2Fadmin');
  });
});
