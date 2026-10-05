jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  usePendingIntentStore,
  mergePersistedIntent,
  PENDING_INTENT_TTL_MS,
  HYDRATION_WAIT_MS,
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

// takeResume refuses to run before storage has hydrated; the cases below that are
// not about hydration need a hydrated store.
beforeAll(async () => {
  await usePendingIntentStore.persist.rehydrate();
});

beforeEach(async () => {
  jest.useRealTimers();
  await AsyncStorage.clear();
  usePendingIntentStore.setState({ resume: null, afterProfile: null, consumedAt: 0 });
  await usePendingIntentStore.persist.rehydrate();
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

describe('hydration guard', () => {
  const KEY = 'bama-pending-intent';
  const stored = (resume: { href: string; savedAt: number } | null) =>
    JSON.stringify({ state: { resume, afterProfile: null }, version: 0 });

  it('a sync take before hydration returns null and does NOT consume a resume saved in memory', async () => {
    // A cold start from a link: /c/[token] saved before AsyncStorage answered.
    const fresh = Date.now();
    const hydrating = usePendingIntentStore.persist.rehydrate(); // hasHydrated() is false until this settles
    expect(usePendingIntentStore.persist.hasHydrated()).toBe(false);
    store().saveResume(HREF, fresh);
    expect(store().takeResume(fresh)).toBeNull();
    expect(store().resume?.href).toBe(HREF); // untouched, not cleared
    await hydrating;
    expect(store().takeResume(fresh)).toBe(HREF); // and usable once storage has answered
  });

  it('takeResumeWhenReady waits for slow storage, then hands the href back exactly once', async () => {
    const fresh = Date.now();
    await AsyncStorage.setItem(KEY, stored({ href: HREF, savedAt: fresh }));
    const hydrating = usePendingIntentStore.persist.rehydrate();
    const waiting = store().takeResumeWhenReady();
    await hydrating;
    await expect(waiting).resolves.toBe(HREF);
    await expect(store().takeResumeWhenReady()).resolves.toBeNull();
  });

  it('a second takeResume returns null and the persisted copy is cleared', async () => {
    store().saveResume(HREF, NOW);
    expect(store().takeResume(NOW + 1)).toBe(HREF);
    expect(store().takeResume(NOW + 2)).toBeNull();
    await Promise.resolve(); // let the persist write land
    const raw = await AsyncStorage.getItem(KEY);
    expect(JSON.parse(raw as string).state.resume).toBeNull();
  });

  it('a consumed resume is not resurrected by a late hydration of the stored copy', async () => {
    store().saveResume(HREF, NOW);
    expect(store().takeResume(NOW + 1)).toBe(HREF);
    // Storage still holds the old copy, as it would if hydration finished after the take.
    await AsyncStorage.setItem(KEY, stored({ href: HREF, savedAt: NOW }));
    await usePendingIntentStore.persist.rehydrate();
    expect(store().resume).toBeNull();
    expect(store().takeResume(NOW + 3)).toBeNull();
  });

  it('clearAll is not undone by a late hydration either', async () => {
    store().saveResume(HREF, NOW);
    store().clearAll();
    await AsyncStorage.setItem(KEY, stored({ href: HREF, savedAt: NOW }));
    await usePendingIntentStore.persist.rehydrate();
    expect(store().resume).toBeNull();
  });

  it('a resume saved AFTER a consumed one still survives hydration', async () => {
    store().saveResume(HREF, NOW);
    store().takeResume(NOW + 1);
    store().saveResume('/c/AAAAAA', NOW + 10);
    await usePendingIntentStore.persist.rehydrate();
    expect(store().resume?.href).toBe('/c/AAAAAA');
  });

  it('gives up waiting after the timeout and takes from memory', async () => {
    jest.useFakeTimers();
    store().saveResume(HREF, Date.now());
    // Storage that never answers: hydration cannot finish.
    jest.spyOn(AsyncStorage, 'getItem').mockImplementationOnce(() => new Promise(() => {}));
    void usePendingIntentStore.persist.rehydrate();
    const waiting = store().takeResumeWhenReady();
    await jest.advanceTimersByTimeAsync(HYDRATION_WAIT_MS);
    await expect(waiting).resolves.toBe(HREF);
  });
});
