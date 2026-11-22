#!/usr/bin/env node
/**
 * Production probe: reviewContentOk() on review create.
 *
 * A review's rating must be a whole number 1..5; the comment is optional (empty
 * string is fine) and at most 1000 characters. Writes the exact document shape
 * submitReviews writes, as a throwaway VERIFIED client against PRODUCTION rules.
 *
 *   stars only, stars + text                → allowed
 *   rating 0 / 6 / 3.5, text of 1001 chars  → denied
 *
 * The professional is a fake uid (no account): the rules only need it to differ
 * from the reviewer and to be on the project. Every doc is tagged with a unique
 * stamp, then DELETED and VERIFIED gone (exits non-zero on any leftover).
 *
 *   node scripts/probe-review-content-prod.mjs --prod
 */
import './lib/requireProd.mjs'; // explicit --prod required, no default target
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';

for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '');
}
const cfg = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};
console.log(`\nproject: ${cfg.projectId}  (LIVE)\n`);

const { initializeApp: ia } = await import('firebase-admin/app');
const { getFirestore: gdb } = await import('firebase-admin/firestore');
const { getAuth: gAdminAuth } = await import('firebase-admin/auth');
const STAMP = `probereviewcontent${Date.now()}`;
const adminApp = ia({ projectId: cfg.projectId }, STAMP);
const adminDb = gdb(adminApp);
const adminAuth = gAdminAuth(adminApp);

let failures = 0;
const check = (l, ok, d = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}${d ? `  - ${d}` : ''}`); if (!ok) failures++; };

const created = { uids: [], docs: [] };
const projects = [];
const PRO = `${STAMP}-pro`;
let exitCode = 0;

try {
  const app = initializeApp(cfg, STAMP);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const clientUid = (await createUserWithEmailAndPassword(auth, `${STAMP}-client@probe.invalid`, 'Probe-Password-123!')).user.uid;
  created.uids.push(clientUid);
  // verified(): a password account needs a verified email to write reviews.
  await adminAuth.updateUser(clientUid, { emailVerified: true });
  await auth.currentUser.getIdToken(true);

  let n = 0;
  async function attempt(label, expectAllowed, fields) {
    n += 1;
    const projectId = `${STAMP}-proj${n}`;
    projects.push(projectId);
    await adminDb.doc(`projects/${projectId}`).set({
      clientId: clientUid, title: 'Probe review content', status: 'completed',
      professionalIds: [PRO], crewSlots: [], filledSlots: [],
    });
    created.docs.push(`projects/${projectId}`);
    const reviewPath = `reviews/${projectId}_${PRO}`;
    created.docs.push(reviewPath);
    try {
      await setDoc(doc(db, reviewPath), {
        projectId, professionalId: PRO, reviewerId: clientUid, authorId: clientUid, authorName: 'Probe Client',
        createdAt: serverTimestamp(), ...fields,
      });
      check(label, expectAllowed, 'allowed');
    } catch (e) {
      check(label, !expectAllowed && String(e.code ?? '').includes('permission-denied'), e.code ?? String(e));
    }
  }

  console.log('Review create, production rules:');
  await attempt('stars only (empty comment) → allowed', true, { rating: 4, text: '', body: '' });
  await attempt('stars + text → allowed', true, { rating: 5, text: 'Great to work with', body: 'Great to work with' });
  await attempt('rating 0 → denied', false, { rating: 0, text: '', body: '' });
  await attempt('rating 6 → denied', false, { rating: 6, text: '', body: '' });
  await attempt('rating 3.5 → denied', false, { rating: 3.5, text: '', body: '' });
  await attempt('text of 1001 chars → denied', false, { rating: 5, text: 'x'.repeat(1001), body: 'x'.repeat(1001) });
} catch (e) {
  console.error('probe error:', e);
  exitCode = 1;
} finally {
  console.log('\nCleanup, then VERIFY it is gone:');
  // Let onReviewCreate finish on the allowed reviews before deleting them.
  await new Promise((r) => setTimeout(r, 25_000));
  for (const path of [...created.docs].reverse()) await adminDb.doc(path).delete().catch(() => {});
  for (const uid of created.uids) await adminAuth.deleteUser(uid).catch(() => {});
  let leftovers = 0;
  for (const path of created.docs) {
    const gone = !(await adminDb.doc(path).get()).exists;
    console.log(`  ${gone ? 'gone  ' : 'STILL THERE'}  doc  ${path}`);
    if (!gone) leftovers++;
  }
  for (const uid of created.uids) {
    const gone = await adminAuth.getUser(uid).then(() => false, (e) => e.code === 'auth/user-not-found');
    // onUserCreate also writes users/<uid> (and nothing writes to the fake pro uid).
    await adminDb.doc(`users/${uid}`).delete().catch(() => {});
    const userDocGone = !(await adminDb.doc(`users/${uid}`).get()).exists;
    console.log(`  ${gone ? 'gone  ' : 'STILL THERE'}  user ${uid}   users/${uid} doc: ${userDocGone ? 'gone' : 'STILL THERE'}`);
    if (!gone || !userDocGone) leftovers++;
  }
  const strays = projects.length
    ? (await adminDb.collection('reviews').where('professionalId', '==', PRO).get()).size
    : 0;
  console.log(`  reviews for ${PRO}: ${strays} remaining`);
  if (strays > 0) leftovers++;
  const ok = failures === 0 && leftovers === 0 && exitCode === 0;
  console.log(`\n${ok ? 'ALL PASS, nothing left behind' : `FAILED: ${failures} check(s), ${leftovers} leftover(s)`}`);
  process.exit(ok ? 0 : 1);
}
