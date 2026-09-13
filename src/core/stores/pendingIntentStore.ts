import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAllowedDeepLink, isInviteTokenOrCode } from '@core/deepLinks/allowlist';

/** How long a saved destination or pending action survives: an abandoned sign-up
 *  or profile completion can still pick up where it left off within this window. */
export const PENDING_INTENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type Resume = { href: string; savedAt: number };
export type AfterProfileAction = { action: 'requestJoin'; token: string };
type AfterProfile = AfterProfileAction & { savedAt: number };

type PendingIntentState = {
  /** Where to land after sign-in + mode-select. Consumed by useSwitchMode. */
  resume: Resume | null;
  /** What to do once a pro's profile is complete. Survives until used. */
  afterProfile: AfterProfile | null;
  saveResume: (href: string, now?: number) => boolean;
  /** The saved href if still allowed and fresh; cleared either way. */
  takeResume: (now?: number) => string | null;
  saveAfterProfile: (action: AfterProfileAction, now?: number) => boolean;
  /** The pending action if still valid and fresh, without consuming it. */
  peekAfterProfile: (now?: number) => AfterProfileAction | null;
  clearAfterProfile: () => void;
  clearAll: () => void;
};

const fresh = (savedAt: unknown, now: number) =>
  typeof savedAt === 'number' && now - savedAt < PENDING_INTENT_TTL_MS;

const validResume = (r: unknown, now: number): r is Resume =>
  !!r && isAllowedDeepLink((r as Resume).href) && fresh((r as Resume).savedAt, now);

const validAfterProfile = (a: unknown, now: number): a is AfterProfile =>
  !!a && (a as AfterProfile).action === 'requestJoin'
  && isInviteTokenOrCode((a as AfterProfile).token) && fresh((a as AfterProfile).savedAt, now);

type Persisted = Pick<PendingIntentState, 'resume' | 'afterProfile'>;

/**
 * Hydration merge. On a cold start from a link, /c/[token] can save before
 * AsyncStorage has finished loading, and zustand's default merge would let the
 * older stored value overwrite that save. Newest wins per field; anything
 * malformed in storage is dropped rather than trusted.
 */
export function mergePersistedIntent<T extends Persisted>(persisted: unknown, current: T): T {
  const p = (persisted && typeof persisted === 'object' ? persisted : {}) as Partial<Persisted>;
  const newer = <V extends { savedAt: number }>(stored: V | null | undefined, now: V | null) => {
    if (!stored || typeof stored.savedAt !== 'number') return now;
    if (!now) return stored;
    return now.savedAt >= stored.savedAt ? now : stored;
  };
  return {
    ...current,
    resume: newer(p.resume, current.resume),
    afterProfile: newer(p.afterProfile, current.afterProfile),
  };
}

// Same adapter as notifPromptStore: localStorage on web, AsyncStorage on native.
// (settingsStore's factory falls back to a no-op on native — do not copy it.)
const nativeOrWebStorage: StateStorage =
  typeof window !== 'undefined' && (window as unknown as { localStorage?: StateStorage }).localStorage
    ? (window as unknown as { localStorage: StateStorage }).localStorage
    : (AsyncStorage as unknown as StateStorage);

/**
 * Where a user was trying to go, kept across sign-in and profile completion.
 *
 * Every read validates: an href is handed back only if it is still an allowed
 * deep link (see core/deepLinks/allowlist) and less than 7 days old. Validation
 * happens at READ time, not just on save, because stored values outlive the code
 * that wrote them.
 */
export const usePendingIntentStore = create<PendingIntentState>()(
  persist(
    (set, get) => ({
      resume: null,
      afterProfile: null,
      saveResume: (href, now = Date.now()) => {
        if (!isAllowedDeepLink(href)) return false;
        set({ resume: { href, savedAt: now } });
        return true;
      },
      takeResume: (now = Date.now()) => {
        const r = get().resume;
        if (r) set({ resume: null });
        return validResume(r, now) ? r.href : null;
      },
      saveAfterProfile: (action, now = Date.now()) => {
        if (action.action !== 'requestJoin' || !isInviteTokenOrCode(action.token)) return false;
        set({ afterProfile: { action: action.action, token: action.token, savedAt: now } });
        return true;
      },
      peekAfterProfile: (now = Date.now()) => {
        const a = get().afterProfile;
        if (!a) return null;
        if (!validAfterProfile(a, now)) {
          set({ afterProfile: null });
          return null;
        }
        return { action: a.action, token: a.token };
      },
      clearAfterProfile: () => set({ afterProfile: null }),
      clearAll: () => set({ resume: null, afterProfile: null }),
    }),
    {
      name: 'bama-pending-intent',
      storage: createJSONStorage(() => nativeOrWebStorage),
      partialize: (s) => ({ resume: s.resume, afterProfile: s.afterProfile }),
      merge: (persisted, current) => mergePersistedIntent(persisted, current),
    },
  ),
);
