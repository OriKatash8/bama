import { usePendingIntentStore } from '@core/stores/pendingIntentStore';
import { nextAuthRoute, type AuthState } from './nextAuthRoute';

/**
 * Where an auth step (consent, email verification, setup) sends the user when it
 * finishes: nextAuthRoute, except that a saved invite link wins over the app home.
 *
 * The saved link is a destination override, consumed only where a FINAL
 * destination is chosen. When the next step is another auth screen (including
 * mode-select, which is what a brand-new account with no restored mode gets) it
 * is left alone: mode-select ends in useSwitchMode, which takes it there. This is
 * for the other path, a returning user whose mode was restored, where nextAuthRoute
 * skips mode-select and would otherwise drop the link.
 *
 * With no saved link this returns exactly what nextAuthRoute returns.
 *
 * Not folded into nextAuthRoute: that is pure and index.tsx calls it while
 * rendering, and a take during render would be spent by a double render and lost.
 * Async because the take waits for the persisted store to load (takeResumeWhenReady).
 */
export async function postStepRoute(state: AuthState): Promise<string> {
  const next = nextAuthRoute(state);
  if (next.startsWith('/(auth)')) return next;
  return (await usePendingIntentStore.getState().takeResumeWhenReady()) ?? next;
}
