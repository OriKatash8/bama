import { useState } from 'react';
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  arrayUnion,
} from 'firebase/firestore';
import { db } from '@core/firebase/config';
import { getDocument, updateDocument } from '@core/firebase/firestore';
import type { BundleOffer, PriceOffer } from '@core/types/project';
import { createProjectGroup, addMemberToGroup } from '../../chat/services/chatService';

export function useAcceptBundleOffer() {
  const [isAccepting, setIsAccepting] = useState<string | null>(null);

  async function acceptBundle(bundle: BundleOffer): Promise<void> {
    setIsAccepting(bundle.id);
    try {
      // Collect competing individual offers across all bundle slots
      const competingOfferIds = new Set<string>();
      for (const slot of bundle.slots) {
        const snap = await getDocs(
          query(
            collection(db, 'priceOffers'),
            where('projectId', '==', bundle.projectId),
            where('category', '==', slot.category),
            where('status', '==', 'pending'),
          )
        );
        snap.docs
          .filter((d) => !bundle.offerIds.includes(d.id))
          .forEach((d) => competingOfferIds.add(d.id));
      }

      // Collect competing bundle offers from other professionals that share any slot
      const bundleSnap = await getDocs(
        query(
          collection(db, 'bundleOffers'),
          where('projectId', '==', bundle.projectId),
          where('status', '==', 'pending'),
        )
      );
      const competingBundleIds = bundleSnap.docs
        .filter((d) => {
          if (d.id === bundle.id) return false;
          const b = d.data() as BundleOffer;
          return b.slots.some((bs) =>
            bundle.slots.some((s) => s.category === bs.category)
          );
        })
        .map((d) => d.id);

      // Build and commit batch
      const batch = writeBatch(db);

      // Accept this bundle
      batch.update(doc(db, 'bundleOffers', bundle.id), { status: 'accepted' });

      // Accept all constituent individual offers
      for (const offerId of bundle.offerIds) {
        batch.update(doc(db, 'priceOffers', offerId), { status: 'accepted' });
      }

      // Reject competing individual offers
      for (const offerId of competingOfferIds) {
        batch.update(doc(db, 'priceOffers', offerId), { status: 'rejected' });
      }

      // Reject competing bundle offers
      for (const bundleId of competingBundleIds) {
        batch.update(doc(db, 'bundleOffers', bundleId), { status: 'rejected' });
      }

      // Add all slots to project.filledSlots in one arrayUnion call
      const filledEntries = bundle.slots.map((s) => ({
        category: s.category,
        professionalId: bundle.professionalId,
      }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      batch.update(doc(db, 'projects', bundle.projectId), {
        filledSlots: arrayUnion(...filledEntries),
      });

      await batch.commit();
      console.log('[useAcceptBundleOffer] batch committed — bundle', bundle.id);

      // Group chat setup (same logic as useAcceptOffer, professional added once)
      try {
        const project = await getDocument<{ clientId: string; title: string; chatId?: string }>(
          `projects/${bundle.projectId}`
        );
        if (project) {
          if (!project.chatId) {
            const chatId = await createProjectGroup(
              project.clientId,
              bundle.professionalId,
              bundle.projectId,
              project.title,
            );
            await updateDocument(`projects/${bundle.projectId}`, { chatId });
            console.log('[useAcceptBundleOffer] created group chat', chatId);
          } else {
            await addMemberToGroup(project.chatId, bundle.professionalId);
            console.log('[useAcceptBundleOffer] joined existing chat', project.chatId);
          }
        }
      } catch (e) {
        console.error('[useAcceptBundleOffer] chat setup failed:', e);
      }
    } finally {
      setIsAccepting(null);
    }
  }

  async function rejectBundle(bundleId: string): Promise<void> {
    await updateDocument(`bundleOffers/${bundleId}`, { status: 'rejected' });
  }

  return { acceptBundle, rejectBundle, isAccepting };
}
