import { queryDocuments, where } from '@core/firebase/firestore';
import type { Review } from '@core/types/project';

/**
 * Every published review for a professional.
 *
 * The `published` constraint is REQUIRED, not an optimisation. The Firestore
 * rule for listing reviews is `resource.data.published == true`, and a rule on a
 * list must be provable from the query — so an unconstrained
 * `where('professionalId','==',uid)` is denied outright.
 *
 * It is also the security boundary. That unconstrained query used to be allowed,
 * and it returned a professional their own HELD review — rating and body — onto
 * their device, where only a client-side filter hid it. Spec §6 says a
 * professional sees nothing of a held review before it publishes; this is what
 * enforces it.
 *
 * Two equality filters need no composite index (zigzag merge join).
 */
export async function fetchPublishedReviews(professionalId: string): Promise<Review[]> {
  return queryDocuments<Review>(
    'reviews',
    where('professionalId', '==', professionalId),
    where('published', '==', true),
  );
}
