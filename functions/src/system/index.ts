import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

if (admin.apps.length === 0) {
  admin.initializeApp();
}

/** Fixed uid of the read-only "BAMA System" sender identity. Kept in sync with
 *  the client constant in src/core/constants/system.ts. */
export const SYSTEM_USER_ID = 'bama-system';

/** Ensure the BAMA System user exists (Auth account + profile doc). Idempotent —
 *  safe to call on every send. Nothing ever logs in as it (disabled). */
async function ensureSystemUser(db: admin.firestore.Firestore): Promise<void> {
  const ref = db.collection('users').doc(SYSTEM_USER_ID);
  const snap = await ref.get();
  if (snap.exists) return;
  await admin
    .auth()
    .createUser({ uid: SYSTEM_USER_ID, displayName: 'BAMA System', disabled: true })
    .catch(() => undefined); // already exists → ignore
  await ref.set(
    {
      id: SYSTEM_USER_ID,
      displayName: 'BAMA System',
      email: '',
      photoURL: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

/**
 * Deliver a named message from BAMA System into a read-only DM with the target,
 * bump the chat preview/unread, and raise an (essential) 'system' notification.
 * Returns the chat id. Admin SDK bypasses chat rules.
 */
export async function sendBamaSystemDM(
  db: admin.firestore.Firestore,
  targetUid: string,
  text: string,
): Promise<string> {
  await ensureSystemUser(db);

  const chatId = `sys_${targetUid}`;
  const chatRef = db.collection('chats').doc(chatId);
  await chatRef.set(
    {
      type: 'dm',
      members: [SYSTEM_USER_ID, targetUid],
      readOnly: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  await chatRef.collection('messages').add({
    senderId: SYSTEM_USER_ID,
    text,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    readBy: [],
  });

  await chatRef.update({
    lastMessage: {
      text,
      senderId: SYSTEM_USER_ID,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    },
    [`unreadCount.${targetUid}`]: admin.firestore.FieldValue.increment(1),
  });

  await db.collection('notifications').add({
    userId: targetUid,
    title: 'BAMA System',
    message: text,
    data: { type: 'system', chatId },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return chatId;
}

type SendSystemMessageInput = { targetUid: string; text: string };

/** Admin-only: send a BAMA System DM to any user. */
export const sendSystemMessage = functions.https.onCall(
  async (data: SendSystemMessageInput, context) => {
    if (context.auth?.token?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admins only');
    }
    const targetUid = data?.targetUid;
    const text = (data?.text ?? '').trim();
    if (!targetUid || typeof targetUid !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'targetUid is required');
    }
    if (!text) {
      throw new functions.https.HttpsError('invalid-argument', 'A message is required');
    }
    if (targetUid === SYSTEM_USER_ID) {
      throw new functions.https.HttpsError('failed-precondition', 'Invalid target');
    }
    const chatId = await sendBamaSystemDM(admin.firestore(), targetUid, text);
    return { chatId };
  },
);
