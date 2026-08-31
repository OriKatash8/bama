import { useState } from 'react';
import { updateDocument } from '@core/firebase/firestore';
import { callFunction } from '@core/firebase/functions';
import type { BundleOffer } from '@core/types/project';

type HireResult = { chatId: string | null; alreadyAccepted?: boolean };

/**
 * Same callable as the single-offer path. There is deliberately no `hireBundle`:
 * one enforcement path means a bundle accept cannot skip the slot cap, the
 * subscriber monthly limit, or the fee lock.
 */
const hireProfessional = callFunction<{ bundleId: string }, HireResult>('hireProfessional');

export function useAcceptBundleOffer() {
  const [isAccepting, setIsAccepting] = useState<string | null>(null);

  async function acceptBundle(bundle: BundleOffer): Promise<void> {
    setIsAccepting(bundle.id);
    try {
      await hireProfessional({ bundleId: bundle.id });
    } finally {
      setIsAccepting(null);
    }
  }

  async function rejectBundle(bundleId: string): Promise<void> {
    await updateDocument(`bundleOffers/${bundleId}`, { status: 'rejected' });
  }

  return { acceptBundle, rejectBundle, isAccepting };
}
