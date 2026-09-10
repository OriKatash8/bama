import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@core/firebase/config';
import { DEFAULT_MAX_OPEN_PROJECTS } from '@core/constants/pricing';
import type { ProjectRequest } from '@core/types/project';

/**
 * The projects on which a professional currently occupies a slot.
 *
 * `slotHolders` is the slot cap's source of truth and the exact query the
 * server enforces with (`hire.ts` → `loadAndEnforce`). Mirroring it here means
 * the blocked sheet can never disagree with the callable that rejects the hire.
 *
 * Single-field `array-contains`, so no composite index. A professional leaves
 * `slotHolders` when the project completes or is cancelled — never by paying a
 * fee, which is why this is simply "projects I am currently engaged on".
 */

export type SlotUsage = {
  /** Full project documents, so the blocked sheet can render titles and status. */
  projects: ProjectRequest[];
  used: number;
  cap: number;
  atCap: boolean;
};

/**
 * @param cap `maxOpenProjects` from the runtime config. Passed in rather than
 *   read from a constant so the limit stays runtime-tunable; the default is only
 *   the fallback for a caller that has no config yet.
 */
export function listenToSlotUsage(
  professionalId: string,
  callback: (usage: SlotUsage) => void,
  cap: number = DEFAULT_MAX_OPEN_PROJECTS,
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
        cap,
        atCap: projects.length >= cap,
      });
    },
    (err) => {
      // Must not resolve to "0 slots used" — that would wave a blocked
      // professional straight through to composing an offer the server then
      // rejects with slot-cap-reached.
      console.error('[pricing] listenToSlotUsage failed:', err?.code, err);
      callback({ projects: [], used: 0, cap, atCap: false });
    },
  );
}
