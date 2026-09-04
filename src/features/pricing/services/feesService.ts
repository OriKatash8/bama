import {
  collection,
  collectionGroup,
  doc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { db } from '@core/firebase/config';
import { callFunction } from '@core/firebase/functions';
import type { ProjectFee } from '@core/types/project';

/**
 * A professional's platform fee lives at `projects/{projectId}/fees/{proId}`,
 * where the document id IS their uid. Admin-SDK-written only; the professional
 * may read their own, and the CLIENT may not read any (spec §6 — the client is
 * never told that a professional owes BAMA money).
 *
 * A MISSING fee document means 'exempt' — the permanent fallback for every
 * project created before the per-pro correction. Callers get `null` and must
 * treat it as "nothing owed", never as an error.
 */

/** The professional settles their own fee. Gated server-side on PAYMENTS_ENABLED. */
export const paySlotFee = callFunction<{ projectId: string }, { ok: boolean; paid: number }>(
  'payFee',
);

/** One professional's fee on one project. Document listener — a collection query
 *  here would be a `list`, and the rules are written for the document read. */
export function listenToProjectFee(
  projectId: string,
  professionalId: string,
  callback: (fee: ProjectFee | null) => void,
): () => void {
  return onSnapshot(
    doc(db, `projects/${projectId}/fees/${professionalId}`),
    (snap) => callback(snap.exists() ? ({ ...snap.data() } as ProjectFee) : null),
    (err) => {
      // Surfaced, never swallowed. A denial that resolves to "no fee" is
      // indistinguishable from "nothing owed" — the exact shape that has caused
      // two production bugs (docs/known-issues-silent-failures.md).
      console.error('[pricing] listenToProjectFee failed:', err?.code, err);
      callback(null);
    },
  );
}

/**
 * Every fee this professional holds, across all projects, keyed by projectId.
 *
 * A LISTENER, deliberately, not a one-shot fetch. The chat list is a mounted
 * tab: pushing the payment screen and popping back does not remount it, so a
 * fetch-on-mount would leave a row reading "unpaid" immediately after the
 * professional paid — the worst possible moment to be stale. A listener also
 * reflects payment made on another device.
 *
 * `collectionGroup('fees')` filtered on the `professionalId` FIELD (not the
 * document-id wildcard, which a query cannot bind). Verified against the
 * deployed rules in production, along with its COLLECTION_GROUP index.
 */
export function listenToMyFees(
  professionalId: string,
  callback: (byProjectId: Map<string, ProjectFee>) => void,
): () => void {
  const q = query(
    collectionGroup(db, 'fees'),
    where('professionalId', '==', professionalId),
  );
  return onSnapshot(
    q,
    (snap) => {
      const map = new Map<string, ProjectFee>();
      snap.docs.forEach((d) => {
        // projects/{projectId}/fees/{proId} -> the grandparent is the project.
        const projectId = d.ref.parent.parent?.id;
        if (projectId) map.set(projectId, { ...d.data() } as ProjectFee);
      });
      callback(map);
    },
    (err) => {
      console.error('[pricing] listenToMyFees failed:', err?.code, err);
      callback(new Map());
    },
  );
}

/** All fee documents on one project — the CLIENT cannot read these; this is for
 *  a professional viewing a project they are on, and returns only their own. */
export function feesCollection(projectId: string) {
  return collection(db, `projects/${projectId}/fees`);
}
