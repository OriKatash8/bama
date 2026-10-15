import { db } from '../lifecycle/helpers';
import { deleteInChunks } from '../lifecycle/offerCleanup';

/**
 * A deleted account's open posts that nobody was hired on come off the board.
 *
 * Without this, deleting an account (deleteMyAccount) left its open posts on
 * the noticeboard under the tombstone name: assessAccount only blocks a client
 * whose project has crew, so an unhired post was never closed by anything.
 *
 * The same cascade as the deleteProject callable (offers, bundle offers, the
 * project's own subcollections, the project last), plus the notifications that
 * point at the post, which deleteProject leaves behind. A post with ANY sign of
 * a hire is left exactly as it was: it blocks the deletion, as before.
 */

type ProjectLike = {
  status?: unknown;
  chatId?: unknown;
  professionalIds?: unknown;
  slotHolders?: unknown;
  filledSlots?: unknown;
};

const nonEmptyList = (v: unknown) => Array.isArray(v) && v.length > 0;

/** Open, and nothing says anyone was hired: no chat, crew, filled slot, fee or accepted offer. */
export function isUnhiredOpenPost(
  project: ProjectLike,
  feeCount: number,
  hasAcceptedOffer: boolean,
): boolean {
  if (project.status !== 'open') return false;
  if (project.chatId) return false;
  if (nonEmptyList(project.professionalIds) || nonEmptyList(project.slotHolders) || nonEmptyList(project.filledSlots)) return false;
  return feeCount === 0 && !hasAcceptedOffer;
}

/** Subcollections a project can carry. Only fees are written for a hire, but all go with the post. */
const SUBCOLLECTIONS = ['fees', 'missions', 'meetings', 'removalRequests', 'paymentRequests'] as const;

/** Remove `uid`'s unhired open posts. Returns the ids removed and the ids kept. */
export async function deleteUnhiredOpenPosts(uid: string): Promise<{ removed: string[]; kept: string[] }> {
  const posts = await db.collection('projects').where('clientId', '==', uid).get();
  const removed: string[] = [];
  const kept: string[] = [];

  for (const post of posts.docs) {
    const project = post.data();
    if (project.status !== 'open') continue;

    const [offers, bundles, subs] = await Promise.all([
      db.collection('priceOffers').where('projectId', '==', post.id).get(),
      db.collection('bundleOffers').where('projectId', '==', post.id).get(),
      Promise.all(SUBCOLLECTIONS.map((name) => post.ref.collection(name).get())),
    ]);
    const feeCount = subs[0].size;
    const hasAcceptedOffer = [...offers.docs, ...bundles.docs].some((d) => d.data().status === 'accepted');
    if (!isUnhiredOpenPost(project, feeCount, hasAcceptedOffer)) {
      kept.push(post.id);
      continue;
    }

    const notifications = await db.collection('notifications').where('data.projectId', '==', post.id).get();
    await deleteInChunks([
      ...offers.docs.map((d) => d.ref),
      ...bundles.docs.map((d) => d.ref),
      ...subs.flatMap((s) => s.docs.map((d) => d.ref)),
      ...notifications.docs.map((d) => d.ref),
      post.ref, // the project itself goes last
    ]);
    removed.push(post.id);
  }
  return { removed, kept };
}
