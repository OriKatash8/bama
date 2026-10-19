#!/usr/bin/env node
/**
 * Production probe for adminStats/usage and refreshUsageStats as a NON-ADMIN signed-in user.
 * It creates a throwaway email/password account, runs the checks, and deletes the account
 * (also on failure). Run it with no arguments:
 *
 *   node scripts/probe-adminstats-prod.mjs
 *
 *   row                                            expected
 *   0 control: read my own users/{uid} doc         ALLOWED   (proves the session works)
 *   a read adminStats/usage                        DENIED
 *   b write adminStats/usage                       DENIED
 *   c call refreshUsageStats (europe-west1)        DENIED (permission-denied)
 *
 * Side effects: signing up fires the onUserCreate trigger, which writes users/{uid}. The
 * script deletes the Auth user; the leftover users/{uid} doc is printed (as "LEFTOVER") so
 * the operator can remove it with admin credentials.
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import { getAuth, createUserWithEmailAndPassword, deleteUser } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { randomBytes } from 'node:crypto';

const app = initializeApp({
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? 'AIzaSyAgECKwk9l1gV-F8zbaNSWViXeG7Vc6Uz8',
  authDomain: 'bama-af0a0.firebaseapp.com',
  projectId: 'bama-af0a0',
});
const db = getFirestore(app);
const auth = getAuth(app);
const refresh = httpsCallable(getFunctions(app, 'europe-west1'), 'refreshUsageStats');

const tag = randomBytes(4).toString('hex');
const email = `probe-adminstats-${tag}@example.invalid`;
const password = randomBytes(18).toString('base64url'); // never printed, never stored
const rows = [];
let uid = null;

async function row(name, expected, fn) {
  let got;
  try { await fn(); got = 'ALLOWED'; }
  catch (e) {
    const c = String(e.code ?? '');
    got = /permission-denied/.test(c) ? 'DENIED' : `ERROR ${c} ${String(e.message ?? '').slice(0, 80)}`;
  }
  rows.push({ row: name, expected, got, verdict: got === expected ? 'ok' : 'MISMATCH' });
}

try {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  uid = cred.user.uid;
  const claims = (await cred.user.getIdTokenResult()).claims;
  console.log(`signed in as throwaway ${uid} (role claim: ${claims.role ?? 'none'})`);

  // The onUserCreate trigger writes users/{uid} asynchronously; give it a moment for the control.
  await new Promise((r) => setTimeout(r, 4000));
  await row('0 control: read own users/{uid}', 'ALLOWED', () => getDoc(doc(db, 'users', uid)));
  await row('a read adminStats/usage', 'DENIED', () => getDoc(doc(db, 'adminStats', 'usage')));
  await row('b write adminStats/usage', 'DENIED', () => setDoc(doc(db, 'adminStats', 'usage'), { probe: true }));
  await row('c call refreshUsageStats', 'DENIED', () => refresh({}));
} finally {
  if (auth.currentUser) {
    try { await deleteUser(auth.currentUser); console.log('throwaway Auth user deleted'); }
    catch (e) { console.error('!! could not delete the throwaway user:', e.code ?? e.message, '- uid', uid); process.exitCode = 3; }
  }
  if (uid) console.log(`LEFTOVER: users/${uid} (written by onUserCreate) - remove with admin credentials`);
}

console.table(rows);
const bad = rows.filter((r) => r.verdict !== 'ok');
console.log(bad.length ? `FAIL: ${bad.length} row(s) did not match` : 'PASS: a non-admin can neither read, write nor refresh');
process.exit(process.exitCode ?? (bad.length ? 1 : 0));
