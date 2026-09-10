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
 *   outstanding = max(0, max(round(baseAmount * feeRate), minFeeApplied) - paidAmount)
 *
 * which covers §5's top-up rule (a price rise after an early payment charges
 * only the delta), a price fall (no refund — the floor at zero does that), a
 * re-hire onto the same project, and ordinary settlement, with no branching.
 *
 * MIRRORS computeFee() in functions/src/lifecycle/helpers.ts. The server ENFORCES
 * with its copy; this one only displays. They are two implementations of one
 * formula and will drift if either is changed alone — change both.
 */

/**
 * The full fee on this professional's own accepted amount, before anything paid,
 * never below the commission floor this fee was hired under.
 *
 * `minFeeApplied ?? 0` is deliberate and load-bearing: a record written before the
 * floor existed carries no value and therefore floors at zero, so its amount is
 * exactly what it always was. Never substitute the live config value here — that
 * would reprice every historical fee the moment the minimum changed.
 */
export function grossFee(
  fee: Pick<ProjectFee, 'baseAmount' | 'feeRate' | 'minFeeApplied'>,
): number {
  return Math.max(
    Math.round((fee.baseAmount ?? 0) * (fee.feeRate ?? PLATFORM_FEE_RATE)),
    fee.minFeeApplied ?? 0,
  );
}

/** True when the floor, not the percentage, is what set this fee's amount. */
export function isMinimumFee(
  fee: Pick<ProjectFee, 'baseAmount' | 'feeRate' | 'minFeeApplied'> | null | undefined,
): boolean {
  if (!fee?.minFeeApplied) return false;
  return calculatedFee(fee) < fee.minFeeApplied;
}

/** The percentage alone, floor NOT applied — shown beside the minimum so a
 *  professional can see the arithmetic rather than being handed a number. */
export function calculatedFee(
  fee: Pick<ProjectFee, 'baseAmount' | 'feeRate'>,
): number {
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
