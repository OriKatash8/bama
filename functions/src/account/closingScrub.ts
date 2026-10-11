import { db } from '../lifecycle/helpers';
import { BAMA_CONTACT_EMAIL, closingText, scrubClosingMember, type ClosingMember } from '../lifecycle/closingNotice';

/** The closing message's fixed id — the same one onProjectClosed writes. */
const CLOSING_MESSAGE_ID = 'project-closed';

/**
 * Account deletion, for the closing cards (onProjectClosed): every project chat
 * the user was on gets their entry scrubbed — name to the tombstone name, phone
 * and email null — and the plain `text` regenerated to match. Everything else in
 * the message, and every other member, is left as it was.
 *
 * Found through the user's PROJECTS, not their chats: as the client
 * (`clientId`) and as a professional (`professionalIds`, which is never cleared
 * — so a chat they have since left is still found). A message that does not
 * list them, or a project with no chat or no closing message, is skipped.
 *
 * Each message is its own transaction, and one that fails is logged with the
 * uid and chatId — so it can be found and re-run — without stopping the rest or
 * the deletion: a stuck scrub must never leave someone unable to delete their
 * account. Safe to run again: an already-scrubbed entry scrubs to itself.
 */
export async function scrubClosingCards(uid: string, tombstoneName: string): Promise<{ scrubbed: number; failed: number }> {
  const [asClient, asPro] = await Promise.all([
    db.collection('projects').where('clientId', '==', uid).get(),
    db.collection('projects').where('professionalIds', 'array-contains', uid).get(),
  ]);
  const chatIds = new Set<string>();
  for (const p of [...asClient.docs, ...asPro.docs]) {
    const chatId = p.data()?.chatId;
    if (typeof chatId === 'string' && chatId) chatIds.add(chatId);
  }

  let scrubbed = 0;
  let failed = 0;
  for (const chatId of chatIds) {
    const ref = db.doc(`chats/${chatId}/messages/${CLOSING_MESSAGE_ID}`);
    try {
      const changed = await db.runTransaction(async (tx) => {
        const msg = (await tx.get(ref)).data();
        if (!msg || !Array.isArray(msg.team)) return false;
        const team = scrubClosingMember(msg.team as ClosingMember[], uid, tombstoneName);
        if (!team) return false;
        const closedAs = msg.closedAs === 'cancelled' ? 'cancelled' : 'completed';
        const contactEmail = typeof msg.contactEmail === 'string' && msg.contactEmail ? msg.contactEmail : BAMA_CONTACT_EMAIL;
        tx.update(ref, { team, text: closingText(closedAs, team, contactEmail) });
        return true;
      });
      if (changed) scrubbed += 1;
    } catch (e) {
      failed += 1;
      console.error('[deleteAccount] closing card scrub FAILED — re-run for this uid/chat', {
        uid, chatId, error: (e as Error)?.message ?? String(e),
      });
    }
  }
  if (scrubbed || failed) console.log('[deleteAccount] closing cards', { uid, scrubbed, failed });
  return { scrubbed, failed };
}
