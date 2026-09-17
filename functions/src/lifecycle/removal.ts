import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, FieldValue, requireAuth, feeRef, type ReleaseReason } from './helpers';
import { applyDerivedProjectState } from './derive';

type Filled = { category: string; professionalId: string; requiredCapability?: string };
type Update = admin.firestore.UpdateData<admin.firestore.DocumentData>;

/**
 * A professional accepts their removal from a project, freeing their slot.
 *
 * The slot is freed by dropping them from `professionalIds` — that, with
 * `slotActive`, is what the cap query in hire.ts counts. The old client-side
 * `acceptRemoval` only rewrote `filledSlots`, so a removed pro stayed blocked
 * forever.
 *
 * Does NOT consult what this professional owes. It used to refuse while their own
 * fee was outstanding, so that settling was what bought them their way off the
 * project. What a professional owes BAMA is recorded on their fee document and
 * stays recorded whether they are on the project or not.
 */
/**
 * Release ONE professional from a project: their slots, their chat membership,
 * their accepted offers, their fee, and the notice to the crew.
 *
 * SHARED BY TWO OPPOSITE FLOWS, which is why it is extracted:
 *   - the client asks someone to leave and the PROFESSIONAL accepts (freeSlot);
 *   - the professional asks to leave and the CLIENT accepts
 *     (respondToEngagementEnd).
 * Identical mechanics, opposite permission checks.
 *
 * AUTHORIZATION IS NOT DONE HERE, deliberately. Each caller checks its own. If
 * the check moved inside it would have to branch on `reason` — and a permission
 * check that branches on a caller-supplied value is how an authorization bug is
 * born. This assumes the caller has already earned the right.
 *
 * `reason` is recorded on the engagement because the two events are not the same
 * thing even though the mechanics are: a professional removed by a client they
 * stopped answering must not land in the same bucket as one who chose to leave.
 * The reliability count reads it.
 *
 * The fee void is UNCONDITIONAL. A released engagement never charges, by either
 * route.
 *
 * Errors propagate. The "X left" notice inside this batch was once a client
 * write after the callable returned, which could never succeed and was swallowed
 * by a `catch {}` marked non-fatal — so the crew were never told anyone had
 * left. It is atomic here, and both entry points surface failure the same way
 * because neither catches.
 */
export async function releaseEngagement(
  projectId: string,
  proId: string,
  reason: ReleaseReason,
): Promise<{ ok: boolean; chatId: string | null }> {
  const snap = await db.doc(`projects/${projectId}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Project not found');
  const project = snap.data() as Record<string, unknown>;
  const filled = (project.filledSlots as Filled[]) ?? [];

  const removalRef = db.doc(`projects/${projectId}/removalRequests/${proId}`);
  const myFeeRef = feeRef(projectId, proId);
  const [offersSnap, removalSnap, feeSnap] = await Promise.all([
    db
      .collection('priceOffers')
      .where('projectId', '==', projectId)
      .where('professionalId', '==', proId)
      .where('status', '==', 'accepted')
      .get(),
    removalRef.get(),
    myFeeRef.get(),
  ]);

  // No fee check here, deliberately. This used to refuse when the professional
  // still owed on a confirmed project, which made settling the thing that bought
  // them their way out — the same shape as paying to free a slot. What they owe
  // BAMA is recorded on the fee document and stays recorded whether they are on
  // the project or not; it does not gate leaving.
  //
  // It is also moot now: completion frees every slot, so a confirmed project
  // holds nobody.

  const batch = db.batch();

  // arrayRemove needs exact object equality, so filledSlots is read-modify-write.
  const holders = ((project.slotHolders as string[]) ?? []).filter((id) => id !== proId);
  const update: Update = {
    filledSlots: filled.filter((s) => s.professionalId !== proId),
    professionalIds: FieldValue.arrayRemove(proId),
    // This pro stops occupying a slot; the others keep theirs.
    slotHolders: holders,
    slotActive: holders.length > 0,
  };
  batch.update(snap.ref, update);

  // Void this pro's fee — they leave before completion, so nothing is due (§4.3:
  // a pro must never pay for work that earned them nothing). Anything already
  // paid early stays recorded in paidAmount for the manual refund path.
  if (feeSnap.exists) {
    batch.update(myFeeRef, {
      slotActive: false, feeDue: 0, status: 'not_owed',
      // Which route released them. Identical mechanics, different events — the
      // reliability count reads this to tell a professional who chose to leave
      // from one removed by a client who stopped answering.
      releaseReason: reason,
      // WITHDRAWN, not completed. They left before the work closed, so nothing
      // was delivered and nothing is owed — and the distinction has to survive,
      // because a project that completes later must not retroactively record
      // this professional as having completed it.
      engagementStatus: 'withdrawn',
    } as Update);
  }

  const chatId = project.chatId as string | undefined;
  if (chatId) {
    // The "X left" notice is posted HERE, in the same batch that removes them.
    //
    // It used to be a client write after the callable returned — which could
    // never succeed: this batch strips the professional from `members`, and the
    // message-create rule requires membership. It failed every time and was
    // swallowed by a `catch {}` marked non-fatal, so the remaining crew were
    // never told anyone had left. Batched here it is atomic with the removal:
    // either both land or neither does, and the Admin SDK is not subject to the
    // membership rule.
    const proSnap = await db.doc(`users/${proId}`).get();
    const proName = (proSnap.data()?.displayName as string | undefined) ?? 'בעל מקצוע';
    const text = `${proName} עזב את הפרויקט`;

    batch.set(db.collection(`chats/${chatId}/messages`).doc(), {
      senderId: 'system',
      system: true,
      text,
      timestamp: FieldValue.serverTimestamp(),
      readBy: [],
    });

    const remaining = ((project.professionalIds as string[]) ?? [])
      .filter((id) => id !== proId)
      .concat(project.clientId ? [project.clientId as string] : []);
    const chatUpdate: Record<string, unknown> = {
      members: FieldValue.arrayRemove(proId),
      lastMessage: { text, senderId: 'system', timestamp: FieldValue.serverTimestamp() },
    };
    for (const memberId of remaining) {
      chatUpdate[`unreadCount.${memberId}`] = FieldValue.increment(1);
    }
    batch.update(db.doc(`chats/${chatId}`), chatUpdate);
  }

  offersSnap.docs.forEach((d) => batch.update(d.ref, { status: 'removed' }));

  // DELETE, not mark-accepted. A request left behind is never removable
  // (`allow delete: if false` for clients), so if this professional is ever
  // re-hired onto the same project the client's next remove press would be a
  // rules update on a stale doc — and they could never be removed again.
  // The Admin SDK bypasses rules, so no rule change is needed for this.
  // Absent when the pro leaves through a path that never raised a request;
  // deleting a missing doc is a no-op, unlike updating one.
  if (removalSnap.exists) batch.delete(removalRef);

  await batch.commit();
  // Withdrawing the last open engagement can complete the project. The derivation
  // decides that, not this function.
  await applyDerivedProjectState(projectId);
  return { ok: true, chatId: chatId ?? null };
}

/**
 * A professional accepts their own removal, requested by the client.
 *
 * Authorization lives here, not in releaseEngagement: the caller must BE the
 * professional being removed. The mirror flow — the client accepting a
 * professional's withdrawal request — checks the opposite and calls the same
 * mechanics.
 */
export const freeSlot = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const projectId = request.data?.projectId as string | undefined;
  if (!projectId) throw new HttpsError('invalid-argument', 'projectId required');

  const snap = await db.doc(`projects/${projectId}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Project not found');
  const project = snap.data() as Record<string, unknown>;
  const filled = (project.filledSlots as Filled[]) ?? [];
  const isOnProject =
    ((project.professionalIds as string[]) ?? []).includes(uid) ||
    filled.some((s) => s.professionalId === uid);
  if (!isOnProject) throw new HttpsError('permission-denied', 'Not hired on this project');

  return releaseEngagement(projectId, uid, 'client_removed');
});
