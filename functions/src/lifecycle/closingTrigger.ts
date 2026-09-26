import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { db, FieldValue } from './helpers';
import { buildClosingNotice, isClosingTransition } from './closingNotice';

/** One closing message per project chat — the id makes a second write fail. */
const CLOSING_MESSAGE_ID = 'project-closed';

/**
 * When a project ends — completed or cancelled — post the team's contact list to
 * its chat: every member, their role(s) and phone number, then BAMA's email
 * (closingNotice.ts). Shown in the app as a card; `text` is the plain version
 * for the chat-list preview and older builds.
 *
 * A trigger, because both ways a project ends already write `status` from the
 * server (applyDerivedProjectState, cancelProject) and neither should grow a
 * chat side effect of its own.
 *
 * EXACTLY ONCE: the message has a fixed id and is written with create(), which
 * fails if it exists — so a retried invocation, or a project that reopens and
 * completes again, never posts a second list.
 *
 * Phones come from each member's private contact doc (Admin SDK). Everyone in
 * the chat sees them in this message — decided: the project is over.
 */
export const onProjectClosed = onDocumentUpdated(
  'projects/{projectId}',
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    if (!isClosingTransition(before.status as string | undefined, after.status as string | undefined)) return;

    const chatId = after.chatId as string | undefined;
    const clientId = after.clientId as string | undefined;
    if (!chatId || !clientId) return;

    const filledSlots = ((after.filledSlots ?? []) as { professionalId?: string; category?: string }[])
      .filter((s): s is { professionalId: string; category: string } => !!s.professionalId && !!s.category);
    const uids = [...new Set([clientId, ...filledSlots.map((s) => s.professionalId)])];

    const [userSnaps, contactSnaps] = await Promise.all([
      Promise.all(uids.map((uid) => db.doc(`users/${uid}`).get())),
      Promise.all(uids.map((uid) => db.doc(`users/${uid}/private/contact`).get())),
    ]);
    const people = Object.fromEntries(uids.map((uid, i) => [uid, { name: (userSnaps[i].data()?.displayName as string | undefined) ?? '' }]));
    const phones = Object.fromEntries(uids.map((uid, i) => {
      const phone = contactSnaps[i].data()?.phone;
      return [uid, typeof phone === 'string' && phone ? phone : null];
    }));

    const notice = buildClosingNotice({
      status: after.status as 'completed' | 'cancelled',
      clientId,
      filledSlots,
      people,
      phones,
    });

    const chatRef = db.collection('chats').doc(chatId);
    try {
      await db.doc(`chats/${chatId}/messages/${CLOSING_MESSAGE_ID}`).create({
        senderId: 'system',
        system: true,
        ...notice,
        timestamp: FieldValue.serverTimestamp(),
        readBy: [],
      });
    } catch (err) {
      // ALREADY_EXISTS: posted before (a retry, or a project that reopened). Done.
      if ((err as { code?: number }).code === 6) return;
      throw err;
    }

    const chat = await chatRef.get();
    const members = (chat.data()?.members as string[] | undefined) ?? [];
    const chatUpdate: Record<string, unknown> = {
      lastMessage: { text: notice.text.split('\n')[0], senderId: 'system', timestamp: FieldValue.serverTimestamp() },
    };
    for (const uid of members) chatUpdate[`unreadCount.${uid}`] = FieldValue.increment(1);
    await chatRef.update(chatUpdate);
  },
);
