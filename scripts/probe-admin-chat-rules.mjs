#!/usr/bin/env node
/**
 * Probe: an admin can READ a project group chat and its messages (the read-only
 * admin/project-chat page), and nothing more — not DMs, not purchase chats, and
 * no writes. Members keep their access; other users have none.
 *
 * Runs against the Firestore EMULATOR with whatever firestore.rules currently
 * says. Nothing here touches production.
 *
 *   npx firebase emulators:start --only firestore,auth --project bama-af0a0
 *   node scripts/probe-admin-chat-rules.mjs
 */
import { initializeApp as initAdmin } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { initializeApp } from 'firebase/app';
import {
  getFirestore, connectFirestoreEmulator, doc, getDoc, getDocs, collection, setDoc, updateDoc, addDoc, setLogLevel,
} from 'firebase/firestore';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
setLogLevel('silent');
const PROJECT = 'bama-af0a0';
const adminApp = initAdmin({ projectId: PROJECT });
const adb = getAdminFirestore(adminApp);
const aauth = getAdminAuth(adminApp);
const app = initializeApp({ apiKey: 'emulator-key', projectId: PROJECT }, 'probe');
const db = getFirestore(app);
const auth = getAuth(app);
connectFirestoreEmulator(db, '127.0.0.1', 8080);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });

const PW = 'probe-password-123';
async function ensureUser(label, claims) {
  const email = `${label}@probe.invalid`;
  let uid;
  try { uid = (await createUserWithEmailAndPassword(auth, email, PW)).user.uid; }
  catch { uid = (await signInWithEmailAndPassword(auth, email, PW)).user.uid; }
  await aauth.updateUser(uid, { emailVerified: true });
  await aauth.setCustomUserClaims(uid, claims ?? null);
  await signOut(auth);
  return uid;
}
async function as(label) {
  await signOut(auth).catch(() => {});
  await signInWithEmailAndPassword(auth, `${label}@probe.invalid`, PW);
  await auth.currentUser.getIdToken(true); // pick up the claim
}

const ADMIN = await ensureUser('ac-admin', { role: 'admin' });
const MEMBER = await ensureUser('ac-member');
const OTHER = await ensureUser('ac-other');

const seed = async () => {
  await adb.doc('chats/grp').set({ type: 'group', projectId: 'p1', members: [MEMBER] });
  await adb.doc('chats/grp/messages/m1').set({ senderId: MEMBER, text: 'hi', timestamp: new Date(), readBy: [MEMBER] });
  await adb.doc('chats/dm').set({ type: 'dm', members: [MEMBER, OTHER] });
  await adb.doc('chats/dm/messages/m1').set({ senderId: MEMBER, text: 'private', timestamp: new Date(), readBy: [MEMBER] });
  await adb.doc('chats/buy').set({ type: 'purchase', members: [MEMBER, OTHER] });
};

const rows = [];
async function attempt(name, who, expected, run) {
  await seed();
  await as(who);
  let allowed = true; let err = '';
  try { await run(); } catch (e) { allowed = false; err = e.code ?? String(e.message ?? e); }
  rows.push({ name, expected, allowed, err });
}

await attempt('1. admin reads a project group chat', 'ac-admin', true, () => getDoc(doc(db, 'chats/grp')));
await attempt('2. admin reads its messages', 'ac-admin', true, () => getDocs(collection(db, 'chats/grp/messages')));
await attempt('3. admin CANNOT read a DM', 'ac-admin', false, () => getDoc(doc(db, 'chats/dm')));
await attempt('4. admin CANNOT read DM messages', 'ac-admin', false, () => getDocs(collection(db, 'chats/dm/messages')));
await attempt('5. admin CANNOT read a purchase chat', 'ac-admin', false, () => getDoc(doc(db, 'chats/buy')));
await attempt('6. admin CANNOT post in the group chat', 'ac-admin', false,
  () => addDoc(collection(db, 'chats/grp/messages'), { senderId: ADMIN, text: 'x', timestamp: new Date(), readBy: [ADMIN] }));
await attempt('7. admin CANNOT change the group chat', 'ac-admin', false, () => updateDoc(doc(db, 'chats/grp'), { unreadCount: {} }));
await attempt('8. admin CANNOT mark a message read', 'ac-admin', false,
  () => updateDoc(doc(db, 'chats/grp/messages/m1'), { readBy: [MEMBER, ADMIN] }));
await attempt('9. a member still reads the group chat', 'ac-member', true, () => getDocs(collection(db, 'chats/grp/messages')));
await attempt('10. a non-member, non-admin cannot', 'ac-other', false, () => getDocs(collection(db, 'chats/grp/messages')));

let bad = 0;
for (const r of rows) {
  const ok = r.allowed === r.expected;
  if (!ok) bad++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${r.name} — ${r.allowed ? 'allowed' : `denied (${r.err})`}`);
}
console.log(`\n${rows.length} cases, ${bad} not as expected`);
await signOut(auth).catch(() => {});
process.exit(bad ? 1 : 0);
