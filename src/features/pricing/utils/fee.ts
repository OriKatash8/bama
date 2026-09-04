import { PLATFORM_FEE_RATE } from '@core/constants/pricing';
import type { ProjectFee } from '@core/types/project';

/**
 * Fee arithmetic. Every rate comes from `@core/constants/pricing` and every
 * amount from the professional's own fee document — nothing here is hardcoded,
 * and no number is ever baked into a translated string (they go in as
 * `{{vars}}`).
 *
 * All of it derives from one expression:
 *
 *   outstanding = max(0, round(baseAmount * feeRate) - paidAmount)
 *
 * which covers §5's top-up rule (a price rise after an early payment charges
 * only the delta), a price fall (no refund — the floor at zero does that), a
 * re-hire onto the same project, and ordinary settlement, with no branching.
 */

/** The full fee on this professional's own accepted amount, before anything paid. */
export function grossFee(fee: Pick<ProjectFee, 'baseAmount' | 'feeRate'>): number {
  return Math.round((fee.baseAmount ?? 0) * (fee.feeRate ?? PLATFORM_FEE_RATE));
}

/**
 * What this professional still owes.
 *
 * After completion the server stores `feeDue` already net of `paidAmount`, so
 * that is authoritative. Before completion it is unset and the amount has to be
 * derived — which is the early-payment case (§5).
 */
export function outstandingFee(fee: ProjectFee | null | undefined): number {
  if (!fee) return 0;
  if (fee.feeStatus !== 'owed') return 0;       // 'included' / 'exempt' owe nothing
  if (fee.feePaid === true) return 0;
  if (typeof fee.feeDue === 'number') return Math.max(0, fee.feeDue);
  return Math.max(0, grossFee(fee) - (fee.paidAmount ?? 0));
}

/** True when this professional owes money on this project right now. */
export function owesFee(fee: ProjectFee | null | undefined): boolean {
  return outstandingFee(fee) > 0;
}

/**
 * The rate as a whole-number percent, for display (`3` from `0.03`).
 * Interpolated into strings as a var so the percentage is never written into
 * Hebrew or English copy.
 */
export function feePercent(fee?: Pick<ProjectFee, 'feeRate'> | null): number {
  return Math.round((fee?.feeRate ?? PLATFORM_FEE_RATE) * 100);
}
