#!/usr/bin/env node
/**
 * Production probe: the held review of a "didn't happen" dispute.
 *
 * Probes the EXACT reads, writes and callable the shipped code makes, as four
 * different principals, against PRODUCTION (the rules are the same ruleset the app
 * runs under):
 *
 *   client      the project's client (the reviewer)
 *   pro         the disputing professional (the reviewed party)
 *   stranger    a throwaway who is a party to nothing  → must be denied
 *   admin       a throwaway email/password user given the `role: admin` custom claim (what
 *               requireAdmin / isAdmin() read). The claim exists only on that throwaway uid,
 *               which is deleted at the end. It is never added to ADMIN_UIDS. (A custom
 *               token would do the same, but needs signBlob rights this login lacks.)
 *
 * What it checks:
 *   - a held review (published:false, heldForDispute:true) is not readable by `get` by
 *     the pro, and `where professionalId==pro AND published==true` (the only list the
 *     app runs) returns the published review and NOT the held one, for every principal;
 *   - an unconstrained list on the pro's reviews is denied;
 *   - nobody can publish, edit or delete a review from a client (immutable);
 *   - a stranger cannot create a review on the project;
 *   - adminListFlaggedProjects returns the dispute WITH the held review (stars, text,
 *     author) for the admin, and is permission-denied for everyone else.
 *
 * Seeds throwaway docs with the Admin SDK (all tagged with a unique stamp), then
 * DELETES every doc and user it made and VERIFIES they are gone (exits non-zero if not).
 *
 *   node scripts/probe-dispute-review-prod.mjs --prod
 */
import './lib/requireProd.mjs'; // explicit --prod required, no default target
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import {
  getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
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
const STAMP = `probedispute${Date.now()}`;
const adminApp = ia({ projectId: cfg.projectId }, STAMP);
const adminDb = gdb(adminApp);
const adminAuth = gAdminAuth(adminApp);

let failures = 0;
const check = (l, ok, d = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}${d ? `  - ${d}` : ''}`); if (!ok) failures++; };
/** Succeeds AND the document is returned: a refusal or a missing doc is a failure. */
const readable = async (label, fn) => {
  try { const snap = await fn(); check(label, snap.exists(), snap.exists() ? 'readable' : 'no such document'); }
  catch (e) { check(label, false, `${e.code}: refused`); }
};
const denied = async (label, fn) => {
  try { await fn(); check(label, false, 'was ALLOWED'); }
  catch (e) { check(label, String(e.code ?? '').includes('permission-denied'), e.code); }
};

/** One signed-in principal on its own Firebase app instance. */
async function principal(name, how) {
  const app = initializeApp(cfg, `${STAMP}-${name}`);
  const auth = getAuth(app);
  const uid = await how(auth);
  return { name, uid, db: getFirestore(app), fns: getFunctions(app) };
}
const signUp = (name) => (auth) =>
  createUserWithEmailAndPassword(auth, `${STAMP}-${name}@probe.invalid`, 'Probe-Password-123!').then((c) => c.user.uid);

const created = { uids: [], docs: [] };
const mk = async (name) => { const p = await principal(name, signUp(name)); created.uids.push(p.uid); return p; };
let client, pro, stranger, admin;

const PROJECT = `${STAMP}-proj`;
let HELD;
const OPEN = `${STAMP}-published`;
const seed = async (path, data) => { await adminDb.doc(path).set(data); created.docs.push(path); };

let exitCode = 0;
try {
  client = await mk('client');
  pro = await mk('pro');
  stranger = await mk('stranger');
  admin = await mk('admin');
  HELD = `${PROJECT}_${pro.uid}`;
  await adminAuth.setCustomUserClaims(admin.uid, { role: 'admin' });
  {
    const idToken = await (await import('firebase/auth')).getAuth(admin.db.app).currentUser.getIdToken(true);
    const claims = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString());
    console.log(`admin token: uid=${claims.user_id} role=${claims.role}\n`);
  }
  await seed(`projects/${PROJECT}`, {
    clientId: client.uid, title: 'Probe dispute', status: 'completed', professionalIds: [pro.uid],
    slotHolders: [pro.uid], adminReviewPending: true, chatId: `${STAMP}-chat`,
  });
  await seed(`projects/${PROJECT}/fees/${pro.uid}`, {
    professionalId: pro.uid, projectId: PROJECT, feeStatus: 'owed', feeRate: 0.03, minFeeApplied: 6, baseAmount: 50,
    feeDue: 0, status: 'not_owed', engagementStatus: 'disputed', adminReviewPending: true,
    adminReview: { reason: 'didnt_happen', note: 'probe' }, disputeReason: 'probe',
    preDispute: { feeDue: 6, status: 'pending', baseAmount: 50 },
    chargeDueAt: new Date(Date.now() + 4 * 86400000), disputedAt: new Date(),
  });
  await seed(`reviews/${HELD}`, {
    projectId: PROJECT, professionalId: pro.uid, reviewerId: client.uid, authorId: client.uid, authorName: 'Probe Client',
    rating: 2, body: 'held review text', text: 'held review text', published: false, heldForDispute: true, createdAt: new Date(),
  });
  await seed(`reviews/${OPEN}`, {
    projectId: `${PROJECT}-other`, professionalId: pro.uid, reviewerId: client.uid, authorId: client.uid, authorName: 'Probe Client',
    rating: 5, body: 'public review', published: true, createdAt: new Date(),
  });

  console.log('1. The held review stays hidden (the queries the app runs):');
  for (const who of [pro, client, stranger, admin]) {
    try {
      const snap = await getDocs(query(collection(who.db, 'reviews'), where('professionalId', '==', pro.uid), where('published', '==', true)));
      const ids = snap.docs.map((d) => d.id);
      check(`${who.name}: list published reviews of the pro`, ids.includes(OPEN) && !ids.includes(HELD), ids.join(','));
    } catch (e) { check(`${who.name}: list published reviews of the pro`, false, e.code); }
  }
  await denied('stranger: unconstrained list of the pro\'s reviews', () => getDocs(query(collection(stranger.db, 'reviews'), where('professionalId', '==', pro.uid))));
  await denied('pro: unconstrained list of own reviews', () => getDocs(query(collection(pro.db, 'reviews'), where('professionalId', '==', pro.uid))));

  console.log('\n1b. A held review fetched BY ID (what a stranger who knows projectId_professionalId would do):');
  await denied('stranger: get the HELD review by id', () => getDoc(doc(stranger.db, `reviews/${HELD}`)));
  await denied('pro (the reviewed professional): get the HELD review by id', () => getDoc(doc(pro.db, `reviews/${HELD}`)));
  await readable('client (the reviewer): get their own HELD review by id', () => getDoc(doc(client.db, `reviews/${HELD}`)));
  await readable('admin: get the HELD review by id', () => getDoc(doc(admin.db, `reviews/${HELD}`)));
  await readable('stranger: get a PUBLISHED review by id (still allowed)', () => getDoc(doc(stranger.db, `reviews/${OPEN}`)));
  await readable('pro: get a PUBLISHED review by id (still allowed)', () => getDoc(doc(pro.db, `reviews/${OPEN}`)));

  console.log('\n2. Reviews are immutable and cannot be forced public:');
  for (const who of [pro, client, stranger]) {
    await denied(`${who.name}: publish the held review`, () => updateDoc(doc(who.db, `reviews/${HELD}`), { published: true }));
  }
  await denied('client: delete the held review', () => deleteDoc(doc(client.db, `reviews/${HELD}`)));
  await denied('pro: delete the held review', () => deleteDoc(doc(pro.db, `reviews/${HELD}`)));
  await denied('stranger: create a review on the project', () => setDoc(doc(stranger.db, `reviews/${PROJECT}_${pro.uid}x`), {
    projectId: PROJECT, professionalId: pro.uid, reviewerId: stranger.uid, authorId: stranger.uid, rating: 1, body: 'x', createdAt: new Date(),
  }));
  await denied('pro: pre-set published:false on a new review (cannot hold or force)', () => setDoc(doc(pro.db, `reviews/${PROJECT}_${pro.uid}y`), {
    projectId: PROJECT, professionalId: pro.uid, reviewerId: pro.uid, rating: 5, body: 'x', published: true, createdAt: new Date(),
  }));

  console.log('\n3. adminListFlaggedProjects (the callable the admin screens run):');
  const list = (who) => httpsCallable(who.fns, 'adminListFlaggedProjects')({}).then((r) => r.data);
  try {
    const out = await list(admin);
    const row = out.rows.find((r) => r.projectId === PROJECT);
    const d = row?.disputes?.[0];
    check('admin: the dispute is listed', !!d, `${out.rows.length} flagged row(s)`);
    check('admin: heldReview carries stars, text and author',
      d?.heldReview?.rating === 2 && d.heldReview.text === 'held review text' && d.heldReview.authorName === 'Probe Client',
      JSON.stringify(d?.heldReview));
  } catch (e) { check('admin: adminListFlaggedProjects', false, `${e.code}: ${e.message}`); }
  for (const who of [client, pro, stranger]) {
    await denied(`${who.name}: adminListFlaggedProjects`, () => list(who));
  }
} catch (e) {
  console.error('\nPROBE ERROR:', e);
  exitCode = 1;
} finally {
  console.log('\n4. Cleanup, then VERIFY it is gone:');
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
    // onUserCreate also writes users/<uid>: remove and verify that too.
    await adminDb.doc(`users/${uid}`).delete().catch(() => {});
    const userDocGone = !(await adminDb.doc(`users/${uid}`).get()).exists;
    console.log(`  ${gone ? 'gone  ' : 'STILL THERE'}  user ${uid}   users/${uid} doc: ${userDocGone ? 'gone' : 'STILL THERE'}`);
    if (!gone || !userDocGone) leftovers++;
  }
  const strays = await adminDb.collection('reviews').where('projectId', 'in', [PROJECT, `${PROJECT}-other`]).get();
  console.log(`  reviews tagged ${STAMP}: ${strays.size} remaining`);
  if (strays.size > 0) leftovers++;
  console.log(`\n${failures === 0 && leftovers === 0 && exitCode === 0 ? 'ALL PASS, nothing left behind' : `FAILED: ${failures} check(s), ${leftovers} leftover(s)`}`);
  process.exit(failures === 0 && leftovers === 0 && exitCode === 0 ? 0 : 1);
}
