import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { db, feesCol, FieldValue, type FeeDoc } from './helpers';
import * as admin from 'firebase-admin';

type Update = admin.firestore.UpdateData<admin.firestore.DocumentData>;

/**
 * Re-stamp `completionDueAt` on every engagement still `hired` when the client
 * moves the project's `endDate`.
 *
 * A TRIGGER, not a callable, because `endDate` is an ordinary client-editable
 * field — it goes through the same project update as the title and the location,
 * and the existing edit path keeps working untouched. Rules cannot do this: they
 * can permit a write but they cannot perform one, and the re-stamp has to reach
 * a subcollection and skip part of it.
 *
 * THE GUARD IS THE POINT. Only engagements whose status is still `hired` are
 * re-stamped. An engagement that already auto-completed keeps the deadline it
 * completed against, so moving the date can never reach back and void a charge
 * that has already happened — which is the one thing a mutable deadline must not
 * be able to do.
 *
 * Removing `endDate` clears the deadline rather than leaving a stale one: an
 * engagement with no `completionDueAt` simply never auto-completes and waits for
 * the professional, which is also the state of every project that predates this.
 */
export const onProjectEndDateChange = onDocumentUpdated(
  'projects/{projectId}',
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    const beforeMs = (before.endDate as admin.firestore.Timestamp | undefined)?.toMillis() ?? null;
    const afterMs = (after.endDate as admin.firestore.Timestamp | undefined)?.toMillis() ?? null;
    if (beforeMs === afterMs) return;   // endDate untouched — nothing to do

    const projectId = event.params.projectId;
    const feesSnap = await feesCol(projectId).get();
    if (feesSnap.empty) return;

    const batch = db.batch();
    let restamped = 0;
    for (const doc of feesSnap.docs) {
      const fee = doc.data() as FeeDoc;
      // Anything but 'hired' is left exactly as it is. A completed engagement
      // keeps the deadline it completed against; a disputed one is in front of a
      // human and must not move underneath them; withdrawn and cancelled are
      // over.
      if ((fee.engagementStatus ?? 'hired') !== 'hired') continue;

      batch.update(doc.ref, {
        completionDueAt: after.endDate ?? FieldValue.delete(),
      } as Update);
      restamped++;
    }

    if (restamped === 0) return;
    await batch.commit();
    console.log(
      `[endDate] project ${projectId}: re-stamped ${restamped} of ${feesSnap.size} engagements`,
    );
  },
);
