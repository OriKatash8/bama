import type { ProjectFee } from '@core/types/project';
import type { Timestamp } from '@core/types/common';

/**
 * The overdue-fee rule, client copy. MIRRORS functions/src/pricing.ts
 * (effectiveOverdueAt / feeIsOverdue / earliestOverdueAt) clause for clause — the
 * server enforces with its copy (hireProfessional, and the offer rule through
 * feeBlocks/{uid}.blockedFrom); this one only explains. The test table in
 * __tests__/overdue.test.ts is the server's, row for row.
 */

type OverdueFields = Pick<
  ProjectFee,
  'feeStatus' | 'status' | 'feePaid' | 'feeDue' | 'engagementStatus' | 'overdueAt' | 'chargeDueAt'
>;

const EXEMPT_ENGAGEMENT = new Set(['disputed', 'cancelled', 'withdrawn']);

function millisOf(t: Timestamp | null | undefined): number | undefined {
  return typeof t?.seconds === 'number' ? t.seconds * 1000 + Math.floor((t.nanoseconds ?? 0) / 1e6) : undefined;
}

/** When this fee starts blocking: max(overdueAt, chargeDueAt). Undefined = never. */
export function effectiveOverdueAt(fee: OverdueFields): number | undefined {
  if (fee.feeStatus !== 'owed') return undefined;
  if (fee.feePaid === true) return undefined;
  if (fee.status === 'paid' || fee.status === 'not_owed') return undefined;
  if (typeof fee.feeDue === 'number' && fee.feeDue <= 0) return undefined;
  if (EXEMPT_ENGAGEMENT.has(fee.engagementStatus ?? '')) return undefined;
  const overdueAt = millisOf(fee.overdueAt);
  if (overdueAt === undefined) return undefined;
  const chargeDueAt = millisOf(fee.chargeDueAt);
  return chargeDueAt === undefined ? overdueAt : Math.max(overdueAt, chargeDueAt);
}

export function feeIsOverdue(fee: OverdueFields, now: number): boolean {
  const at = effectiveOverdueAt(fee);
  return at !== undefined && now >= at;
}

export function earliestOverdueAt(fees: Iterable<OverdueFields>): number | null {
  let min: number | null = null;
  for (const fee of fees) {
    const at = effectiveOverdueAt(fee);
    if (at !== undefined && (min === null || at < min)) min = at;
  }
  return min;
}
