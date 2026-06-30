import { useState } from 'react';
import { queryDocuments, getDocument, runBatchUpdates, updateDocument, arrayUnion, where } from '@core/firebase/firestore';
import type { PriceOffer } from '@core/types/project';
import { createProjectGroup, addMemberToGroup } from '../../chat/services/chatService';

export function useAcceptOffer() {
  const [isAccepting, setIsAccepting] = useState<string | null>(null);

  async function accept(offer: PriceOffer): Promise<void> {
    setIsAccepting(offer.id);
    try {
      const competing = await queryDocuments<PriceOffer>(
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

      await updateDocument(`priceOffers/${offer.id}`, { status: 'accepted' });
      await updateDocument(`projects/${offer.projectId}`, {
        filledSlots: arrayUnion({
          category: offer.category,
          subcategory: offer.subcategory,
          professionalId: offer.professionalId,
        }) as any,
      });

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
          } else {
            await addMemberToGroup(project.chatId, offer.professionalId);
          }
        }
      } catch (e) {
        console.error('[useAcceptOffer] failed to set up project group chat:', e);
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
