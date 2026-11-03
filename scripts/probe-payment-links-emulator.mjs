#!/usr/bin/env node
/**
 * Emulator tests for payment-link mode (grow_link / fake_link), against REAL
 * Firestore transactions, the REAL settleFee and the REAL firestore.rules.
 *
 *   npm --prefix functions run build
 *   firebase emulators:start --only auth,firestore --project demo-bama   # ports below
 *   FS_PORT=8580 AUTH_PORT=9599 node scripts/probe-payment-links-emulator.mjs --emulator
 *
 * Covers: claim race -> one link; payment replay; wrong amount; feeKey/processId
 * mismatch; payment on a superseded / voided / already-settled fee; testers-only
 * guard; 'none' and token-mode parity; and the HTTP endpoint (secret, method, body).
 * The successUrl page is static and cannot reach the server: see
 * scripts/__tests__/payReturn.test.mjs.
 */
import './lib/requireEmulator.mjs'; // explicit --emulator required, no default target
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { initializeApp } from 'firebase/app';
import {
  getFirestore, connectFirestoreEmulator, doc, getDoc, getDocs, setDoc, updateDoc,
  collection, collectionGroup, query, where,
} from 'firebase/firestore';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signOut } from 'firebase/auth';

const FS_PORT = process.env.FS_PORT ?? '8580';
const AUTH_PORT = process.env.AUTH_PORT ?? '9599';
process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${FS_PORT}`;
process.env.FIREBASE_AUTH_EMULATOR_HOST = `127.0.0.1:${AUTH_PORT}`;
process.env.GCLOUD_PROJECT = 'demo-bama';
delete process.env.FUNCTIONS_EMULATOR; // fake providers must NOT get the emulator free pass
const SECRET = 'probe-secret-value';
process.env.MAKE_SHARED_SECRET = SECRET;   // what defineSecret().value() reads outside a deploy

const require = createRequire(import.meta.url);
const lib = (p) => require(new URL(`../functions/lib/${p}`, import.meta.url).pathname);
const { db, Timestamp } = lib('lifecycle/helpers.js');
const { runFeeChargeSweep } = lib('payments/feeChargeCron.js');
const { runLinkIssue } = lib('payments/link.js');
const { processWebhookEvent } = lib('payments/webhookCore.js');
const { parseLinkPayment } = lib('payments/linkConfirm.js');
const { paymentLinkConfirm } = lib('payments/paymentLinkConfirm.js');
const { recomputeFeeBlock } = lib('lifecycle/feeOverdue.js');

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
const base = { paymentProvider: 'fake_link', paymentTestUids: [], paymentLinkAudience: 'testers', chargeMaxAttempts: 3, chargeRetryHours: 24 };
let n = 0;
async function seed({ fee = {}, phone = '+972501234567' } = {}) {
  const tag = `t${Date.now()}${n++}`;
  const P = `proj${tag}`, U = `pro${tag}`;
  await db.doc(`projects/${P}`).set({ clientId: 'c', title: 'Probe', status: 'completed' });
  await db.doc(`projects/${P}/fees/${U}`).set({
    professionalId: U, projectId: P, feeStatus: 'owed', engagementStatus: 'completed', status: 'pending',
    feePaid: false, feeDue: 100, paidAmount: 0, baseAmount: 3334, feeRate: 0.03, slotActive: false,
    chargeDueAt: Timestamp.fromMillis(NOW - H), ...fee,
  });
  await db.doc(`users/${U}`).set({ displayName: 'Probe Pro' });
  if (phone) await db.doc(`users/${U}/private/contact`).set({ phone });
  return { P, U, cfg: { ...base, paymentTestUids: [U] } };
}
const feeOf = async (P, U) => (await db.doc(`projects/${P}/fees/${U}`).get()).data();
const pay = (L, over = {}) => parseLinkPayment({
  paymentLinkProcessId: L.processId, feeKey: `${L.P}_${L.U}`, amount: L.amount, transactionId: `tx${Date.now()}${n++}`,
  asmachta: '1', status: 'paid', ...over,
});
async function linked(opts) {
  const s = await seed(opts);
  const r = await runLinkIssue(s.P, s.U, s.cfg, NOW);
  ok(r.status === 'created', `link not created: ${JSON.stringify(r)}`);
  const f = await feeOf(s.P, s.U);
  return { ...s, processId: f.paymentLink.processId, amount: f.paymentLink.amount };
}

console.log('\nLink issuing (real transactions):');

await test('claim race: 12 parallel runs create exactly one link and one pointer', async () => {
  const { P, U, cfg } = await seed();
  const res = await Promise.all(Array.from({ length: 12 }, () => runLinkIssue(P, U, cfg, NOW)));
  eq(res.filter((r) => r.status === 'created').length, 1, 'created');
  const fee = await feeOf(P, U);
  eq([fee.chargeState, fee.paymentLink.amount], ['awaiting_payment', 100]);
  ok(!fee.paymentLinkClaim, 'claim cleared');
  const ptr = await db.doc(`paymentLinks/${fee.paymentLink.processId}`).get();
  ok(ptr.exists, 'pointer written');
  eq([ptr.data().projectId, ptr.data().proId, ptr.data().amount], [P, U, 100]);
});

await test('the sweep (cron body) creates a link for a tester and skips a non-tester', async () => {
  const a = await seed(); const b = await seed();
  const cfg = { ...base, paymentTestUids: [a.U] };
  await runFeeChargeSweep(NOW, cfg);
  eq((await feeOf(a.P, a.U)).chargeState, 'awaiting_payment');
  const nb = await feeOf(b.P, b.U);
  ok(!nb.chargeState && !nb.paymentLink && !nb.paymentLinkClaim, 'non-tester untouched');
});

await test("provider 'none' parity: the sweep does nothing at all", async () => {
  const { P, U } = await seed();
  const t = await runFeeChargeSweep(NOW, { ...base, paymentProvider: 'none', paymentTestUids: [U] });
  eq(t, { tried: 0, stub: 0, reconciled: 0, errors: 0 });
  ok(!(await feeOf(P, U)).chargeState, 'untouched');
});

await test('token mode parity: fake provider still charges a card and makes no link', async () => {
  const { P, U } = await seed();
  await db.doc(`paymentMethods/${U}`).set({ provider: 'fake', token: 'tok_ok', last4: '4242', brand: 'visa', expMonth: 1, expYear: 2031, status: 'active' });
  await runFeeChargeSweep(NOW, { ...base, paymentProvider: 'fake', paymentTestUids: [U] });
  const fee = await feeOf(P, U);
  eq([fee.chargeState, fee.feePaid, fee.paidAmount], ['succeeded', true, 100]);
  ok(!fee.paymentLink, 'no link in token mode');
});

await test('no mobile number: needs_phone, then a link once a phone exists', async () => {
  const { P, U, cfg } = await seed({ phone: null });
  eq((await runLinkIssue(P, U, cfg, NOW)).status, 'needs_phone');
  let fee = await feeOf(P, U);
  eq(fee.chargeState, 'needs_phone'); ok(fee.needsPhoneNotifiedAt, 'push marker set');
  eq((await runLinkIssue(P, U, cfg, NOW + H)).status, 'needs_phone');
  await db.doc(`users/${U}/private/contact`).set({ phone: '+972541234567' });
  eq((await runLinkIssue(P, U, cfg, NOW + 2 * H)).status, 'created');
  fee = await feeOf(P, U);
  eq(fee.chargeState, 'awaiting_payment');
});

await test('a landline is not a mobile: needs_phone', async () => {
  const { P, U, cfg } = await seed({ phone: '+97231234567' });
  eq((await runLinkIssue(P, U, cfg, NOW)).status, 'needs_phone');
});

console.log('\nInbound payments (real settleFee):');

await test('a matching payment settles the fee exactly once; its replay is a duplicate', async () => {
  const L = await linked();
  const ev = pay(L);
  eq(await processWebhookEvent(ev, L.cfg, NOW), 'settled');
  eq(await processWebhookEvent(ev, L.cfg, NOW), 'duplicate');
  const fee = await feeOf(L.P, L.U);
  eq([fee.feePaid, fee.paidAmount, fee.feeDue, fee.paidBy, fee.chargeState, fee.providerRef], [true, 100, 0, 'link', 'succeeded', ev.transactionId]);
});

await test('two different notifications for one link: second is flagged, balance not doubled', async () => {
  const L = await linked();
  eq(await processWebhookEvent(pay(L), L.cfg, NOW), 'settled');
  eq(await processWebhookEvent(pay(L), L.cfg, NOW), 'needs_review');
  const fee = await feeOf(L.P, L.U);
  eq([fee.paidAmount, fee.feeDue], [100, 0]);
  eq(fee.linkReview.reason, 'link_after_settled'); ok(fee.chargeNeedsAdmin === true, 'on the admin list');
});

await test('parallel notifications for one transaction settle once', async () => {
  const L = await linked();
  const ev = pay(L);
  const r = await Promise.all(Array.from({ length: 6 }, () => processWebhookEvent(ev, L.cfg, NOW).catch((e) => `err:${e.message}`)));
  const fee = await feeOf(L.P, L.U);
  eq([fee.paidAmount, fee.feePaid], [100, true]);
  ok(r.filter((x) => x === 'settled').length >= 1, `outcomes ${r}`);
});

await test('wrong amount: nothing recorded, flagged link_amount_mismatch', async () => {
  const L = await linked();
  eq(await processWebhookEvent(pay(L, { amount: 90 }), L.cfg, NOW), 'needs_review');
  const fee = await feeOf(L.P, L.U);
  eq([fee.feePaid, fee.paidAmount, fee.linkReview.reason], [false, 0, 'link_amount_mismatch']);
});

await test('feeKey disagrees with the processId: nothing recorded', async () => {
  const L = await linked();
  eq(await processWebhookEvent(pay(L, { feeKey: 'other_pro' }), L.cfg, NOW), 'needs_review');
  const fee = await feeOf(L.P, L.U);
  eq([fee.feePaid, fee.linkReview.reason], [false, 'link_key_mismatch']);
});

await test('payment on a superseded link: feeDue moved, the sweep replaced the link, the old one settles nothing', async () => {
  const L = await linked();
  await db.doc(`projects/${L.P}/fees/${L.U}`).update({ feeDue: 60 });
  await runLinkIssue(L.P, L.U, L.cfg, NOW + H);
  const fee = await feeOf(L.P, L.U);
  ok(fee.paymentLink.processId !== L.processId && fee.paymentLink.amount === 60, 'new link for 60');
  ok((await db.doc(`paymentLinks/${L.processId}`).get()).data().supersededAt, 'old pointer superseded');
  eq(await processWebhookEvent(pay(L), L.cfg, NOW), 'needs_review');
  const after = await feeOf(L.P, L.U);
  eq([after.feePaid, after.paidAmount, after.linkReview.reason], [false, 0, 'link_superseded']);
  // ...and the NEW link still settles for what is owed now.
  eq(await processWebhookEvent(pay({ ...L, processId: fee.paymentLink.processId, amount: 60 }), L.cfg, NOW), 'settled');
});

await test('payment while feeDue moved but before the sweep: settleFee refuses, flagged, not recorded', async () => {
  const L = await linked();
  await db.doc(`projects/${L.P}/fees/${L.U}`).update({ feeDue: 60 });
  eq(await processWebhookEvent(pay(L), L.cfg, NOW), 'needs_review');
  const fee = await feeOf(L.P, L.U);
  eq([fee.feePaid, fee.paidAmount], [false, 0]);
  ok(fee.linkReview, 'flagged');
});

await test('payment on a voided fee: nothing recorded, flagged', async () => {
  const L = await linked();
  await db.doc(`projects/${L.P}/fees/${L.U}`).update({ feeDue: 0, status: 'not_owed' });
  eq(await processWebhookEvent(pay(L), L.cfg, NOW), 'needs_review');
  const fee = await feeOf(L.P, L.U);
  eq([fee.feePaid, fee.paidAmount, fee.linkReview.reason], [false, 0, 'link_superseded']);
});

await test('payment on a fee an admin already settled: flagged, balance untouched', async () => {
  const L = await linked();
  await db.doc(`projects/${L.P}/fees/${L.U}`).update({ feePaid: true, status: 'paid', feeDue: 0, paidBy: 'admin' });
  eq(await processWebhookEvent(pay(L), L.cfg, NOW), 'needs_review');
  const fee = await feeOf(L.P, L.U);
  eq([fee.paidBy, fee.linkReview.reason], ['admin', 'link_after_settled']);
});

await test('unknown processId: recorded in paymentLinkIssues, no fee touched', async () => {
  const L = await linked();
  const ev = pay({ ...L, processId: 'NOPE' }, { transactionId: `orphan${Date.now()}${n++}` });
  eq(await processWebhookEvent(ev, L.cfg, NOW), 'needs_review');
  const issue = await db.doc(`paymentLinkIssues/${ev.transactionId}`).get();
  ok(issue.exists && issue.data().reason === 'link_unmatched', 'issue recorded');
  ok(!(await feeOf(L.P, L.U)).feePaid, 'fee untouched');
});

console.log('\nFee block (settleFee -> recomputeFeeBlock):');

const blockedFrom = async (U) => (await db.doc(`feeBlocks/${U}`).get()).data()?.blockedFrom?.toMillis?.() ?? null;
const overdue = { overdueAt: Timestamp.fromMillis(NOW - 5 * H) };

await test('an overdue fee blocks; paying its link lifts the block in the same step', async () => {
  const L = await linked({ fee: overdue });
  await recomputeFeeBlock(L.U);                       // what the fee trigger does
  ok((await blockedFrom(L.U)) !== null, 'the overdue fee blocks before payment');
  eq(await processWebhookEvent(pay(L), L.cfg, NOW), 'settled');
  eq(await blockedFrom(L.U), null, 'blockedFrom after paying');
});

await test('a payment that is NOT applied (wrong amount) leaves the block in place', async () => {
  const L = await linked({ fee: overdue });
  await recomputeFeeBlock(L.U);
  const before = await blockedFrom(L.U);
  ok(before !== null, 'blocked');
  eq(await processWebhookEvent(pay(L, { amount: 90 }), L.cfg, NOW), 'needs_review');
  eq(await blockedFrom(L.U), before, 'block unchanged');
});

await test('opening the pay page changes nothing: creating a link does not touch the block', async () => {
  const { P, U, cfg } = await seed({ fee: overdue });
  await recomputeFeeBlock(U);
  const before = await blockedFrom(U);
  await runLinkIssue(P, U, cfg, NOW);
  eq(await blockedFrom(U), before, 'block after link creation');
});

console.log('\nHTTP endpoint (handler invoked directly, secret from env):');

function call(method, headers, body) {
  return new Promise((resolve, reject) => {
    const out = { status: 200, body: undefined, headers: {} };
    const res = Object.assign(new EventEmitter(), {
      set(k, v) { out.headers[String(k).toLowerCase()] = v; return res; },
      status(c) { out.status = c; return res; },
      json(b) { out.body = b; resolve(out); return res; },
      send(b) { out.body = b; resolve(out); return res; },
      end() { resolve(out); return res; },
      setHeader(k, v) { out.headers[String(k).toLowerCase()] = v; },
      getHeader(k) { return out.headers[String(k).toLowerCase()]; },
    });
    const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    const req = Object.assign(new EventEmitter(), { method, headers: lower, body, ip: '203.0.113.9', get: (h) => lower[h.toLowerCase()], rawBody: Buffer.from(JSON.stringify(body ?? {})) });
    Promise.resolve(paymentLinkConfirm(req, res)).catch(reject);
    setTimeout(() => reject(new Error('handler did not respond')), 8000);
  });
}
const eventsBefore = async () => (await db.collection('paymentEvents').get()).size;

await test('missing secret: 401, nothing written', async () => {
  const L = await linked(); const before = await eventsBefore();
  const r = await call('POST', {}, { paymentLinkProcessId: L.processId, amount: 100, transactionId: 'x1' });
  eq(r.status, 401);
  eq(await eventsBefore(), before, 'paymentEvents');
  ok(!(await feeOf(L.P, L.U)).feePaid, 'unsettled');
});
await test('wrong secret: 401 with no detail, nothing written', async () => {
  const L = await linked(); const before = await eventsBefore();
  const r = await call('POST', { 'X-Bama-Secret': SECRET + 'x' }, { paymentLinkProcessId: L.processId, amount: 100, transactionId: 'x2' });
  eq([r.status, r.body], [401, { ok: false }]);
  eq(await eventsBefore(), before, 'paymentEvents');
});
await test('GET is 405 even with the right secret', async () => {
  eq((await call('GET', { 'X-Bama-Secret': SECRET }, undefined)).status, 405);
});
await test('right secret, malformed body: 400', async () => {
  eq((await call('POST', { 'X-Bama-Secret': SECRET }, { amount: 'ten' })).status, 400);
});
await test('right secret, good body: 200 settled; replay: 200 duplicate', async () => {
  const L = await linked();
  const body = { paymentLinkProcessId: L.processId, feeKey: `${L.P}_${L.U}`, amount: 100, transactionId: `h${Date.now()}${n++}`, asmachta: '7', status: 'paid' };
  const a = await call('POST', { 'X-Bama-Secret': SECRET }, body);
  eq([a.status, a.body], [200, { ok: true, result: 'settled' }]);
  const b = await call('POST', { 'X-Bama-Secret': SECRET }, body);
  eq([b.status, b.body], [200, { ok: true, result: 'duplicate' }]);
  eq((await feeOf(L.P, L.U)).paidAmount, 100);
});

console.log('\nRules (client SDK against the real firestore.rules):');
const app = initializeApp({ apiKey: 'k', projectId: 'demo-bama' }, 'link-rules');
const cdb = getFirestore(app); connectFirestoreEmulator(cdb, '127.0.0.1', Number(FS_PORT));
const auth = getAuth(app); connectAuthEmulator(auth, `http://127.0.0.1:${AUTH_PORT}`, { disableWarnings: true });
const cred = await createUserWithEmailAndPassword(auth, `pro${Date.now()}@probe.invalid`, 'pw123456');
const MY = cred.user.uid;
const RP = `rules${Date.now()}`;
await db.doc(`projects/${RP}/fees/${MY}`).set({
  professionalId: MY, projectId: RP, feeStatus: 'owed', feeDue: 50, chargeState: 'awaiting_payment',
  paymentLink: { url: 'https://pay.example/x', processId: 'RL1', amount: 50 },
});
await db.doc('paymentLinks/RL1').set({ projectId: RP, proId: MY, amount: 50 });
await db.doc('paymentLinkIssues/RT1').set({ reason: 'link_unmatched' });
const denied = (name, fn) => test(`denied: ${name}`, async () => {
  try { await fn(); } catch (e) { if (String(e.code).includes('permission-denied')) return; throw new Error(`wrong error ${e.code}`); }
  throw new Error('was ALLOWED');
});
await denied('read paymentLinks/RL1', () => getDoc(doc(cdb, 'paymentLinks/RL1')));
await denied('list paymentLinks', () => getDocs(collection(cdb, 'paymentLinks')));
await denied('write paymentLinks', () => setDoc(doc(cdb, 'paymentLinks/mine'), { projectId: RP, proId: MY, amount: 1 }));
await denied('read paymentLinkIssues', () => getDoc(doc(cdb, 'paymentLinkIssues/RT1')));
await denied('forge own paymentLink amount', () => updateDoc(doc(cdb, `projects/${RP}/fees/${MY}`), { 'paymentLink.amount': 1 }));
await denied('forge own chargeState', () => updateDoc(doc(cdb, `projects/${RP}/fees/${MY}`), { chargeState: 'succeeded' }));
await denied('forge own linkReview', () => updateDoc(doc(cdb, `projects/${RP}/fees/${MY}`), { linkReview: null }));
await test('allowed: own fee read carries the link for the Pay now button', async () => {
  const d = await getDoc(doc(cdb, `projects/${RP}/fees/${MY}`));
  eq(d.data().paymentLink.url, 'https://pay.example/x');
});
await test('allowed: listenToMyFees query for own uid', async () => {
  const snap = await getDocs(query(collectionGroup(cdb, 'fees'), where('professionalId', '==', MY)));
  eq(snap.size, 1);
});
await signOut(auth);

const pass = results.filter((r) => r[0] === 'PASS').length;
console.log(`\n${pass} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
