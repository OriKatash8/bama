import type { ProjectFee } from '@core/types/project';

/**
 * Which plain-language line, if any, describes where the automatic charge of a fee
 * stands. A key under `balance.charge_state_*`; null = say nothing.
 *
 * Informational only: nothing in the app is gated on it. Callers show it only when
 * the card feature is enabled for this user, so an unused feature never talks about
 * charging.
 */
export type ChargeStateKey = 'idle' | 'charging' | 'succeeded' | 'failed' | 'needs_card';

export function chargeStateKey(
  fee: Pick<ProjectFee, 'chargeState' | 'engagementStatus' | 'feePaid' | 'status'>,
): ChargeStateKey | null {
  // Only a completed, unsettled engagement has anything to charge; a disputed or
  // cancelled one is explained by its own note.
  if (fee.engagementStatus !== 'completed') return null;
  const state = fee.chargeState ?? 'idle';
  if (state === 'succeeded') return 'succeeded';
  if (fee.feePaid === true || fee.status === 'paid' || fee.status === 'not_owed') return null;
  return state;
}
