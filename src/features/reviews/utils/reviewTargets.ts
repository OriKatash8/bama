import type { FilledSlot } from '@core/types/project';

/**
 * The professionals a client may review on a completed project: each unique pro
 * in `filledSlots` who is still in `professionalIds`.
 *
 * `filledSlots` alone is not enough. A pro released from the project leaves
 * `professionalIds`, and the review rule (firestore.rules, reviews create) only
 * accepts a pro still in it — offering a departed pro meant a denied write.
 * A legacy project with no `professionalIds` keeps everyone in `filledSlots`.
 */
export function reviewableProIds(
  filledSlots: Pick<FilledSlot, 'professionalId'>[] | undefined,
  professionalIds: string[] | undefined,
): string[] {
  const unique = [...new Set((filledSlots ?? []).map((s) => s.professionalId).filter(Boolean))];
  if (!Array.isArray(professionalIds)) return unique;
  return unique.filter((id) => professionalIds.includes(id));
}
