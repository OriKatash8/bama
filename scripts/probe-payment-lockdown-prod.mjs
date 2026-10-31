#!/usr/bin/env node
/**
 * DRAFT - NOT RUN. PRODUCTION verification that the payment layer is closed to clients.
 *
 * Uses the EXACT calls the shipped code makes (the config listener's getDoc, the
 * fees collection-group query from listenToMyFees, the europe-west1 callables the
 * card row calls), so a pass means the real paths behave, not a lookalike.
 *
 *   1. paymentMethods, paymentEvents, paymentFake, fees/*\/charges and
 *      config/paymentsPrivate refuse every client read and write.
 *   2. The reads the app DOES make still work (config/pricing, own fee, the fees
 *      collection-group query), so the new rules did not break them.
 *   3. getMyPaymentMethod never returns the token, and tells a user the feature is
 *      off while paymentProvider is 'none'.
 *   4. createCardSaveSession / removeMyPaymentMethod / fakeCompleteCardSave refuse
 *      while payments are off, each for THE RIGHT REASON (the throwaway user is made
 *      email-verified first; an unverified password user would be refused by
 *      createCardSaveSession's verified-email check instead, which would pass this
 *      check for the wrong reason). The admin callables refuse a non-admin.
 *   5. paymentWebhook: GET is 405; a junk POST changes nothing and leaks nothing.
 *      SKIPPED unless PROBE_WEBHOOK=1: paymentWebhook is held back from the first
 *      deploy and ships with the Grow step.
 *
 * Needs paymentProvider 'none' in config/pricing (the shipped default). It creates a
 * throwaway user (onUserCreate also writes users/<uid>, which is removed too) and seeds a
 * card + fee with the Admin SDK, then removes them. Section 5: PROBE_WEBHOOK=1 to include it.
 *
 *   node scripts/probe-payment-lockdown-prod.mjs --prod
 */
import './lib/requireProd.mjs'; // explicit --prod required, no default target
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import {
  getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, collectionGroup, query, where,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth, createUserWithEmailAndPassword, signOut, deleteUser } from 'firebase/auth';

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
const app = initializeApp(cfg, 'pay-lockdown');
const db = getFirestore(app), auth = getAuth(app);
const eu = getFunctions(app, 'europe-west1');
const call = (name, data = {}) => httpsCallable(eu, name)(data).then((r) => r.data);

const { initializeApp: ia } = await import('firebase-admin/app');
const { getFirestore: gdb } = await import('firebase-admin/firestore');
const { getAuth: gAdminAuth } = await import('firebase-admin/auth');
const STAMP = `probe${Date.now()}`;
const adminApp = ia({ projectId: cfg.projectId }, STAMP);
const adminDb = gdb(adminApp);
const adminAuth = gAdminAuth(adminApp);

let failures = 0;
const check = (l, ok, d = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}${d ? `  - ${d}` : ''}`); if (!ok) failures++; };
const denied = async (label, fn) => {
  try { await fn(); check(label, false, 'was ALLOWED'); }
  catch (e) { check(label, String(e.code ?? '').includes('permission-denied'), e.code); }
};
/** Refused with this code AND this message: a refusal for some other reason is a failure. */
const refused = async (label, fn, codePart, messagePart) => {
  try { await fn(); check(label, false, 'was ALLOWED'); }
  catch (e) {
    const good = String(e.code ?? '').includes(codePart) && String(e.message ?? '').includes(messagePart);
    check(label, good, `${e.code}: ${e.message}`);
  }
};

const email = `${STAMP}@probe.invalid`;
const cred = await createUserWithEmailAndPassword(auth, email, 'Probe-Password-123!');
const UID = cred.user.uid;
// Verified, so createCardSaveSession gets past assertVerifiedEmail and is refused by the
// payments switch itself; the token must be refreshed to carry email_verified.
await adminAuth.updateUser(UID, { emailVerified: true });
const idToken = await cred.user.getIdToken(true);
{
  const claims = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString());
  console.log(`token: uid=${claims.user_id} email_verified=${claims.email_verified} provider=${claims.firebase?.sign_in_provider} aud=${claims.aud}`);
}
const PROJECT = `${STAMP}-proj`;
const KEY = `${PROJECT}_${UID}_1`;
const SECRET = `SECRET-TOKEN-${STAMP}`;

try {
  // Seed with the Admin SDK: a card, a fee with a charge attempt, an event, a fake ledger row.
  await adminDb.doc(`paymentMethods/${UID}`).set({
    provider: 'fake', token: SECRET, last4: '4242', brand: 'visa', expMonth: 1, expYear: 2030, status: 'active',
  });
  await adminDb.doc(`projects/${PROJECT}`).set({ clientId: 'someone-else', title: 'Probe', status: 'completed' });
  await adminDb.doc(`projects/${PROJECT}/fees/${UID}`).set({
    professionalId: UID, projectId: PROJECT, feeStatus: 'owed', feeDue: 6, status: 'pending', chargeState: 'idle',
  });
  await adminDb.doc(`projects/${PROJECT}/fees/${UID}/charges/${KEY}`).set({ idempotencyKey: KEY, amount: 6 });
  await adminDb.doc(`paymentEvents/${STAMP}`).set({ status: 'processed' });
  await adminDb.doc(`paymentFake/${KEY}`).set({ result: { outcome: 'succeeded' } });

  console.log('1. Closed to clients:');
  await denied('read own paymentMethods doc', () => getDoc(doc(db, `paymentMethods/${UID}`)));
  await denied('list paymentMethods', () => getDocs(collection(db, 'paymentMethods')));
  await denied('write own paymentMethods doc', () => setDoc(doc(db, `paymentMethods/${UID}`), { token: 'x' }));
  await denied('update paymentMethods status', () => updateDoc(doc(db, `paymentMethods/${UID}`), { status: 'active' }));
  await denied('delete paymentMethods doc', () => deleteDoc(doc(db, `paymentMethods/${UID}`)));
  await denied('read paymentEvents', () => getDoc(doc(db, `paymentEvents/${STAMP}`)));
  await denied('write paymentEvents', () => setDoc(doc(db, `paymentEvents/${STAMP}x`), { status: 'processed' }));
  await denied('read paymentFake', () => getDoc(doc(db, `paymentFake/${KEY}`)));
  await denied('read own fee charge attempt', () => getDoc(doc(db, `projects/${PROJECT}/fees/${UID}/charges/${KEY}`)));
  await denied('list own fee charges', () => getDocs(collection(db, `projects/${PROJECT}/fees/${UID}/charges`)));
  await denied('collectionGroup(charges)', () => getDocs(collectionGroup(db, 'charges')));
  await denied('write a charge attempt', () => setDoc(doc(db, `projects/${PROJECT}/fees/${UID}/charges/${KEY}x`), { amount: 1 }));
  await denied('mark own fee chargeState succeeded', () => updateDoc(doc(db, `projects/${PROJECT}/fees/${UID}`), { chargeState: 'succeeded' }));
  await denied('zero own feeDue', () => updateDoc(doc(db, `projects/${PROJECT}/fees/${UID}`), { feeDue: 0 }));
  await denied('read config/paymentsPrivate', () => getDoc(doc(db, 'config/paymentsPrivate')));

  console.log('\n2. What the app does read still works:');
  try { await getDoc(doc(db, 'config/pricing')); check('config/pricing getDoc (configService)', true); }
  catch (e) { check('config/pricing getDoc (configService)', false, e.code); }
  try {
    const own = await getDoc(doc(db, `projects/${PROJECT}/fees/${UID}`));
    check('own fee document read (listenToProjectFee)', own.exists());
  } catch (e) { check('own fee document read (listenToProjectFee)', false, e.code); }
  try {
    const snap = await getDocs(query(collectionGroup(db, 'fees'), where('professionalId', '==', UID)));
    check('fees collection-group query (listenToMyFees)', snap.size >= 1, `${snap.size} doc(s)`);
  } catch (e) { check('fees collection-group query (listenToMyFees)', false, e.code); }

  console.log('\n3. getMyPaymentMethod never leaks the token:');
  let view = null;
  try { view = await call('getMyPaymentMethod'); }
  catch (e) { check('getMyPaymentMethod call succeeds', false, `${e.code}: ${e.message} ${JSON.stringify(e.details ?? null)}`); }
  if (view) {
    check('response does not contain the token', !JSON.stringify(view).includes(SECRET), JSON.stringify(view));
    const allowed = new Set(['enabled', 'hasCard', 'last4', 'brand', 'expMonth', 'expYear', 'status']);
    check('only whitelisted keys', Object.keys(view).every((k) => allowed.has(k)), Object.keys(view).join(','));
    check('feature reads as OFF while paymentProvider is none', view.enabled === false && view.hasCard === false);
  }

  console.log('\n4. Callables refuse while payments are off:');
  await refused('createCardSaveSession (payments-disabled)', () => call('createCardSaveSession'), 'failed-precondition', 'payments-disabled');
  await refused('removeMyPaymentMethod (payments-disabled)', () => call('removeMyPaymentMethod'), 'failed-precondition', 'payments-disabled');
  await refused('fakeCompleteCardSave (fake-provider-inactive)', () => call('fakeCompleteCardSave', { token: 'tok_ok' }), 'failed-precondition', 'fake-provider-inactive');
  await refused('adminListChargeIssues as non-admin', () => call('adminListChargeIssues'), 'permission-denied', 'Admins only');
  await refused('adminAcknowledgeChargeIssue as non-admin', () => call('adminAcknowledgeChargeIssue', { projectId: PROJECT, professionalId: UID }), 'permission-denied', 'Admins only');
  const stored = (await adminDb.doc(`paymentMethods/${UID}`).get()).data();
  check('the stored card is untouched by the refused calls', stored?.token === SECRET);

  console.log('\n5. paymentWebhook:');
  if (process.env.PROBE_WEBHOOK !== '1') {
    console.log('  skip  paymentWebhook is held back from this deploy (set PROBE_WEBHOOK=1 once it ships)');
  } else {
    const url = `https://europe-west1-${cfg.projectId}.cloudfunctions.net/paymentWebhook`;
    const get = await fetch(url);
    check('GET -> 405', get.status === 405, String(get.status));
    const post = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ providerEventId: `${STAMP}-hook`, type: 'charge', idempotencyKey: KEY, outcome: 'succeeded' }) });
    const body = await post.text();
    check('junk POST answers with a generic body', post.status === 200 || post.status === 400, `${post.status} ${body}`);
    const fee = (await adminDb.doc(`projects/${PROJECT}/fees/${UID}`).get()).data();
    check('and moves nothing', fee?.chargeState === 'idle' && fee?.feePaid !== true, `chargeState=${fee?.chargeState}`);
    const ev = await adminDb.doc(`paymentEvents/${STAMP}-hook`).get();
    check('no event was recorded for it (provider is none)', !ev.exists, JSON.stringify(ev.data()));
  }
} finally {
  // onUserCreate writes users/<uid> a moment after sign-up: give it time, or the delete races it.
  await new Promise((r) => setTimeout(r, 4000));
  for (const p of [
    `paymentMethods/${UID}`, `paymentEvents/${STAMP}`, `paymentEvents/${STAMP}x`, `paymentEvents/${STAMP}-hook`, `paymentFake/${KEY}`, `users/${UID}`,
    `projects/${PROJECT}/fees/${UID}/charges/${KEY}`, `projects/${PROJECT}/fees/${UID}`, `projects/${PROJECT}`,
  ]) await adminDb.doc(p).delete().catch(() => {});
  await deleteUser(cred.user).catch(() => {});
  await signOut(auth).catch(() => {});
}
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
