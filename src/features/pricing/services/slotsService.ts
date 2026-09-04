import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@core/firebase/config';
import { NON_SUBSCRIBER_SLOT_CAP } from '@core/constants/pricing';
import type { ProjectRequest } from '@core/types/project';

/**
 * The projects on which a professional currently occupies a slot.
 *
 * `slotHolders` is the slot cap's source of truth and the exact query the
 * server enforces with (`hire.ts` → `loadAndEnforce`). Mirroring it here means
 * the blocked sheet can never disagree with the callable that rejects the hire.
 *
 * Single-field `array-contains`, so no composite index. A professional leaves
 * `slotHolders` when their OWN fee settles, independently of the others on the
 * project — which is why this returns "projects where I am unsettled", not
 * "projects I am on".
 */

export type SlotUsage = {
  /** Full project documents, so the blocked sheet can render titles and status. */
  projects: ProjectRequest[];
  used: number;
  cap: number;
  /** Only meaningful for non-subscribers; subscribers have no slot cap at all. */
  atCap: boolean;
};

export function listenToSlotUsage(
  professionalId: string,
  callback: (usage: SlotUsage) => void,
): () => void {
  const q = query(
    collection(db, 'projects'),
    where('slotHolders', 'array-contains', professionalId),
  );
  return onSnapshot(
    q,
    (snap) => {
      const projects = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ProjectRequest);
      callback({
        projects,
        used: projects.length,
        cap: NON_SUBSCRIBER_SLOT_CAP,
        atCap: projects.length >= NON_SUBSCRIBER_SLOT_CAP,
      });
    },
    (err) => {
      // Must not resolve to "0 slots used" — that would wave a blocked
      // professional straight through to composing an offer the server then
      // rejects with slot-cap-reached.
      console.error('[pricing] listenToSlotUsage failed:', err?.code, err);
      callback({ projects: [], used: 0, cap: NON_SUBSCRIBER_SLOT_CAP, atCap: false });
    },
  );
}
