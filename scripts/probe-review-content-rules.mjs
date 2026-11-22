#!/usr/bin/env node
/**
 * Probe for the review-content rule (reviewContentOk): a review's rating must be
 * a whole number 1..5, and its comment is optional but at most 1000 characters.
 *
 * Runs against the Firestore + Auth EMULATORS with whatever firestore.rules
 * currently says. Nothing here touches production.
 *
 *   npx firebase emulators:start --only firestore,auth --project bama-af0a0
 *   node scripts/probe-review-content-rules.mjs --emulator
 */

import './lib/requireEmulator.mjs'; // explicit --emulator required, no default target
import { initializeApp as initAdmin } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, doc, setDoc, serverTimestamp } from 'firebase/firestore';
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
const EMAIL = 'rc-client@probe.invalid';
let clientUid;
try { clientUid = (await createUserWithEmailAndPassword(auth, EMAIL, PW)).user.uid; }
catch { clientUid = (await signInWithEmailAndPassword(auth, EMAIL, PW)).user.uid; }
await adminAuth.updateUser(clientUid, { emailVerified: true });
await signOut(auth);
await signInWithEmailAndPassword(auth, EMAIL, PW);
await auth.currentUser.getIdToken(true);

const PRO = 'probe-rc-pro';
const rows = [];
let n = 0;

/** Each case gets its own completed project, so the doc id is fresh and the engagement check passes. */
async function attempt(name, expected, fields) {
  n += 1;
  const projectId = `probe-rc-project-${n}`;
  await adminDb.doc(`projects/${projectId}`).set({
    clientId: clientUid, status: 'completed', professionalIds: [PRO], crewSlots: [], filledSlots: [],
  });
  await adminDb.doc(`reviews/${projectId}_${PRO}`).delete().catch(() => {});
  let allowed = true;
  let error = '';
  try {
    await setDoc(doc(db, 'reviews', `${projectId}_${PRO}`), {
      projectId, professionalId: PRO, reviewerId: clientUid, authorId: clientUid, authorName: 'Probe',
      createdAt: serverTimestamp(), ...fields,
    });
  } catch (e) { allowed = false; error = e.code ?? String(e.message ?? e); }
  rows.push({ name, expected, allowed, error });
}

await attempt('stars only (empty text)', true, { rating: 4, text: '', body: '' });
await attempt('stars + text', true, { rating: 5, text: 'Great to work with', body: 'Great to work with' });
await attempt('text of exactly 1000 chars', true, { rating: 3, text: 'x'.repeat(1000), body: 'x'.repeat(1000) });
await attempt('rating 1 (lower bound)', true, { rating: 1, text: '', body: '' });
await attempt('rating 0', false, { rating: 0, text: '', body: '' });
await attempt('rating 6', false, { rating: 6, text: '', body: '' });
await attempt('rating 3.5', false, { rating: 3.5, text: '', body: '' });
await attempt('rating as a string', false, { rating: '5', text: '', body: '' });
await attempt('rating missing', false, { text: 'no stars', body: 'no stars' });
await attempt('text of 1001 chars', false, { rating: 5, text: 'x'.repeat(1001), body: 'x'.repeat(1001) });
await attempt('body of 1001 chars, short text', false, { rating: 5, text: 'ok', body: 'x'.repeat(1001) });
await attempt('text not a string', false, { rating: 5, text: 42, body: '' });

let mismatches = 0;
for (const r of rows) {
  const ok = r.allowed === r.expected;
  if (!ok) mismatches++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${r.name} — ${r.allowed ? 'allowed' : `denied (${r.error})`}`);
}
console.log(`\n${rows.length} cases, ${mismatches} not as expected`);
await signOut(auth).catch(() => {});
process.exit(mismatches === 0 ? 0 : 1);
