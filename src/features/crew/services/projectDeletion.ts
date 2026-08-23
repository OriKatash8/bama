import { queryDocuments, deleteDocument, where } from '@core/firebase/firestore';
import type { PriceOffer, BundleOffer } from '@core/types/project';

/**
 * Delete a project together with the data that depends on it, so nothing is
 * orphaned once the project is gone: its priceOffers, its bundleOffers, and
 * (optionally) its group chat. Without this cleanup, deleting a project left
 * its offers behind in Firestore forever.
 */
export async function deleteProjectAndOffers(projectId: string, chatId?: string): Promise<void> {
  const [offers, bundles] = await Promise.all([
    queryDocuments<PriceOffer>('priceOffers', where('projectId', '==', projectId)),
    queryDocuments<BundleOffer>('bundleOffers', where('projectId', '==', projectId)),
  ]);

  await Promise.all([
    ...offers.map((o) => deleteDocument(`priceOffers/${o.id}`)),
    ...bundles.map((b) => deleteDocument(`bundleOffers/${b.id}`)),
  ]);

  await deleteDocument(`projects/${projectId}`);
  if (chatId) await deleteDocument(`chats/${chatId}`);
}
