import { db, FieldValue } from '../lifecycle/helpers';

/**
 * A pro saved a (new) card: every fee parked at 'needs_card' goes back to 'idle'
 * so the next sweep picks it up. Attempts are NOT reset: a fee that has already
 * burned its tries stays exhausted and waits for an admin, however many cards are
 * saved.
 *
 * Filters in memory after a single-field collection-group query on
 * professionalId (the same query the hire gate makes, so no new index).
 */
export async function requeueNeedsCardFees(uid: string): Promise<number> {
  const snap = await db.collectionGroup('fees').where('professionalId', '==', uid).get();
  let n = 0;
  for (const doc of snap.docs) {
    if (doc.get('chargeState') !== 'needs_card') continue;
    await doc.ref.update({
      chargeState: 'idle',
      nextChargeAt: null,
      noCardNotifiedAt: FieldValue.delete(),
    });
    n += 1;
  }
  return n;
}
