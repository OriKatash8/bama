#!/usr/bin/env node
/**
 * Probe for the project-chat leave lock (groupLeaveAllowed) and the hiddenFor
 * self-only rule (hiddenForSelfOnly) in the chats update rule.
 *
 * Runs against the Firestore + Auth EMULATORS with whatever firestore.rules
 * currently says. Nothing here touches production.
 *
 * Leaving a project group chat (members minus yourself) is allowed only when the
 * project is completed, its dispute window has ended and no dispute is open — on
 * the project, or for a professional on their own fee doc. Cancelled projects
 * stay open to leave. hiddenFor takes only the caller's own uid, both ways.
 *
 *   npx firebase emulators:start --only firestore,auth --project bama-af0a0
 *   node scripts/probe-chat-lock-rules.mjs --emulator
 */

import './lib/requireEmulator.mjs'; // explicit --emulator required, no default target
import { initializeApp as initAdmin } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, doc, updateDoc, arrayRemove, arrayUnion } from 'firebase/firestore';
import {
  getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
} from 'firebase/auth';

const FS_PORT = process.env.FS_PORT ?? '8080';
const AUTH_PORT = process.env.AUTH_PORT ?? '9099';
process.env.FIRESTORE_EMULATOR_HOST ??= `127.0.0.1:${FS_PORT}`;
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= `127.0.0.1:${AUTH_PORT}`;
const PROJECT = 'bama-af0a0';

const adminApp = initAdmin({ projectId: PROJECT });
const adminDb = getAdminFirestore(adminApp);
const adminAuth = getAdminAuth(adminApp);
const clientApp = initializeApp({ apiKey: 'emulator-key', projectId: PROJECT }, 'probe');
const db = getFirestore(clientApp);
const auth = getAuth(clientApp);
connectFirestoreEmulator(db, '127.0.0.1', Number(FS_PORT));
connectAuthEmulator(auth, `http://127.0.0.1:${AUTH_PORT}`, { disableWarnings: true });

const PW = 'probe-password-123';
async function user(label) {
  const email = `${label}@probe.invalid`;
  let uid;
  try { uid = (await createUserWithEmailAndPassword(auth, email, PW)).user.uid; }
  catch { uid = (await signInWithEmailAndPassword(auth, email, PW)).user.uid; }
  await adminAuth.updateUser(uid, { emailVerified: true });
  await signOut(auth);
  return { uid, label, signIn: async () => { await signInWithEmailAndPassword(auth, email, PW); await auth.currentUser.getIdToken(true); } };
}
const CLIENT = await user('lock-client');
const PRO = await user('lock-pro');
const OTHER = await user('lock-other');

const DAY = 86_400_000;
const rows = [];
let n = 0;

/**
 * A fresh project + group chat per case. `project` overrides the project doc,
 * `fee` (if given) is the pro's fees/{proId} doc.
 */
async function leaveCase(name, who, expected, project, fee) {
  n += 1;
  const pid = `probe-lock-p${n}`;
  const cid = `probe-lock-c${n}`;
  await adminDb.doc(`projects/${pid}`).set({
    clientId: CLIENT.uid, professionalIds: [PRO.uid], chatId: cid, crewSlots: [], filledSlots: [], ...project,
  });
  if (fee) await adminDb.doc(`projects/${pid}/fees/${PRO.uid}`).set({ professionalId: PRO.uid, projectId: pid, ...fee });
  await adminDb.doc(`chats/${cid}`).set({
    type: 'group', projectId: pid, members: [CLIENT.uid, PRO.uid, OTHER.uid], lastMessage: null, createdAt: new Date(),
  });
  await run('leave', name, who, expected, () => updateDoc(doc(db, 'chats', cid), { members: arrayRemove(who.uid) }));
}

async function run(section, name, who, expected, fn) {
  await signOut(auth).catch(() => {});
  await who.signIn();
  let allowed = true;
  let error = '';
  try { await fn(); } catch (e) { allowed = false; error = e.code ?? String(e.message ?? e); }
  rows.push({ section, name: `${name} — ${who.label}`, expected, allowed, error });
}

const future = Timestamp.fromMillis(Date.now() + 5 * DAY);
const past = Timestamp.fromMillis(Date.now() - DAY);

// ── Leave a project chat ───────────────────────────────────────────────────
await leaveCase('completed, INSIDE the window', CLIENT, false, { status: 'completed', disputeWindowEndsAt: future });
await leaveCase('completed, INSIDE the window', PRO, false, { status: 'completed', disputeWindowEndsAt: future });
await leaveCase('completed, AFTER the window', CLIENT, true, { status: 'completed', disputeWindowEndsAt: past, adminReviewPending: false });
await leaveCase('completed, AFTER the window', PRO, true, { status: 'completed', disputeWindowEndsAt: past }, { adminReviewPending: false });
await leaveCase('completed, window null (none open / legacy)', CLIENT, true, { status: 'completed', disputeWindowEndsAt: null });
await leaveCase('completed, window field missing', PRO, true, { status: 'completed' });
await leaveCase('completed, numeric (ms) window in the future [safety branch]', CLIENT, false, { status: 'completed', disputeWindowEndsAt: Date.now() + 5 * DAY });
await leaveCase('completed, numeric (ms) window in the past [safety branch]', CLIENT, true, { status: 'completed', disputeWindowEndsAt: Date.now() - DAY });
await leaveCase('completed, window as a string (unknown type fails closed)', CLIENT, false, { status: 'completed', disputeWindowEndsAt: '2020-01-01' });
await leaveCase('completed, after window, OPEN DISPUTE on project', CLIENT, false, { status: 'completed', disputeWindowEndsAt: past, adminReviewPending: true });
await leaveCase('completed, after window, OPEN DISPUTE on project', PRO, false, { status: 'completed', disputeWindowEndsAt: past, adminReviewPending: true });
await leaveCase("completed, after window, pro's OWN fee under review", PRO, false, { status: 'completed', disputeWindowEndsAt: past, adminReviewPending: false }, { adminReviewPending: true });
await leaveCase("completed, after window, the pro's fee under review (client unaffected)", CLIENT, true, { status: 'completed', disputeWindowEndsAt: past, adminReviewPending: false }, { adminReviewPending: true });
await leaveCase('CANCELLED project', CLIENT, true, { status: 'cancelled', disputeWindowEndsAt: future });
await leaveCase('CANCELLED project', PRO, true, { status: 'cancelled' });
await leaveCase('IN PROGRESS project', CLIENT, false, { status: 'in_progress' });
await leaveCase('OPEN project', PRO, false, { status: 'open' });

// Removing SOMEONE ELSE is still a kick, denied regardless of the lock.
{
  const cid = 'probe-lock-kick';
  await adminDb.doc('projects/probe-lock-kickp').set({ clientId: CLIENT.uid, status: 'cancelled' });
  await adminDb.doc(`chats/${cid}`).set({ type: 'group', projectId: 'probe-lock-kickp', members: [CLIENT.uid, PRO.uid], lastMessage: null });
  await run('leave', 'remove ANOTHER member from an unlocked chat', CLIENT, false, () => updateDoc(doc(db, 'chats', cid), { members: arrayRemove(PRO.uid) }));
}

// ── hiddenFor ─────────────────────────────────────────────────────────────────
const HCHAT = 'probe-lock-hidden';
async function resetHidden(hiddenFor) {
  await adminDb.doc(`chats/${HCHAT}`).set({
    type: 'purchase', members: [CLIENT.uid, PRO.uid], lastMessage: null, archived: true, hiddenFor,
  });
}
await resetHidden([]);
await run('hiddenFor', 'add MY OWN uid', CLIENT, true, () => updateDoc(doc(db, 'chats', HCHAT), { hiddenFor: arrayUnion(CLIENT.uid) }));
await resetHidden([]);
await run('hiddenFor', "add SOMEONE ELSE's uid", CLIENT, false, () => updateDoc(doc(db, 'chats', HCHAT), { hiddenFor: arrayUnion(PRO.uid) }));
await resetHidden([CLIENT.uid]);
await run('hiddenFor', 'remove MY OWN uid', CLIENT, true, () => updateDoc(doc(db, 'chats', HCHAT), { hiddenFor: arrayRemove(CLIENT.uid) }));
await resetHidden([PRO.uid]);
await run('hiddenFor', "remove SOMEONE ELSE's uid", CLIENT, false, () => updateDoc(doc(db, 'chats', HCHAT), { hiddenFor: arrayRemove(PRO.uid) }));
await resetHidden([PRO.uid]);
await run('hiddenFor', 'add mine while another is already there (theirs kept)', CLIENT, true, () => updateDoc(doc(db, 'chats', HCHAT), { hiddenFor: arrayUnion(CLIENT.uid) }));
await resetHidden([]);
await run('hiddenFor', 'overwrite with mine + someone else', CLIENT, false, () => updateDoc(doc(db, 'chats', HCHAT), { hiddenFor: [CLIENT.uid, PRO.uid] }));
await resetHidden([]);
await run('hiddenFor', 'set to a non-list', CLIENT, false, () => updateDoc(doc(db, 'chats', HCHAT), { hiddenFor: CLIENT.uid }));
// The group chat path (hideChatForUser works on any chat type).
{
  const cid = 'probe-lock-hidden-group';
  await adminDb.doc(`chats/${cid}`).set({ type: 'group', projectId: 'probe-lock-kickp', members: [CLIENT.uid, PRO.uid], lastMessage: null });
  await run('hiddenFor', 'add MY OWN uid on a group chat', PRO, true, () => updateDoc(doc(db, 'chats', cid), { hiddenFor: arrayUnion(PRO.uid) }));
}

// ── Report ──────────────────────────────────────────────────────────────────
let mismatches = 0;
for (const section of [...new Set(rows.map((r) => r.section))]) {
  console.log(`\n${section.toUpperCase()}`);
  for (const r of rows.filter((x) => x.section === section)) {
    const ok = r.allowed === r.expected;
    if (!ok) mismatches++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${r.name} — ${r.allowed ? 'allowed' : `denied (${r.error})`}`);
  }
}
console.log(`\n${rows.length} cases, ${mismatches} not as expected`);
await signOut(auth).catch(() => {});
process.exit(mismatches === 0 ? 0 : 1);
