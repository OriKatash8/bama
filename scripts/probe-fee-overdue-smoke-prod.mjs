#!/usr/bin/env node
/**
 * PRODUCTION smoke test, run IMMEDIATELY after deploying the overdue-fee rules
 * with the kill switch OFF: an ordinary professional can still create a price
 * offer, a bundle offer and an application, with the exact writes the app makes.
 *
 * Exit 0 = all three allowed. Exit 1 = something was denied (roll back the rules).
 * Cleanup runs in `finally` and is asserted.
 *
 *   node scripts/probe-fee-overdue-smoke-prod.mjs
 */
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';
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

// The shipped payloads, asserted out of the source.
{
  const offer = readFileSync(new URL('../src/features/noticeboard/hooks/usePriceOffer.ts', import.meta.url), 'utf8');
  const appl = readFileSync(new URL('../src/features/noticeboard/hooks/useProjectApplication.ts', import.meta.url), 'utf8');
  const ok = /addDocument\('priceOffers', \{\s*projectId,\s*professionalId: user\.id,\s*category: slot\.category,\s*price: slot\.price,\s*status: 'pending' as const,\s*createdAt: serverTimestamp\(\),\s*\}\)/.test(offer)
    && /addDocument\('bundleOffers', \{\s*projectId,\s*professionalId: user\.id,\s*slots:[\s\S]*?individualTotal:[\s\S]*?bundlePrice,\s*offerIds,\s*status: 'pending' as const,\s*createdAt: \{ seconds/.test(offer)
    && /addDocument\('projectApplications', \{\s*projectId,\s*professionalId: user\.id,\s*status: 'pending' as const,\s*createdAt: \{ seconds/.test(appl);
  if (!ok) { console.error('ABORT: shipped payload shape changed; update this script.'); process.exit(1); }
}

const STAMP = `smoke${Date.now()}`;
const app = initializeApp(cfg, STAMP);
const db = getFirestore(app), auth = getAuth(app);
const { initializeApp: ia } = await import('firebase-admin/app');
const { getFirestore: gdb } = await import('firebase-admin/firestore');
const { getAuth: ga } = await import('firebase-admin/auth');
const adminApp = ia({ projectId: cfg.projectId }, STAMP);
const adminDb = gdb(adminApp), adminAuth = ga(adminApp);

const sw = (await adminDb.doc('config/pricing').get()).get('feeOverdueBlockEnabled');
console.log(`kill switch: ${JSON.stringify(sw ?? null)}`);
if (sw === true) { console.error('ABORT: the switch is ON; this smoke test is for the OFF state.'); process.exit(1); }

const PW = 'Probe-Password-123!';
const accounts = {};
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
};
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
async function allowed(fn) {
  try { await fn(); return 'ALLOW'; } catch (e) { return e?.code === 'permission-denied' ? 'DENY' : `ERROR ${e?.code ?? e}`; }
}

const PID = `${STAMP}-project`;
try {
  const PRO = await mk('pro');
  const CLIENT = await mk('client');
  await adminDb.doc(`projects/${PID}`).set({
    clientId: CLIENT, title: 'Smoke — overdue rules', description: 'probe', location: 'TLV', deadline: 'flexible',
    crewSlots: [{ category: 'Editor', quantity: 1 }, { category: 'Colorist', quantity: 1 }],
    filledSlots: [], professionalIds: [], slotHolders: [], status: 'open', createdAt: new Date(),
  });
  await as('pro');
  const r1 = await allowed(() => addDoc(collection(db, 'priceOffers'), {
    projectId: PID, professionalId: PRO, category: 'Editor', price: 1000, status: 'pending', createdAt: serverTimestamp(),
  }));
  const r2 = await allowed(() => addDoc(collection(db, 'bundleOffers'), {
    projectId: PID, professionalId: PRO, slots: [{ category: 'Editor' }, { category: 'Colorist' }],
    individualTotal: 2000, bundlePrice: 1800, offerIds: ['x', 'y'], status: 'pending',
    createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
  }));
  const r3 = await allowed(() => addDoc(collection(db, 'projectApplications'), {
    projectId: PID, professionalId: PRO, status: 'pending',
    createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
  }));
  check('normal pro creates a price offer'.padEnd(44) + 'ALLOW', r1 === 'ALLOW', r1);
  check('normal pro creates a bundle offer'.padEnd(44) + 'ALLOW', r2 === 'ALLOW', r2);
  check('normal pro creates an application'.padEnd(44) + 'ALLOW', r3 === 'ALLOW', r3);
} catch (e) {
  console.error('\nsmoke threw:', e);
  failures++;
} finally {
  console.log('\nTeardown:');
  const uids = Object.values(accounts).map((a) => a.uid);
  for (const tag of Object.keys(accounts)) {
    try { await as(tag); await deleteUser(auth.currentUser); }
    catch (e) { console.error('  account delete failed', tag, e?.code ?? e); failures++; }
  }
  await signOut(auth).catch(() => {});
  for (const col of ['priceOffers', 'bundleOffers', 'projectApplications']) {
    for (const d of (await adminDb.collection(col).where('projectId', '==', PID).get()).docs) await d.ref.delete();
  }
  await adminDb.recursiveDelete(adminDb.doc(`projects/${PID}`));
  await new Promise((r) => setTimeout(r, 8000)); // onUserCreate / notification triggers
  for (const uid of uids) {
    for (const n of (await adminDb.collection('notifications').where('userId', '==', uid).get()).docs) await n.ref.delete();
    await adminDb.doc(`feeBlocks/${uid}`).delete();
    await adminDb.recursiveDelete(adminDb.doc(`users/${uid}`));
  }
  let left = (await adminDb.doc(`projects/${PID}`).get()).exists ? 1 : 0;
  for (const col of ['priceOffers', 'bundleOffers', 'projectApplications']) {
    left += (await adminDb.collection(col).where('projectId', '==', PID).get()).size;
  }
  let leaked = 0;
  for (const uid of uids) {
    try { await adminAuth.getUser(uid); leaked++; } catch { /* gone */ }
    if ((await adminDb.doc(`users/${uid}`).get()).exists) leaked++;
  }
  check('smoke docs removed', left === 0, `${left} left`);
  check('smoke accounts and user docs removed', leaked === 0, `${leaked} leaked`);
}
console.log(`\n${failures === 0 ? 'SMOKE PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
