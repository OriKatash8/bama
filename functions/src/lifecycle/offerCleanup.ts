import { db } from './helpers';

/** Firestore's hard limit is 500 writes per batch — leave headroom. */
export const BATCH_LIMIT = 400;

type Ref = Parameters<ReturnType<typeof db.batch>['delete']>[0];

/** Delete any number of documents, a batch at a time. */
export async function deleteInChunks(refs: Ref[]): Promise<void> {
  for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    refs.slice(i, i + BATCH_LIMIT).forEach((r) => batch.delete(r));
    await batch.commit();
  }
}

/**
 * Remove a cancelled project's offers that nobody accepted — the client's
 * "delete project" is a cancel, and a pending offer on it could never be
 * accepted again (hire refuses a cancelled project), yet both sides kept seeing
 * it. Accepted / rejected / removed offers stay: they are the hired pros' record.
 */
export async function deletePendingOffers(projectId: string): Promise<{ priceOffers: number; bundleOffers: number }> {
  const [offers, bundles] = await Promise.all([
    db.collection('priceOffers').where('projectId', '==', projectId).where('status', '==', 'pending').get(),
    db.collection('bundleOffers').where('projectId', '==', projectId).where('status', '==', 'pending').get(),
  ]);
  await deleteInChunks([...offers.docs.map((d) => d.ref), ...bundles.docs.map((d) => d.ref)]);
  return { priceOffers: offers.size, bundleOffers: bundles.size };
}
