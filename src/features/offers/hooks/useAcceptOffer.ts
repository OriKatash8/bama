import { useState } from 'react';
import { updateDocument } from '@core/firebase/firestore';
import { callFunction } from '@core/firebase/functions';
import type { PriceOffer } from '@core/types/project';

type HireResult = { chatId: string | null; alreadyAccepted?: boolean };

const hireProfessional = callFunction<{ offerId: string }, HireResult>('hireProfessional');

export function useAcceptOffer() {
  const [isAccepting, setIsAccepting] = useState<string | null>(null);

  /**
   * Accepting is a single server call. Competing-offer rejection, capability
   * attribution, filledSlots/professionalIds, the group chat, the slot cap and
   * the fee lock all happen atomically in `hireProfessional` — the client can no
   * longer write those fields, and the old 4-step sequence could half-fail.
   */
  async function accept(offer: PriceOffer): Promise<void> {
    setIsAccepting(offer.id);
    try {
      await hireProfessional({ offerId: offer.id });
    } finally {
      setIsAccepting(null);
    }
  }

  async function reject(offerId: string): Promise<void> {
    await updateDocument(`priceOffers/${offerId}`, { status: 'rejected' });
  }

  return { accept, reject, isAccepting };
}
