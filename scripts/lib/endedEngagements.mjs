/**
 * `projects/{id}.endedEngagementIds` — the professionals whose engagement has
 * ended, so their agreed price may no longer move.
 *
 * MIRRORS derive.ts (deriveProjectState → endedEngagementIds): every fee doc
 * whose engagementStatus the server's `engagementPriceFrozen` accepts, in fee
 * order, keyed by the doc's own `professionalId` field. The predicate is passed
 * in rather than copied, so the backfill uses the server's own compiled rule.
 */

/** @returns {{ ids: string[], missingProfessionalId: string[] }} */
export function deriveEndedEngagementIds(fees, isFrozen) {
  const ids = [];
  const missingProfessionalId = [];
  for (const f of fees) {
    if (!isFrozen(f.engagementStatus)) continue;
    if (typeof f.professionalId === 'string' && f.professionalId.length > 0) ids.push(f.professionalId);
    else missingProfessionalId.push(f._docId ?? '(unknown)');
  }
  return { ids, missingProfessionalId };
}

/**
 * What to write for one project. An absent array already reads as "nobody has
 * finished" on the client, so an empty result is never written onto a project
 * that has none; a present array is corrected only when its SET of ids differs.
 */
export function planEndedEngagementIds(current, fees, isFrozen) {
  const { ids, missingProfessionalId } = deriveEndedEngagementIds(fees, isFrozen);
  const write = Array.isArray(current)
    ? !(current.length === ids.length && ids.every((id) => current.includes(id)))
    : ids.length > 0;
  return { write, next: ids, missingProfessionalId };
}
