#!/usr/bin/env node
/**
 * Probe for the rules' verified() helper: writes that create user-visible
 * content need a verified email when the account signs in with a PASSWORD.
 * Google/Apple sign-ins are exempt.
 *
 * Runs against the Firestore + Auth EMULATORS with whatever firestore.rules
 * currently says. Nothing here touches production.
 *
 * Three identities, each trying the same writes:
 *   - a password account, email VERIFIED       → every write allowed
 *   - a password account, email NOT verified   → content writes denied, but its
 *     own user doc and private contact (written at sign-up) still allowed
 *   - a Google sign-in                         → allowed (exempt)
 *
 *   npx firebase emulators:start --only firestore,auth --project bama-af0a0
 *   node scripts/probe-email-verified-rules.mjs
 */

import { initializeApp as initAdmin } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { initializeApp } from 'firebase/app';
import {
  getFirestore, connectFirestoreEmulator, doc, setDoc, addDoc, collection, serverTimestamp,
} from 'firebase/firestore';
import {
  getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signInWithCredential, GoogleAuthProvider, signOut,
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
const rows = [];

async function passwordUser(label, verified) {
  const email = `${label}@probe.invalid`;
  let uid;
  try { uid = (await createUserWithEmailAndPassword(auth, email, PW)).user.uid; }
  catch { uid = (await signInWithEmailAndPassword(auth, email, PW)).user.uid; }
  await adminAuth.updateUser(uid, { emailVerified: verified });
  await signOut(auth);
  return { uid, signIn: () => signInWithEmailAndPassword(auth, email, PW) };
}
async function googleUser() {
  // The auth emulator accepts a fake IdP token as JSON.
  const cred = GoogleAuthProvider.credential(JSON.stringify({ sub: 'probe-google', email: 'g@probe.invalid', email_verified: true }));
  const uid = (await signInWithCredential(auth, cred)).user.uid;
  await signOut(auth);
  return { uid, signIn: () => signInWithCredential(auth, cred) };
}

const VERIFIED = await passwordUser('ev-verified', true);
const UNVERIFIED = await passwordUser('ev-unverified', false);
const GOOGLE = await googleUser();
const who = { verified: VERIFIED, unverified: UNVERIFIED, google: GOOGLE };

const CHAT = 'probe-ev-chat';
async function reseed() {
  await adminDb.doc(`chats/${CHAT}`).set({
    type: 'group', members: [VERIFIED.uid, UNVERIFIED.uid, GOOGLE.uid], lastMessage: null, createdAt: new Date(),
  });
}

async function attempt(section, name, identity, expected, run) {
  await reseed();
  await signOut(auth).catch(() => {});
  await who[identity].signIn();
  // A fresh token after the admin flipped emailVerified.
  await auth.currentUser.getIdToken(true);
  let allowed = true;
  let error = '';
  try { await run(who[identity].uid); } catch (e) { allowed = false; error = e.code ?? String(e.message ?? e); }
  rows.push({ section, name, identity, expected, allowed, error });
}

const content = [
  ['profile data', (uid) => setDoc(doc(db, 'users', uid, 'profile', 'data'), { bio: 'hi' })],
  ['portfolio upload', (uid) => setDoc(doc(db, 'users', uid, 'portfolio', 'a1'), { url: 'https://x/a.jpg', type: 'image' })],
  ['noticeboard project', (uid) => addDoc(collection(db, 'projects'), { clientId: uid, title: 'Probe', status: 'open', crewSlots: [] })],
  ['marketplace listing', (uid) => addDoc(collection(db, 'marketplace_listings'), { posterId: uid, title: 'Lens', price: 100, status: 'active' })],
  ['new chat', (uid) => addDoc(collection(db, 'chats'), { type: 'dm', members: [uid, VERIFIED.uid], lastMessage: null })],
  ['chat message', (uid) => addDoc(collection(db, 'chats', CHAT, 'messages'), { senderId: uid, text: 'hello', timestamp: serverTimestamp(), readBy: [uid] })],
  ['review', (uid) => addDoc(collection(db, 'reviews'), { reviewerId: uid, professionalId: 'someone-else', rating: 5, text: 'great' })],
];
const signUpWrites = [
  // NO `email` in this payload. The field is denied on users/{uid} — the doc is
  // readable by every signed-in user, so an email there made every address on
  // the platform enumerable, and it existed only for an admin-screen query that
  // is now the adminFindUser callable. This case carried one and started failing
  // the moment the rule landed, which is the probe doing its job.
  ['own user doc', (uid) => setDoc(doc(db, 'users', uid), { id: uid, displayName: 'Probe' }, { merge: true })],
  ['own phone (private contact)', (uid) => setDoc(doc(db, 'users', uid, 'private', 'contact'), { phone: '+972501234567', updatedAt: serverTimestamp() })],
];

/** Writes that must be DENIED regardless of how the user signed in. */
const alwaysDenied = [
  ['own user doc carrying an email', (uid) => setDoc(doc(db, 'users', uid), { id: uid, displayName: 'Probe', email: 'x@probe.invalid' }, { merge: true })],
];

for (const [name, run] of content) {
  await attempt('content', `${name} — verified password`, 'verified', true, run);
  await attempt('content', `${name} — UNVERIFIED password`, 'unverified', false, run);
  await attempt('content', `${name} — Google`, 'google', true, run);
}
for (const [name, run] of signUpWrites) {
  await attempt('sign-up writes stay open', `${name} — UNVERIFIED password`, 'unverified', true, run);
}
for (const [name, run] of alwaysDenied) {
  await attempt('denied for everyone', `${name} — verified password`, 'verified', false, run);
  await attempt('denied for everyone', `${name} — Google`, 'google', false, run);
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
