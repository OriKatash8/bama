#!/usr/bin/env node
/**
 * End-to-end probe for onNewCommunityMessage.
 *
 * Verifies the two halves of the community notification feature against the LIVE
 * project, because the emulator does not run the deployed trigger:
 *
 *   ALLOWED  — a message in a community channel creates a notifications/ doc for
 *              every other member. This never happened before the trigger existed.
 *   MUTED    — with the recipient's users/{uid}.mutedChats containing the chat id,
 *              the same message creates NOTHING (no push, no in-app bell).
 *
 * Everything is created under throwaway ids and deleted again; the teardown is
 * ASSERTED, not assumed, and the script exits non-zero if anything survives.
 *
 * Admin SDK / ADC, same setup as scripts/backfill-community-categories.mjs:
 *   node scripts/probe-community-notifications.mjs
 */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

initializeApp({ projectId: 'bama-af0a0' });
const db = getFirestore();

const STAMP = `probe-${Date.now()}`;
const SENDER = `${STAMP}-sender`;
const RECIPIENT = `${STAMP}-recipient`;
const created = [];        // doc refs to delete in teardown
let failures = 0;

function check(label, ok, detail = '') {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function track(ref, data) {
  await ref.set(data);
  created.push(ref);
  return ref;
}

/**
 * Delete every notification addressed to a user, and assert none remain.
 *
 * Phases MUST start from empty. The first version of this probe skipped this and
 * the muted phase counted the PREVIOUS phase's notification, reporting a failure
 * the product had not committed — and phase 3 then "passed" on the same stale doc.
 */
async function clearNotifications(userId) {
  const snap = await db.collection('notifications').where('userId', '==', userId).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
  const after = await db.collection('notifications').where('userId', '==', userId).get();
  if (!after.empty) throw new Error(`could not clear notifications for ${userId}: ${after.size} left`);
}

/** Poll for notifications addressed to a user, up to timeoutMs. */
async function waitForNotifications(userId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const snap = await db.collection('notifications').where('userId', '==', userId).get();
    if (!snap.empty) return snap.docs;
    if (Date.now() >= deadline) return [];
    await new Promise((r) => setTimeout(r, 2000));
  }
}

console.log(`\nProbe ${STAMP}\n`);

try {
  // ── Setup ──────────────────────────────────────────────────────────────────
  await track(db.collection('users').doc(SENDER), {
    displayName: 'Probe Sender', email: `${SENDER}@example.invalid`, photoURL: null,
    createdAt: FieldValue.serverTimestamp(),
  });
  await track(db.collection('users').doc(RECIPIENT), {
    displayName: 'Probe Recipient', email: `${RECIPIENT}@example.invalid`, photoURL: null,
    createdAt: FieldValue.serverTimestamp(),
  });

  const chatRef = db.collection('chats').doc(`${STAMP}-community`);
  await track(chatRef, {
    type: 'community',
    name: 'Probe Community',
    description: 'throwaway',
    ownerId: SENDER,
    members: [SENDER, RECIPIENT],
    lastMessage: null,
    createdAt: FieldValue.serverTimestamp(),
  });

  const channelRef = chatRef.collection('channels').doc('general');
  await track(channelRef, {
    name: 'General', createdAt: FieldValue.serverTimestamp(), createdBy: SENDER, kind: 'general',
  });

  // ── 1. UNMUTED: the trigger must fire ──────────────────────────────────────
  console.log('1. Unmuted — a community message should notify the other member');
  const msg1 = channelRef.collection('messages').doc();
  await track(msg1, {
    senderId: SENDER, text: 'probe message one',
    timestamp: FieldValue.serverTimestamp(), readBy: [SENDER],
  });

  const notifs = await waitForNotifications(RECIPIENT, 60000);
  check('recipient got exactly one notification', notifs.length === 1, `got ${notifs.length}`);
  if (notifs.length) {
    const n = notifs[0].data();
    created.push(notifs[0].ref);
    check('data.type is "message"', n.data?.type === 'message', JSON.stringify(n.data));
    check('data.chatId points at the community', n.data?.chatId === chatRef.id);
    check('data.channelId is carried', n.data?.channelId === 'general');
    check('title names the community', String(n.title).includes('Probe Community'), n.title);
    check('body names the sender', String(n.message).includes('Probe Sender'), n.message);
  }
  const senderNotifs = await db.collection('notifications').where('userId', '==', SENDER).get();
  check('sender did NOT notify themselves', senderNotifs.empty, `got ${senderNotifs.size}`);
  senderNotifs.docs.forEach((d) => created.push(d.ref));

  // ── 2. MUTED: the trigger must stay silent ─────────────────────────────────
  console.log('\n2. Muted — the same message should create nothing');
  // Start from empty, or this phase just re-counts phase 1's notification.
  await clearNotifications(RECIPIENT);
  await db.collection('users').doc(RECIPIENT).update({ mutedChats: FieldValue.arrayUnion(chatRef.id) });

  const msg2 = channelRef.collection('messages').doc();
  await track(msg2, {
    senderId: SENDER, text: 'probe message two',
    timestamp: FieldValue.serverTimestamp(), readBy: [SENDER],
  });

  // Wait out the same window the unmuted case succeeded in, then assert emptiness.
  await new Promise((r) => setTimeout(r, 45000));
  const muted = await db.collection('notifications').where('userId', '==', RECIPIENT).get();
  check('muted recipient got NO new notification', muted.empty, `got ${muted.size}`);
  muted.docs.forEach((d) => created.push(d.ref));

  // ── 3. UNMUTED AGAIN: it must come back ────────────────────────────────────
  console.log('\n3. Unmuted again — notifications should resume');
  await clearNotifications(RECIPIENT);
  await db.collection('users').doc(RECIPIENT).update({ mutedChats: FieldValue.arrayRemove(chatRef.id) });

  const msg3 = channelRef.collection('messages').doc();
  await track(msg3, {
    senderId: SENDER, text: 'probe message three',
    timestamp: FieldValue.serverTimestamp(), readBy: [SENDER],
  });

  const resumed = await waitForNotifications(RECIPIENT, 60000);
  check('notifications resume after unmute', resumed.length === 1, `got ${resumed.length}`);
  resumed.forEach((d) => created.push(d.ref));

} catch (err) {
  console.error('\nProbe threw:', err);
  failures++;
} finally {
  // ── Teardown, asserted ─────────────────────────────────────────────────────
  console.log('\nTeardown');
  // Delete the source docs first, then settle: a message deleted while its trigger
  // is still in flight can still land a notification, which would otherwise
  // "survive" a sweep that ran too early.
  for (const ref of created.reverse()) {
    await ref.delete().catch((e) => console.error('  delete failed:', ref.path, e.message));
  }
  await new Promise((r) => setTimeout(r, 20000));

  let survivors = 0;
  for (const ref of created) {
    if ((await ref.get()).exists) { console.error('  SURVIVED:', ref.path); survivors++; }
  }
  // Late notifications from any phase, swept last.
  for (const uid of [SENDER, RECIPIENT]) {
    const snap = await db.collection('notifications').where('userId', '==', uid).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
    const after = await db.collection('notifications').where('userId', '==', uid).get();
    after.docs.forEach((d) => { console.error('  SURVIVED:', d.ref.path); survivors++; });
  }
  check('all probe data removed', survivors === 0, `${survivors} survivor(s)`);
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
