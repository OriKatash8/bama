#!/usr/bin/env node
/**
 * PRODUCTION verification of the deployed offer-status state machine.
 *
 * The emulator proved the rule logic; this proves the DEPLOYED rule with real
 * auth against the real project. The failure that matters is a false DENY on the
 * legitimate paths — a pro who cannot send an offer, or a client who cannot
 * decline one, would not surface until a user hit it.
 *
 * Throwaway accounts and a throwaway project. Seeding uses the Admin SDK because
 * seeding is test setup and must bypass rules — and because the rule under test
 * now forbids a client from creating an 'accepted' offer at all.
 *
 * Teardown deletes auth accounts first, then docs, then re-reads both.
 *   node scripts/probe-offer-rules-prod.mjs
 */
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import {
  getFirestore, doc, updateDoc, collection, addDoc, serverTimestamp,
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
if (!cfg.apiKey || !cfg.projectId) { console.error('missing EXPO_PUBLIC_FIREBASE_* in .env'); process.exit(1); }
console.log(`\nproject: ${cfg.projectId}  (LIVE)\n`);

const app = initializeApp(cfg, 'offer-prod-probe');
const db = getFirestore(app);
const auth = getAuth(app);

const { initializeApp: initAdminApp } = await import('firebase-admin/app');
const { getFirestore: getAdminDb } = await import('firebase-admin/firestore');
const { getAuth: getAdminAuth } = await import('firebase-admin/auth');
const STAMP = `probe${Date.now()}`;
const adminApp = initAdminApp({ projectId: cfg.projectId }, STAMP);
const adminDb = getAdminDb(adminApp);

const PW = 'Probe-Password-123!';
const PRJ = `${STAMP}-project`;
const OFFER = `${STAMP}-offer`;
const BUNDLE = `${STAMP}-bundle`;
const accounts = {};
let failures = 0;

function check(label, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
}
async function mkUser(tag) {
  const email = `${STAMP}.${tag}@probe.invalid`;
  const cred = await createUserWithEmailAndPassword(auth, email, PW);
  accounts[tag] = { uid: cred.user.uid, email };
  await signOut(auth);
  return cred.user.uid;
}
async function as(tag) {
  await signOut(auth).catch(() => {});
  await signInWithEmailAndPassword(auth, accounts[tag].email, PW);
}

const PRO = await mkUser('pro');
const CLIENT = await mkUser('client');
console.log(`pro=${PRO}\nclient=${CLIENT}\n`);

async function seed(offerStatus, projectStatus = 'open') {
  await adminDb.collection('projects').doc(PRJ).set({
    clientId: CLIENT, title: 'Probe Project', crewSlots: [], filledSlots: [],
    status: projectStatus, createdAt: new Date(),
  });
  await adminDb.collection('priceOffers').doc(OFFER).set({
    projectId: PRJ, professionalId: PRO, category: 'Video Photographer',
    price: 1000, status: offerStatus, createdAt: new Date(),
  });
  await adminDb.collection('bundleOffers').doc(BUNDLE).set({
    projectId: PRJ, professionalId: PRO, slots: [{ category: 'Editor' }],
    individualTotal: 500, bundlePrice: 400, offerIds: [], status: offerStatus, createdAt: new Date(),
  });
}
async function upd(label, tag, col, docId, payload, expectAllow, offerStatus = 'pending', projStatus = 'open') {
  await seed(offerStatus, projStatus);
  await as(tag);
  let allowed = true, code = '';
  try { await updateDoc(doc(db, col, docId), payload); }
  catch (e) { allowed = false; code = e.code ?? String(e); }
  check(`${label.padEnd(52)} as ${tag}`, allowed === expectAllow,
        `${allowed ? 'ALLOW' : 'deny'} (wanted ${expectAllow ? 'ALLOW' : 'deny'})`);
}
async function create(label, tag, col, payload, expectAllow) {
  await seed('pending');
  await as(tag);
  let allowed = true, made = null;
  try { made = (await addDoc(collection(db, col), payload)).id; }
  catch { allowed = false; }
  if (made) await adminDb.collection(col).doc(made).delete();
  check(`${label.padEnd(52)} as ${tag}`, allowed === expectAllow,
        `${allowed ? 'ALLOW' : 'deny'} (wanted ${expectAllow ? 'ALLOW' : 'deny'})`);
}

try {
  console.log('MUST STILL WORK:');
  await upd('client declines a pending offer', 'client', 'priceOffers', OFFER, { status: 'rejected' }, true);
  await upd('client declines a pending bundle', 'client', 'bundleOffers', BUNDLE, { status: 'rejected' }, true);
  await create('pro creates a pending offer on a real project', 'pro', 'priceOffers', {
    projectId: PRJ, professionalId: PRO, category: 'Editor', price: 500,
    status: 'pending', createdAt: serverTimestamp(),
  }, true);
  await upd('pro edits price on a pending offer', 'pro', 'priceOffers', OFFER,
    { price: 900, editedAt: serverTimestamp(), editCount: 1 }, true);

  console.log('\nMUST NOW BE BLOCKED:');
  await upd('THE LEAK: accepted -> rejected', 'pro', 'priceOffers', OFFER, { status: 'rejected' }, false, 'accepted');
  await upd('THE LEAK: accepted -> rejected', 'client', 'priceOffers', OFFER, { status: 'rejected' }, false, 'accepted');
  await upd('THE LEAK: bundle accepted -> rejected', 'pro', 'bundleOffers', BUNDLE, { status: 'rejected' }, false, 'accepted');
  await upd('forge: pending -> accepted', 'client', 'priceOffers', OFFER, { status: 'accepted' }, false);
  await upd('forge: pending -> accepted', 'pro', 'priceOffers', OFFER, { status: 'accepted' }, false);
  await create('create born accepted', 'pro', 'priceOffers', {
    projectId: PRJ, professionalId: PRO, category: 'X', price: 1,
    status: 'accepted', createdAt: serverTimestamp(),
  }, false);
  await create('create on a nonexistent project', 'pro', 'priceOffers', {
    projectId: 'no-such-project-anywhere', professionalId: PRO, category: 'X', price: 1,
    status: 'pending', createdAt: serverTimestamp(),
  }, false);
  await upd('project completed -> open', 'client', 'projects', PRJ, { status: 'open' }, false, 'pending', 'completed');
  await upd('project cancelled -> open', 'client', 'projects', PRJ, { status: 'open' }, false, 'pending', 'cancelled');

  console.log('\nCONTROL — legitimate project writes still work:');
  await upd('project open -> in_progress', 'client', 'projects', PRJ, { status: 'in_progress' }, true);
  await upd('project title/deadline edit', 'client', 'projects', PRJ,
    { title: 'Renamed', deadline: '2026-12-01' }, true);
} catch (e) {
  console.error('\nprobe threw:', e);
  failures++;
} finally {
  console.log('\nTeardown:');
  for (const tag of ['pro', 'client']) {
    try { await as(tag); await deleteUser(auth.currentUser); }
    catch (e) { console.error('  account delete failed', tag, e.code ?? e); failures++; }
  }
  for (const [col, id] of [['priceOffers', OFFER], ['bundleOffers', BUNDLE], ['projects', PRJ]]) {
    await adminDb.collection(col).doc(id).delete();
  }
  let left = 0;
  for (const [col, id] of [['priceOffers', OFFER], ['bundleOffers', BUNDLE], ['projects', PRJ]]) {
    if ((await adminDb.collection(col).doc(id).get()).exists) { console.error('  SURVIVED:', col, id); left++; }
  }
  const stray = await adminDb.collection('priceOffers').where('projectId', '==', PRJ).get();
  for (const d of stray.docs) { await d.ref.delete(); left++; console.error('  stray offer removed:', d.id); }
  let leaked = 0;
  for (const tag of ['pro', 'client']) {
    try { await getAdminAuth(adminApp).getUser(accounts[tag].uid); leaked++; console.error('  LEAKED account:', accounts[tag].email); }
    catch { /* gone */ }
  }
  check('probe docs removed', left === 0, `${left} left`);
  check('probe auth accounts removed', leaked === 0, `${leaked} leaked`);
}
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED — deployed rule behaves as designed' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
