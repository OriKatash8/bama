import { useEffect } from 'react';
import { useAuthStore } from '@core/stores/authStore';
import { writeLastMode } from '@core/storage/lastMode';
import type { ActiveMode } from '@core/types/user';

/**
 * For the (client) / (professional) group layouts. A deep link or a web reload
 * opens straight into a group, past the root. Wait for auth to finish loading —
 * it restores the last mode — and if there is still no mode, this group IS the
 * mode: set it and remember it, rather than rendering the app with no mode
 * (which skipped the pro lock and client onboarding, and sent mode-dependent
 * links to the wrong group).
 *
 * Returns true while the layout should show a loading screen instead.
 */
export function useAdoptGroupMode(mode: ActiveMode): boolean {
  const isLoading = useAuthStore((s) => s.isLoading);
  const userId = useAuthStore((s) => s.user?.id);
  const activeMode = useAuthStore((s) => s.activeMode);
  const missing = !isLoading && !!userId && activeMode === null;

  useEffect(() => {
    if (!missing || !userId) return;
    useAuthStore.getState().setActiveMode(mode);
    void writeLastMode(userId, mode);
  }, [missing, userId, mode]);

  return isLoading || missing;
}
