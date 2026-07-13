import { useState } from 'react';
import { queryDocuments, getDocument, runBatchUpdates, updateDocument, arrayUnion, where } from '@core/firebase/firestore';
import type { PriceOffer, BundleOffer } from '@core/types/project';
import { createProjectGroup, addMemberToGroup } from '../../chat/services/chatService';

export function useAcceptOffer() {
  const [isAccepting, setIsAccepting] = useState<string | null>(null);

  async function accept(offer: PriceOffer): Promise<void> {
    setIsAccepting(offer.id);
    try {
      // Step 1: batch-reject competing offers
      let competing: PriceOffer[] = [];
      try {
        competing = await queryDocuments<PriceOffer>(
          'priceOffers',
          where('projectId', '==', offer.projectId),
          where('category', '==', offer.category),
          where('subcategory', '==', offer.subcategory),
          where('status', '==', 'pending')
        );
        const others = competing.filter((o) => o.id !== offer.id);
        if (others.length > 0) {
          await runBatchUpdates(
            others.map((o) => ({ path: `priceOffers/${o.id}`, data: { status: 'rejected' } }))
          );
        }
        console.log('[useAcceptOffer] step 1 ok — rejected', competing.length - 1, 'competing offers');
      } catch (e: any) {
        console.error('[useAcceptOffer] step 1 FAILED (batch-reject competing offers) — code:', e?.code, 'message:', e?.message, e);
        throw e;
      }

      // Step 2: mark this offer accepted
      try {
        await updateDocument(`priceOffers/${offer.id}`, { status: 'accepted' });
        console.log('[useAcceptOffer] step 2 ok — offer', offer.id, 'marked accepted');
      } catch (e: any) {
        console.error('[useAcceptOffer] step 2 FAILED (accept offer status) — code:', e?.code, 'message:', e?.message, e);
        throw e;
      }

      // Step 2.5: reject any pending bundle offers from this same professional (they can't have both)
      try {
        const pendingBundles = await queryDocuments<BundleOffer>(
          'bundleOffers',
          where('projectId', '==', offer.projectId),
          where('professionalId', '==', offer.professionalId),
          where('status', '==', 'pending'),
        );
        if (pendingBundles.length > 0) {
          await runBatchUpdates(
            pendingBundles.map((b) => ({ path: `bundleOffers/${b.id}`, data: { status: 'rejected' } }))
          );
          console.log('[useAcceptOffer] step 2.5 ok — rejected', pendingBundles.length, 'pending bundle(s) from this professional');
        }
      } catch (e: any) {
        console.error('[useAcceptOffer] step 2.5 FAILED (reject stale bundles) — code:', e?.code, 'message:', e?.message, e);
        // Non-fatal: don't throw — the individual offer is already accepted
      }

      // Step 3: add professional to project filledSlots
      try {
        await updateDocument(`projects/${offer.projectId}`, {
          filledSlots: arrayUnion({
            category: offer.category,
            subcategory: offer.subcategory,
            professionalId: offer.professionalId,
          }) as any,
        });
        console.log('[useAcceptOffer] step 3 ok — filledSlots updated on project', offer.projectId);
      } catch (e: any) {
        console.error('[useAcceptOffer] step 3 FAILED (filledSlots arrayUnion) — code:', e?.code, 'message:', e?.message, e);
        throw e;
      }

      // Step 4: create or join project group chat
      try {
        const project = await getDocument<{ clientId: string; title: string; chatId?: string }>(
          `projects/${offer.projectId}`
        );
        if (project) {
          if (!project.chatId) {
            const newChatId = await createProjectGroup(
              project.clientId,
              offer.professionalId,
              offer.projectId,
              project.title,
            );
            await updateDocument(`projects/${offer.projectId}`, { chatId: newChatId });
            console.log('[useAcceptOffer] step 4 ok — created group chat', newChatId);
          } else {
            await addMemberToGroup(project.chatId, offer.professionalId);
            console.log('[useAcceptOffer] step 4 ok — added to existing group chat', project.chatId);
          }
        } else {
          console.error('[useAcceptOffer] step 4 — project', offer.projectId, 'not found, skipping chat setup');
        }
      } catch (e: any) {
        console.error('[useAcceptOffer] step 4 FAILED (group chat setup) — code:', e?.code, 'message:', e?.message, e);
      }
    } finally {
      setIsAccepting(null);
    }
  }

  async function reject(offerId: string): Promise<void> {
    await updateDocument(`priceOffers/${offerId}`, { status: 'rejected' });
  }

  return { accept, reject, isAccepting };
}
