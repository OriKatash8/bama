#!/usr/bin/env node
/**
 * PRODUCTION verification of Completion Flow v2.
 *
 * Answers the questions the change actually has to get right:
 *   - a professional cannot write or alter their OWN fee record;
 *   - the client cannot read any fee record;
 *   - a review is visible IMMEDIATELY on completion, with a fee still pending —
 *     the whole point of removing the review hold;
 *   - the runtime config is readable by an ordinary user and writable by nobody;
 *   - a client cannot flag its own project for admin review.
 *
 * Discipline, from docs/known-issues-silent-failures.md:
 *   - the collection-group probe runs the EXACT query feesService.ts ships, and
 *     asserts that shape out of the source first, because a probe that adds one
 *     filter is a different query to the index planner and passes for the wrong
 *     reason;
 *   - teardown ASSERTS what it deleted, deletes the auth account before its
 *     documents, and sweeps again afterwards for what the create-trigger wrote.
 *
 *   node scripts/probe-completion-v2-prod.mjs
 */
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, collectionGroup, query, where, getDocs,
} from 'firebase/firestore';
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, deleteUser,
} from 'firebase/auth';

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

const STAMP = `probe${Date.now()}`;
const app = initializeApp(cfg, STAMP);
const db = getFirestore(app), auth = getAuth(app);

const { initializeApp: ia } = await import('firebase-admin/app');
const { getFirestore: gdb } = await import('firebase-admin/firestore');
const { getAuth: ga } = await import('firebase-admin/auth');
const adminApp = ia({ projectId: cfg.projectId }, STAMP);
const adminDb = gdb(adminApp);
const adminAuth = ga(adminApp);

const PW = 'Probe-Password-123!';
const accounts = {};
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
};
/** Run `fn`; resolve to true when it was ALLOWED, false when rules denied it. */
async function allowed(fn) {
  try { await fn(); return true; } catch (e) {
    if (e?.code === 'permission-denied' || e?.code === 'failed-precondition') return false;
    // Anything else is a real error, not a rules answer — surface it rather than
    // scoring it as a pass in either direction.
    throw e;
  }
}
async function mk(tag) {
  const email = `${STAMP}.${tag}@bama-invalid.test`;
  const c = await createUserWithEmailAndPassword(auth, email, PW);
  accounts[tag] = { uid: c.user.uid, email };
  await signOut(auth);
  return c.user.uid;
}
async function as(tag) {
  await signOut(auth).catch(() => {});
  await signInWithEmailAndPassword(auth, accounts[tag].email, PW);
}

// ── 0. The shipped query shape, asserted out of the source ────────────────
// A probe that drifts from the code it verifies reports a truthful result about
// the wrong thing. This is the guard against that.
{
  const src = readFileSync(new URL('../src/features/pricing/services/feesService.ts', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('export function listenToMyFees'));
  const wheres = [...body.matchAll(/where\(\s*'([^']+)'\s*,\s*'([^']+)'/g)].map((m) => `${m[1]} ${m[2]}`);
  const isGroup = /collectionGroup\(\s*db\s*,\s*'fees'\s*\)/.test(body);
  if (!isGroup || wheres.length !== 1 || wheres[0] !== 'professionalId ==') {
    console.error(`\nABORT: listenToMyFees no longer ships collectionGroup('fees') with exactly one`);
    console.error(`equality on professionalId. Found: group=${isGroup} wheres=${JSON.stringify(wheres)}`);
    console.error('Update this probe to match the shipped query before trusting it.\n');
    process.exit(1);
  }
  console.log(`shipped query confirmed: collectionGroup('fees').where('professionalId','==',uid)\n`);
}

const PRO = await mk('pro'), CLIENT = await mk('client');
console.log(`pro=${PRO}\nclient=${CLIENT}\n`);

const PID = `${STAMP}-project`;
const REVIEW_ID = `${STAMP}-review`;
const made = { projects: [PID], reviews: [REVIEW_ID] };

try {
  // ── seed: a COMPLETED project whose professional still owes ──────────────
  const soon = new Date(Date.now() + 4 * 86400_000);
  await adminDb.collection('projects').doc(PID).set({
    clientId: CLIENT, title: 'Probe completion v2', description: 'x', location: 'TLV',
    deadline: 'flexible', crewSlots: [{ category: 'Editor', quantity: 1 }],
    filledSlots: [{ category: 'Editor', professionalId: PRO }],
    professionalIds: [PRO],
    // Completion frees every slot, whatever is owed.
    slotHolders: [], slotActive: false,
    status: 'completed', completedAt: new Date(),
    completion: { state: 'confirmed', source: 'client', confirmedAt: new Date() },
    disputeWindowEndsAt: soon,
    createdAt: new Date(),
  });
  await adminDb.doc(`projects/${PID}/fees/${PRO}`).set({
    professionalId: PRO, projectId: PID, feeStatus: 'owed', status: 'pending',
    feeRate: 0.03, baseAmount: 1000, feeDue: 30, feePaid: false, slotActive: false,
    createdAt: new Date(), hiredAt: new Date(),
  });
  // A review of that professional, published — which is the state under test.
  await adminDb.collection('reviews').doc(REVIEW_ID).set({
    projectId: PID, professionalId: PRO, reviewerId: CLIENT, authorId: CLIENT,
    authorName: 'Probe client', rating: 5, text: 'probe', body: 'probe',
    published: true, visibleAt: new Date(), createdAt: new Date(),
  });

  // ── 1. fee records are not client-writable ──────────────────────────────
  console.log('1. Fee records — the professional cannot alter their own:');
  await as('pro');
  const feePath = `projects/${PID}/fees/${PRO}`;
  check('pro READS their own fee record'.padEnd(52) + 'ALLOW',
    await allowed(() => getDoc(doc(db, feePath))) === true);
  check('pro marks their own fee paid'.padEnd(52) + 'deny ',
    await allowed(() => updateDoc(doc(db, feePath), { status: 'paid', feePaid: true, feeDue: 0 })) === false);
  check('pro zeroes their own feeDue'.padEnd(52) + 'deny ',
    await allowed(() => updateDoc(doc(db, feePath), { feeDue: 0 })) === false);
  check('pro clears a dispute on their own record'.padEnd(52) + 'deny ',
    await allowed(() => updateDoc(doc(db, feePath), { status: 'not_owed' })) === false);
  check('pro CREATES a fee record on another project'.padEnd(52) + 'deny ',
    await allowed(() => setDoc(doc(db, `projects/${PID}/fees/forged`), { professionalId: PRO, feeDue: 0 })) === false);
  check('pro DELETES their own fee record'.padEnd(52) + 'deny ',
    await allowed(() => deleteDoc(doc(db, feePath))) === false);
  // The arrears gate counts from demandSentAt, so a pro who could write it could
  // push their own deadline out indefinitely; one who could clear it would lift
  // their own block. Both are the same `allow write: if false`, asserted because
  // the gate's correctness rests entirely on this field being admin-only.
  check('pro stamps their own demandSentAt'.padEnd(52) + 'deny ',
    await allowed(() => updateDoc(doc(db, feePath), { demandSentAt: new Date() })) === false);
  check('pro clears their own demandSentAt'.padEnd(52) + 'deny ',
    await allowed(() => updateDoc(doc(db, feePath), { demandSentAt: null })) === false);

  // The exact shipped query. Asserted above, so it cannot drift from the code.
  const groupQ = query(collectionGroup(db, 'fees'), where('professionalId', '==', PRO));
  let groupSize = -1;
  const groupOk = await allowed(async () => { groupSize = (await getDocs(groupQ)).size; });
  check('pro lists their own fees (the SHIPPED query)'.padEnd(52) + 'ALLOW',
    groupOk === true && groupSize === 1, `size=${groupSize}`);

  // ── 2. the client is never told a professional owes money ───────────────
  console.log('\n2. Fee records — the client cannot read them:');
  await as('client');
  check('client reads the fee record'.padEnd(52) + 'deny ',
    await allowed(() => getDoc(doc(db, feePath))) === false);
  check('client lists the project fees subcollection'.padEnd(52) + 'deny ',
    await allowed(() => getDocs(collection(db, `projects/${PID}/fees`))) === false);

  // ── 3. THE POINT: the review is visible with a fee outstanding ──────────
  console.log('\n3. Reviews publish on completion, with a fee still pending:');
  const fee = (await adminDb.doc(feePath).get()).data();
  check('precondition: the fee really is outstanding', fee?.status === 'pending' && fee?.feeDue > 0,
    `status=${fee?.status} feeDue=${fee?.feeDue}`);
  // The shipped read path — reviewsService.fetchPublishedReviews.
  const revQ = query(collection(db, 'reviews'),
    where('professionalId', '==', PRO), where('published', '==', true));
  for (const tag of ['client', 'pro']) {
    await as(tag);
    let n = -1;
    const ok = await allowed(async () => { n = (await getDocs(revQ)).size; });
    check(`${tag} sees the published review`.padEnd(52) + 'ALLOW', ok === true && n === 1, `size=${n}`);
  }
  await as('pro');
  check('the reviewed pro can read it directly'.padEnd(52) + 'ALLOW',
    await allowed(() => getDoc(doc(db, 'reviews', REVIEW_ID))) === true);

  // ── 4. runtime config ───────────────────────────────────────────────────
  console.log('\n4. Runtime config — readable by all, writable by none:');
  await as('pro');
  let cfgDoc = null;
  const cfgOk = await allowed(async () => { cfgDoc = await getDoc(doc(db, 'config/pricing')); });
  check('signed-in user READS config/pricing'.padEnd(52) + 'ALLOW', cfgOk === true && cfgDoc?.exists());
  const keys = ['feePercent', 'maxOpenProjects', 'disputeWindowDays', 'autoCloseReminderDays',
    'autoCloseFinalDays', 'autoCloseDays', 'paymentFailureGraceDays', 'minFeeAmount'];
  const data = cfgDoc?.exists() ? cfgDoc.data() : {};
  const missing = keys.filter((k) => typeof data[k] !== 'number');
  check(`all ${keys.length} keys present and numeric`, missing.length === 0, missing.join(',') || 'ok');
  check('user rewrites the commission rate'.padEnd(52) + 'deny ',
    await allowed(() => updateDoc(doc(db, 'config/pricing'), { feePercent: 0 })) === false);

  // ── 5. admin-review flags are server-only ───────────────────────────────
  console.log('\n5. Admin-review flags are server-only:');
  await as('client');
  check('client flags its own project for review'.padEnd(52) + 'deny ',
    await allowed(() => updateDoc(doc(db, 'projects', PID), { adminReviewPending: true })) === false);
  check('client moves its own dispute deadline'.padEnd(52) + 'deny ',
    await allowed(() => updateDoc(doc(db, 'projects', PID), { disputeWindowEndsAt: new Date() })) === false);
  check('client re-occupies slots after completion'.padEnd(52) + 'deny ',
    await allowed(() => updateDoc(doc(db, 'projects', PID), { slotHolders: [PRO] })) === false);
} catch (e) {
  console.error('\nprobe threw:', e);
  failures++;
} finally {
  console.log('\nTeardown:');
  // Auth first: onUserCreate writes users/{uid} asynchronously, so deleting the
  // document before the account can lose the race and leave a survivor.
  for (const tag of ['pro', 'client']) {
    try { await as(tag); await deleteUser(auth.currentUser); }
    catch (e) { console.error('  account delete failed', tag, e?.code ?? e); failures++; }
  }
  await signOut(auth).catch(() => {});
  for (const id of made.reviews) await adminDb.collection('reviews').doc(id).delete();
  for (const pid of made.projects) {
    for (const f of (await adminDb.collection(`projects/${pid}/fees`).get()).docs) await f.ref.delete();
    await adminDb.collection('projects').doc(pid).delete();
  }
  // Whatever the create-trigger wrote under the throwaway accounts.
  for (const tag of ['pro', 'client']) {
    if (accounts[tag]) await adminDb.collection('users').doc(accounts[tag].uid).delete().catch(() => {});
  }

  // ASSERT the teardown rather than assuming it.
  let left = 0;
  for (const id of made.reviews) if ((await adminDb.collection('reviews').doc(id).get()).exists) left++;
  for (const pid of made.projects) {
    if ((await adminDb.collection('projects').doc(pid).get()).exists) left++;
    left += (await adminDb.collection(`projects/${pid}/fees`).get()).size;
  }
  let leaked = 0;
  for (const tag of ['pro', 'client']) {
    if (!accounts[tag]) continue;
    try { await adminAuth.getUser(accounts[tag].uid); leaked++; } catch { /* gone, as intended */ }
    if ((await adminDb.collection('users').doc(accounts[tag].uid).get()).exists) leaked++;
  }
  check('probe docs removed', left === 0, `${left} left`);
  check('probe accounts and their user docs removed', leaked === 0, `${leaked} leaked`);
}
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
