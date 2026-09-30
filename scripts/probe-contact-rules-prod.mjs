#!/usr/bin/env node
/**
 * PRODUCTION verification of the no-phone rule on users/{uid}/profile/data
 * (Terms §6.8). The emulator proved the rule logic (probe-contact-rules.mjs);
 * this proves the DEPLOYED rule, with one throwaway account.
 *
 * The write is the app's exact call: setDoc(profile/data, {...}, { merge: true })
 * with the fields useProfile.save writes, or { availability } alone. Bypass
 * cases write straight through the SDK, skipping the app's own check.
 *
 * profile/data requires a verified email, so the throwaway account is marked
 * verified with the Admin SDK (gcloud Application Default Credentials). Teardown
 * is asserted: the account is deleted first, then its docs, then re-read.
 *
 *   node scripts/probe-contact-rules-prod.mjs
 */
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { initializeApp as initAdmin } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';

for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '');
}
import { getFirestore, doc, setDoc, setLogLevel } from 'firebase/firestore';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';

const cfg = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};
if (!cfg.apiKey || !cfg.projectId) { console.error('missing EXPO_PUBLIC_FIREBASE_* in .env'); process.exit(1); }
console.log(`\nproject: ${cfg.projectId}  (LIVE)\n`);
setLogLevel('silent');

const app = initializeApp(cfg, 'contact-prod-probe');
const db = getFirestore(app);
const auth = getAuth(app);
const admin = initAdmin({ projectId: cfg.projectId });
const adminAuth = getAdminAuth(admin);
const adminDb = getAdminFirestore(admin);

const email = `probe${Date.now()}.contact@probe.invalid`;
const PW = 'Probe-Password-123!';
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
};

const uid = (await createUserWithEmailAndPassword(auth, email, PW)).user.uid;
await adminAuth.updateUser(uid, { emailVerified: true });
await signOut(auth);
await signInWithEmailAndPassword(auth, email, PW); // fresh token carries email_verified
console.log(`throwaway pro = ${uid}\n`);

const ref = doc(db, 'users', uid, 'profile', 'data');
const write = async (data) => {
  try { await setDoc(ref, data, { merge: true }); return 'allowed'; }
  catch (e) { return `denied (${e.code ?? e.message})`; }
};
const CLEAN = {
  roleSkills: [{ role: 'videographer', specializations: ['general'] }],
  bio: 'צלם וידאו, Sony 24-70mm f/2.8, מחיר ₪1,500 ליום',
  equipment: [{ name: 'A7S III + 3 סוללות', category: 'camera' }],
  priceList: [],
  proProfileCompleted: true,
};

try {
  let r = await write(CLEAN);
  check('1. clean bio + equipment (app save)', r === 'allowed', r);
  r = await write({ ...CLEAN, bio: 'call 052-123-4567' });
  check('2. bio with 052-123-4567 (direct SDK write) is denied', r.startsWith('denied'), r);
  r = await write({ ...CLEAN, equipment: [{ name: '052-123-4567', category: 'other' }] });
  check('3. equipment with a phone (direct SDK write) is denied', r.startsWith('denied'), r);
  r = await write({ availability: 'busy' });
  check('4. availability alone on a clean profile', r === 'allowed', r);
} finally {
  // Teardown: account first, then the docs, then confirm both are gone.
  await signOut(auth).catch(() => {});
  await adminAuth.deleteUser(uid);
  await adminDb.recursiveDelete(adminDb.doc(`users/${uid}`));
  const gone = !(await adminDb.doc(`users/${uid}/profile/data`).get()).exists;
  let authGone = false;
  try { await adminAuth.getUser(uid); } catch { authGone = true; }
  check('teardown: account and profile deleted', gone && authGone);
}
console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
