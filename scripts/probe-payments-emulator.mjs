#!/usr/bin/env node
/**
 * Emulator tests for the fee-charging layer, against REAL Firestore transactions and
 * the REAL firestore.rules (the jest suites use an in-memory stand-in).
 *
 *   npm --prefix functions run build
 *   firebase emulators:start --only auth,firestore --project demo-bama   # ports below
 *   FS_PORT=8580 AUTH_PORT=9599 node scripts/probe-payments-emulator.mjs --emulator
 *
 * Isolated emulator only (project demo-bama, no import/export). Drives the compiled
 * functions/lib modules with the Admin SDK for the server logic, and the client SDK
 * for the rules.
 */
import './lib/requireEmulator.mjs'; // explicit --emulator required, no default target
import { createRequire } from 'node:module';
import { initializeApp } from 'firebase/app';
import {
  getFirestore, connectFirestoreEmulator, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  collection, collectionGroup, query, where,
} from 'firebase/firestore';
import {
  getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signOut,
} from 'firebase/auth';

const FS_PORT = process.env.FS_PORT ?? '8580';
const AUTH_PORT = process.env.AUTH_PORT ?? '9599';
process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${FS_PORT}`;
process.env.FIREBASE_AUTH_EMULATOR_HOST = `127.0.0.1:${AUTH_PORT}`;
process.env.GCLOUD_PROJECT = 'demo-bama';
delete process.env.FUNCTIONS_EMULATOR; // the fake provider must NOT get the emulator free pass

const require = createRequire(import.meta.url);
const lib = (p) => require(new URL(`../functions/lib/${p}`, import.meta.url).pathname);
const { db, Timestamp } = lib('lifecycle/helpers.js');
const { claimFeeForCharge, runCharge, applyChargeResult } = lib('payments/charge.js');
const { processWebhookEvent } = lib('payments/webhookCore.js');
const { savePaymentMethod } = lib('payments/paymentMethods.js');
const { runFeeChargeSweep } = lib('payments/feeChargeCron.js');
const { runStubChargeFor } = lib('lifecycle/charge.js');
const { __resetConfigCache } = lib('lifecycle/config.js');
const { __resetPaymentsConfigCache } = lib('payments/guard.js');

let failures = 0;
const results = [];
async function test(name, fn) {
  try { await fn(); results.push(['PASS', name]); console.log(`  PASS  ${name}`); }
  catch (e) { failures++; results.push(['FAIL', name, e.message]); console.log(`  FAIL  ${name}\n        ${e.message}`); }
}
const eq = (a, b, m = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c, m) => { if (!c) throw new Error(m); };

const NOW = Date.now();
const H = 3_600_000;
const config = { paymentProvider: 'fake', paymentTestUids: [], chargeMaxAttempts: 3, chargeRetryHours: 24 };
let n = 0;
async function seed({ fee = {}, card } = {}) {
  const tag = `t${Date.now()}${n++}`;
  const P = `proj${tag}`, U = `pro${tag}`;
  await db.doc(`projects/${P}`).set({ clientId: 'c', title: 'Probe', status: 'completed' });
  await db.doc(`projects/${P}/fees/${U}`).set({
    professionalId: U, projectId: P, feeStatus: 'owed', engagementStatus: 'completed', status: 'pending',
    feePaid: false, feeDue: 100, paidAmount: 0, baseAmount: 3334, feeRate: 0.03, slotActive: false,
    chargeDueAt: Timestamp.fromMillis(NOW - H), ...fee,
  });
  if (card) await db.doc(`paymentMethods/${U}`).set({ provider: 'fake', token: card, last4: '4242', brand: 'visa', expMonth: 1, expYear: 2031, status: 'active' });
  return { P, U, cfg: { ...config, paymentTestUids: [U] } };
}
const feeOf = async (P, U) => (await db.doc(`projects/${P}/fees/${U}`).get()).data();

console.log('\nServer logic (Admin SDK, real transactions):');

await test('parallel claims: exactly one of 12 wins', async () => {
  const { P, U } = await seed();
  const res = await Promise.all(Array.from({ length: 12 }, () => claimFeeForCharge(P, U, config, NOW)));
  eq(res.filter((r) => r.claimed).length, 1, 'winners');
  const fee = await feeOf(P, U);
  eq([fee.chargeState, fee.chargeAttempts], ['charging', 1]);
  const attempts = await db.collection(`projects/${P}/fees/${U}/charges`).get();
  eq(attempts.size, 1, 'attempt docs');
});

await test('parallel runCharge on one fee: charged and settled exactly once', async () => {
  const { P, U, cfg } = await seed({ card: 'tok_ok' });
  await Promise.all(Array.from({ length: 6 }, () => runCharge(P, U, cfg, NOW)));
  const fee = await feeOf(P, U);
  eq([fee.chargeState, fee.feePaid, fee.paidAmount, fee.feeDue, fee.chargeAttempts], ['succeeded', true, 100, 0, 1]);
  ok(!fee.chargeReview, 'no review flag');
});

await test('webhook replay: same event twice settles once', async () => {
  const { P, U, cfg } = await seed({ card: 'tok_pending' });
  eq((await runCharge(P, U, cfg, NOW)).status, 'pending');
  const key = `${P}_${U}_1`;
  const evt = { type: 'charge', providerEventId: `evt-${key}`, idempotencyKey: key, outcome: 'succeeded', providerRef: 'r1' };
  eq(await processWebhookEvent(evt, cfg, NOW), 'processed');
  eq(await processWebhookEvent(evt, cfg, NOW), 'duplicate');
  const fee = await feeOf(P, U);
  eq([fee.chargeState, fee.paidAmount, fee.providerRef], ['succeeded', 100, 'r1']);
});

await test('webhook, different event ids carrying the same success: still one settlement', async () => {
  const { P, U, cfg } = await seed({ card: 'tok_pending' });
  await runCharge(P, U, cfg, NOW);
  const key = `${P}_${U}_1`;
  await Promise.all(['a', 'b', 'c'].map((s) => processWebhookEvent(
    { type: 'charge', providerEventId: `evt-${key}-${s}`, idempotencyKey: key, outcome: 'succeeded', providerRef: 'r2' }, cfg, NOW)));
  const fee = await feeOf(P, U);
  eq([fee.paidAmount, fee.feeDue, fee.feePaid], [100, 0, true]);
  ok(!fee.chargeReview || fee.chargeReview.reason === 'settle_mismatch', 'at most a flagged duplicate, never a double balance');
  ok(fee.paidAmount === 100, 'paidAmount not doubled');
});

await test('webhook out of order: failure after success does not move the fee back', async () => {
  const { P, U, cfg } = await seed({ card: 'tok_pending' });
  await runCharge(P, U, cfg, NOW);
  const key = `${P}_${U}_1`;
  await processWebhookEvent({ type: 'charge', providerEventId: `e1-${key}`, idempotencyKey: key, outcome: 'succeeded', providerRef: 'r3' }, cfg, NOW);
  await processWebhookEvent({ type: 'charge', providerEventId: `e2-${key}`, idempotencyKey: key, outcome: 'failed', failureClass: 'final', failureCode: 'late' }, cfg, NOW);
  const fee = await feeOf(P, U);
  eq([fee.chargeState, fee.feePaid], ['succeeded', true]);
  eq((await db.doc(`paymentMethods/${U}`).get()).data().status, 'active');
});

await test('webhook out of order: success after a recorded failure still settles', async () => {
  const { P, U, cfg } = await seed({ card: 'tok_pending' });
  await runCharge(P, U, cfg, NOW);
  const key = `${P}_${U}_1`;
  await processWebhookEvent({ type: 'charge', providerEventId: `f1-${key}`, idempotencyKey: key, outcome: 'failed', failureClass: 'retryable', failureCode: 'x' }, cfg, NOW);
  eq((await feeOf(P, U)).chargeState, 'failed');
  await processWebhookEvent({ type: 'charge', providerEventId: `f2-${key}`, idempotencyKey: key, outcome: 'succeeded', providerRef: 'r4' }, cfg, NOW);
  const fee = await feeOf(P, U);
  eq([fee.chargeState, fee.feePaid, fee.paidAmount], ['succeeded', true, 100]);
});

await test('needs_card: dead card parks the fee, a new card re-queues it, the next sweep charges it', async () => {
  const { P, U, cfg } = await seed({ card: 'tok_dead' });
  await runCharge(P, U, cfg, NOW);
  let fee = await feeOf(P, U);
  eq(fee.chargeState, 'needs_card');
  eq((await db.doc(`paymentMethods/${U}`).get()).data().status, 'invalid');
  eq((await runCharge(P, U, cfg, NOW + H)).status, 'skipped');
  await savePaymentMethod(U, 'fake', { token: 'tok_ok', last4: '1111', brand: 'visa', expMonth: 1, expYear: 2032 });
  fee = await feeOf(P, U);
  eq(fee.chargeState, 'idle');
  eq((await runCharge(P, U, cfg, NOW + 2 * H)).status, 'succeeded');
  eq((await feeOf(P, U)).feePaid, true);
});

await test('no card at due time: needs_card, no attempt spent', async () => {
  const { P, U, cfg } = await seed();
  eq((await runCharge(P, U, cfg, NOW)).status, 'needs_card');
  const fee = await feeOf(P, U);
  eq([fee.chargeState, fee.chargeAttempts ?? 0], ['needs_card', 0]);
});

await test("'none' parity: the new sweep does nothing; the old stub path behaves as before", async () => {
  const { P, U } = await seed();
  const none = { ...config, paymentProvider: 'none' };
  const tally = await runFeeChargeSweep(NOW, none);
  eq(tally, { tried: 0, stub: 0, reconciled: 0, errors: 0 });
  eq((await runCharge(P, U, none, NOW)).status, 'no-provider');
  let fee = await feeOf(P, U);
  ok(fee.chargeState === undefined && fee.chargeAttempts === undefined, 'new fields untouched');
  // Today's stub, as lifecycleCron sweep 6 calls it under 'none'.
  await runStubChargeFor(P, U, fee);
  fee = await feeOf(P, U);
  eq([fee.chargeAttemptCount, fee.wouldFailCount, fee.lastChargeAttempt.outcome], [1, 1, 'would_fail_no_card']);
  eq(fee.feePaid, false);
  const notes = await db.collection('notifications').where('userId', '==', U).get();
  eq(notes.docs.map((d) => d.data().data.type), ['charge_failed']);
  await runStubChargeFor(P, U, fee); // already attempted -> no-op
  eq((await feeOf(P, U)).chargeAttemptCount, 1);
});

await test("fake provider for a non-tester is treated as 'none' (never settles)", async () => {
  const { P, U } = await seed({ card: 'tok_ok' });
  const res = await runCharge(P, U, { ...config, paymentTestUids: ['someone-else'] }, NOW);
  eq(res.status, 'no-provider');
  eq((await feeOf(P, U)).feePaid, false);
});

console.log('\nRules (client SDK against the real firestore.rules):');
const app = initializeApp({ apiKey: 'k', projectId: 'demo-bama' }, 'pay-rules');
const cdb = getFirestore(app); connectFirestoreEmulator(cdb, '127.0.0.1', Number(FS_PORT));
const auth = getAuth(app); connectAuthEmulator(auth, `http://127.0.0.1:${AUTH_PORT}`, { disableWarnings: true });
const { P, U } = await seed({ card: 'tok_ok' });
const KEY = `${P}_${U}_1`;
await db.doc(`projects/${P}/fees/${U}/charges/${KEY}`).set({ amount: 100 });
await db.doc(`paymentEvents/e-${KEY}`).set({ status: 'processed' });
await db.doc(`paymentFake/${KEY}`).set({ result: { outcome: 'succeeded' } });
await db.doc('config/paymentsPrivate').set({ paymentTestUids: ['x'] });
await db.doc('config/pricing').set({ feePercent: 3 });
// Sign in AS the professional who owns the fee: the strongest case for "owner can't touch it".
const stamp = Date.now();
const cred = await createUserWithEmailAndPassword(auth, `pro${stamp}@probe.invalid`, 'pw123456');
const MY = cred.user.uid;
await db.doc(`projects/${P}/fees/${MY}`).set({ professionalId: MY, projectId: P, feeStatus: 'owed', feeDue: 6, chargeState: 'idle' });
await db.doc(`projects/${P}/fees/${MY}/charges/${P}_${MY}_1`).set({ amount: 6 });
await db.doc(`paymentMethods/${MY}`).set({ token: 'SECRET', status: 'active' });

const denied = (name, fn) => test(`denied: ${name}`, async () => {
  try { await fn(); } catch (e) { if (String(e.code).includes('permission-denied')) return; throw new Error(`wrong error ${e.code}`); }
  throw new Error('was ALLOWED');
});
await denied('read own paymentMethods', () => getDoc(doc(cdb, `paymentMethods/${MY}`)));
await denied('list paymentMethods', () => getDocs(collection(cdb, 'paymentMethods')));
await denied('write own paymentMethods', () => setDoc(doc(cdb, `paymentMethods/${MY}`), { token: 'x' }));
await denied('delete own paymentMethods', () => deleteDoc(doc(cdb, `paymentMethods/${MY}`)));
await denied('read paymentEvents', () => getDoc(doc(cdb, `paymentEvents/e-${KEY}`)));
await denied('write paymentEvents', () => setDoc(doc(cdb, 'paymentEvents/new'), { status: 'processed' }));
await denied('read paymentFake', () => getDoc(doc(cdb, `paymentFake/${KEY}`)));
await denied('read own fee charge attempt', () => getDoc(doc(cdb, `projects/${P}/fees/${MY}/charges/${P}_${MY}_1`)));
await denied('write a charge attempt', () => setDoc(doc(cdb, `projects/${P}/fees/${MY}/charges/new`), { amount: 1 }));
await denied('collectionGroup(charges)', () => getDocs(collectionGroup(cdb, 'charges')));
await denied('set own chargeState succeeded', () => updateDoc(doc(cdb, `projects/${P}/fees/${MY}`), { chargeState: 'succeeded' }));
await denied('zero own feeDue', () => updateDoc(doc(cdb, `projects/${P}/fees/${MY}`), { feeDue: 0 }));
await denied('read config/paymentsPrivate', () => getDoc(doc(cdb, 'config/paymentsPrivate')));
await test('still allowed: config/pricing getDoc', async () => { ok((await getDoc(doc(cdb, 'config/pricing'))).exists(), 'missing'); });
await test('still allowed: own fee document read', async () => { ok((await getDoc(doc(cdb, `projects/${P}/fees/${MY}`))).exists(), 'missing'); });
await test('still allowed: fees collection-group query for own uid (listenToMyFees)', async () => {
  const snap = await getDocs(query(collectionGroup(cdb, 'fees'), where('professionalId', '==', MY)));
  ok(snap.size === 1, `got ${snap.size}`);
});
await signOut(auth);

const pass = results.filter((r) => r[0] === 'PASS').length;
console.log(`\n${pass} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
