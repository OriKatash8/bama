import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** How long a dismissal silences the prompt everywhere. */
export const NOTIF_PROMPT_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Per-device record of when the notification-permission prompt was dismissed.
 *
 * Keyed by USER ONLY, never by surface. Dismissing the banner on the chat list has
 * to silence it on the dashboard too, and keying by user is what makes that true by
 * construction rather than by two stores being kept in step.
 *
 * Permission state itself is NOT stored here — the OS reports it live via
 * getNotificationPermissionState(), which already distinguishes never-asked from
 * granted from denied. This holds only our own prompt's dismissal, which is app
 * state the OS knows nothing about.
 */
type NotifPromptState = {
  /** userId -> epoch ms until which the prompt stays hidden. */
  dismissedUntil: Record<string, number>;
  dismiss: (userId: string, now?: number) => void;
};

// Mirrors offersSeenStore. NOTE: do not copy settingsStore's storage factory —
// it falls back to a no-op object on native, so nothing would persist.
const nativeOrWebStorage: StateStorage =
  typeof window !== 'undefined' && (window as unknown as { localStorage?: StateStorage }).localStorage
    ? (window as unknown as { localStorage: StateStorage }).localStorage
    : (AsyncStorage as unknown as StateStorage);

export const useNotifPromptStore = create<NotifPromptState>()(
  persist(
    (set, get) => ({
      dismissedUntil: {},
      dismiss: (userId, now = Date.now()) => {
        set({ dismissedUntil: { ...get().dismissedUntil, [userId]: now + NOTIF_PROMPT_COOLDOWN_MS } });
      },
    }),
    {
      name: 'bama-notif-prompt',
      storage: createJSONStorage(() => nativeOrWebStorage),
      partialize: (state) => ({ dismissedUntil: state.dismissedUntil }),
    },
  ),
);

/** True when the prompt is currently silenced for this user. */
export function isPromptSnoozed(
  dismissedUntil: Record<string, number>,
  userId: string | undefined,
  now: number = Date.now(),
): boolean {
  if (!userId) return false;
  return now < (dismissedUntil[userId] ?? 0);
}
