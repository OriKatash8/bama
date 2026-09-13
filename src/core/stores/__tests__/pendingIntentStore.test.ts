jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import {
  usePendingIntentStore,
  mergePersistedIntent,
  PENDING_INTENT_TTL_MS,
} from '../pendingIntentStore';

/**
 * Where the app keeps "where this user was trying to go" across sign-in and
 * profile completion. Two properties matter more than the happy path:
 *   - it never replays an href that is not an allowed deep link, even if the
 *     stored value was written by something else;
 *   - it forgets after 7 days, so a stale invite does not hijack a later sign-in.
 */

const NOW = 1_800_000_000_000;
const HREF = '/c/K7MX9P';

beforeEach(() => {
  usePendingIntentStore.setState({ resume: null, afterProfile: null });
});

const store = () => usePendingIntentStore.getState();

describe('resume href', () => {
  it('saves an allowed href and hands it back once', () => {
    expect(store().saveResume(HREF, NOW)).toBe(true);
    expect(store().takeResume(NOW + 1000)).toBe(HREF);
    expect(store().takeResume(NOW + 2000)).toBeNull();
  });

  it('refuses to save a disallowed href', () => {
    expect(store().saveResume('/admin', NOW)).toBe(false);
    expect(store().resume).toBeNull();
  });

  it('drops a stored href that is not allowed at READ time, even if it got in', () => {
    // Simulates a value written by an older build, by hand, or by a future bug.
    usePendingIntentStore.setState({ resume: { href: '//evil.example/x', savedAt: NOW } });
    expect(store().takeResume(NOW)).toBeNull();
    expect(store().resume).toBeNull();
  });

  it('forgets an href older than 7 days', () => {
    store().saveResume(HREF, NOW);
    expect(store().takeResume(NOW + PENDING_INTENT_TTL_MS)).toBeNull();
    expect(store().resume).toBeNull();
  });

  it('still hands it back just inside 7 days', () => {
    store().saveResume(HREF, NOW);
    expect(store().takeResume(NOW + PENDING_INTENT_TTL_MS - 1)).toBe(HREF);
  });

  it('a newer save replaces an older one', () => {
    store().saveResume('/c/AAAAAA', NOW);
    store().saveResume(HREF, NOW + 1);
    expect(store().takeResume(NOW + 2)).toBe(HREF);
  });
});

describe('after-profile action', () => {
  it('holds a join request for an invite until it is used', () => {
    expect(store().saveAfterProfile({ action: 'requestJoin', token: 'K7MX9P' }, NOW)).toBe(true);
    expect(store().peekAfterProfile(NOW + 1000)).toEqual({ action: 'requestJoin', token: 'K7MX9P' });
    // Peek does not consume — abandoning profile completion keeps the entry point.
    expect(store().peekAfterProfile(NOW + 2000)).toEqual({ action: 'requestJoin', token: 'K7MX9P' });
    store().clearAfterProfile();
    expect(store().peekAfterProfile(NOW + 3000)).toBeNull();
  });

  it('refuses a token that is not a token or code', () => {
    expect(store().saveAfterProfile({ action: 'requestJoin', token: '../admin' }, NOW)).toBe(false);
    expect(store().afterProfile).toBeNull();
  });

  it('drops a tampered or expired stored action at read time', () => {
    usePendingIntentStore.setState({ afterProfile: { action: 'requestJoin', token: '/admin', savedAt: NOW } });
    expect(store().peekAfterProfile(NOW)).toBeNull();
    store().saveAfterProfile({ action: 'requestJoin', token: 'K7MX9P' }, NOW);
    expect(store().peekAfterProfile(NOW + PENDING_INTENT_TTL_MS)).toBeNull();
  });
});

it('clearAll forgets both — used on logout so nothing carries to the next account', () => {
  store().saveResume(HREF, NOW);
  store().saveAfterProfile({ action: 'requestJoin', token: 'K7MX9P' }, NOW);
  store().clearAll();
  expect(store().resume).toBeNull();
  expect(store().afterProfile).toBeNull();
});

describe('hydration merge', () => {
  // On a cold start from a link, /c/[token] can save before AsyncStorage has
  // finished loading; the stored (older) value must not overwrite that save.
  it('keeps an intent saved before hydration over an older persisted one', () => {
    const current = { resume: { href: HREF, savedAt: NOW + 10 }, afterProfile: null };
    const persisted = { resume: { href: '/c/AAAAAA', savedAt: NOW }, afterProfile: null };
    expect(mergePersistedIntent(persisted, current).resume).toEqual(current.resume);
  });

  it('restores the persisted intent when nothing was saved this session', () => {
    const persisted = {
      resume: { href: HREF, savedAt: NOW },
      afterProfile: { action: 'requestJoin' as const, token: 'K7MX9P', savedAt: NOW },
    };
    const merged = mergePersistedIntent(persisted, { resume: null, afterProfile: null });
    expect(merged.resume).toEqual(persisted.resume);
    expect(merged.afterProfile).toEqual(persisted.afterProfile);
  });

  it('survives garbage in storage', () => {
    expect(mergePersistedIntent('nonsense', { resume: null, afterProfile: null }))
      .toEqual({ resume: null, afterProfile: null });
  });
});
