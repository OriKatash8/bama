#!/usr/bin/env node
/**
 * THIRD and last production run for anomaly F1 of probe1790908193020 (the first
 * price offer after the switch flipped ON was ALLOWED).
 *
 * Replays that run's exact sequence on ONE client SDK instance:
 *   seed overdue fee → wait for feeBlocks → as(pro): offer P_OFF, offer P_ON,
 *   bundle P_OFF, application P_OFF → as(client): hireProfessional(P_OFF offer)
 *   → FLIP ON → as(pro): offer P_ON Colorist, bundle, application, edit, read …
 *
 * Around EVERY attempt the Admin SDK reads and logs feeBlocks/{pro},
 * feeOverdueBlockEnabled and a timestamp. The switch write's commit time
 * (WriteResult.writeTime) is logged, and any offer ALLOWED while the switch is
 * ON is read back with its server createTime and KEPT — teardown turns the switch
 * off and deletes the accounts only. Run probe-fee-overdue-sweep-prod.mjs after
 * inspecting.
 *
 * The switch is ON for ~10 s (a hard timer forces it OFF at 30 s). Refuses within
 * 15 min of 03:00 Israel time or 5 min of the top of the hour.
 *
 *   node scripts/probe-fee-overdue-replay-prod.mjs [--run-file <path>]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import {
  getFirestore, doc, getDoc, updateDoc, collection, addDoc, serverTimestamp,
} from 'firebase/firestore';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';

{
  const il = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const mins = il.getHours() * 60 + il.getMinutes();
  if (Math.abs(mins - 180) <= 15 || il.getMinutes() >= 55 || il.getMinutes() <= 5) {
    console.error(`ABORT: Israel time ${il.toTimeString().slice(0, 5)} is too close to a scheduled job.`);
    process.exit(1);
  }
}
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

const STAMP = `probe${Date.now()}`;
const runFileArg = process.argv.indexOf('--run-file');
const RUN_FILE = runFileArg > -1 ? process.argv[runFileArg + 1] : null;
const accounts = {};
const recordRun = () => RUN_FILE && writeFileSync(RUN_FILE, JSON.stringify({
  stamp: STAMP, uids: Object.fromEntries(Object.entries(accounts).map(([t, a]) => [t, a.uid])),
}, null, 2));

// ONE instance, exactly as the first run.
const app = initializeApp(cfg, STAMP);
const db = getFirestore(app), auth = getAuth(app);
const fns = getFunctions(app);

const { initializeApp: ia } = await import('firebase-admin/app');
const { getFirestore: gdb, Timestamp } = await import('firebase-admin/firestore');
const { getAuth: ga } = await import('firebase-admin/auth');
const adminApp = ia({ projectId: cfg.projectId }, STAMP);
const adminDb = gdb(adminApp), adminAuth = ga(adminApp);
const configRef = adminDb.doc('config/pricing');

let flipAt = null;        // client clock, after the Admin write resolved
let flipWriteTime = null; // server commit time of the switch write
const ts = () => `${new Date().toISOString()}${flipAt ? ` (+${String(Date.now() - flipAt).padStart(5)}ms)` : '            '}`;
const log = (m) => console.log(`${ts()}  ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(`\nproject: ${cfg.projectId} (LIVE)   STAMP=${STAMP}\n`);
const original = (await configRef.get()).get('feeOverdueBlockEnabled');
if (original === true) { console.error('ABORT: the switch is already ON.'); process.exit(1); }
log(`kill switch before: ${JSON.stringify(original ?? null)}`);
recordRun();

const PW = 'Probe-Password-123!';
const email = (tag) => `${STAMP}.${tag}@bama-invalid.test`;
async function mk(tag) {
  const c = await createUserWithEmailAndPassword(auth, email(tag), PW);
  accounts[tag] = { uid: c.user.uid };
  recordRun();
  await signOut(auth);
  return c.user.uid;
}
/** The first run's as(), verbatim. */
async function as(tag) {
  await signOut(auth).catch(() => {});
  await signInWithEmailAndPassword(auth, email(tag), PW);
  await auth.currentUser.getIdToken(true);
}

let PRO, CLIENT;
async function server(tagline) {
  const [fb, cf] = await Promise.all([adminDb.doc(`feeBlocks/${PRO}`).get(), configRef.get()]);
  const bf = fb.exists ? (fb.get('blockedFrom') ? fb.get('blockedFrom').toDate().toISOString() : 'null') : 'MISSING';
  const upd = fb.exists ? fb.updateTime.toDate().toISOString() : '—';
  log(`   admin ${tagline}: feeBlocks.blockedFrom=${bf} (doc updateTime ${upd})  switch=${JSON.stringify(cf.get('feeOverdueBlockEnabled') ?? null)}  client auth=${auth.currentUser?.uid === PRO ? 'pro' : auth.currentUser?.uid === CLIENT ? 'client' : (auth.currentUser?.uid ?? 'none')}`);
}
const results = [];
/** Admin read → client action → Admin read. */
async function step(label, fn, want) {
  await server(`before ${label}`);
  let got, ref;
  try { ref = await fn(); got = 'ALLOW'; } catch (e) { got = e?.code === 'permission-denied' ? 'DENY' : `ERR ${e?.code ?? e}`; }
  log(`${label} → ${got}${want ? `  (want ${want})` : ''}`);
  await server(`after  ${label}`);
  results.push({ label, got, want, ref, sinceFlip: flipAt ? Date.now() - flipAt : null });
  return ref;
}

const sendOffer = (projectId, category, price = 1000) => addDoc(collection(db, 'priceOffers'), {
  projectId, professionalId: PRO, category, price, status: 'pending', createdAt: serverTimestamp(),
});
const sendBundle = (projectId) => addDoc(collection(db, 'bundleOffers'), {
  projectId, professionalId: PRO, slots: [{ category: 'Editor' }, { category: 'Colorist' }],
  individualTotal: 2000, bundlePrice: 1800, offerIds: ['x', 'y'], status: 'pending',
  createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
});
const sendApplication = (projectId) => addDoc(collection(db, 'projectApplications'), {
  projectId, professionalId: PRO, status: 'pending',
  createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
});

let failures = 0;
let tornDown = false;
async function setOff(why) {
  await configRef.set({ feeOverdueBlockEnabled: false }, { merge: true });
  log(`switch OFF (${why}) → ${JSON.stringify((await configRef.get()).get('feeOverdueBlockEnabled'))}`);
}
async function teardown() {
  if (tornDown) return;
  tornDown = true;
  console.log('\nTeardown (switch + accounts only; docs KEPT for inspection, then run the sweep):');
  try { await setOff('teardown'); } catch (e) { console.error('SWITCH RESTORE FAILED', e); failures++; }
  await signOut(auth).catch(() => {});
  for (const [tag, a] of Object.entries(accounts)) {
    try { await adminAuth.deleteUser(a.uid); log(`deleted account ${tag}`); }
    catch (e) { if (e?.code !== 'auth/user-not-found') { console.error('delete', tag, e?.code); failures++; } }
  }
}
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, async () => { failures++; await teardown().catch(() => {}); process.exit(1); });
process.on('uncaughtException', async (e) => { console.error(e); failures++; await teardown().catch(() => {}); process.exit(1); });

const P_OFF = `${STAMP}-off`, P_ON = `${STAMP}-on`, P_DEBT = `${STAMP}-debt`;
try {
  PRO = await mk('pro');
  CLIENT = await mk('client');
  log(`pro=${PRO} client=${CLIENT}`);
  const openProject = (title) => ({
    clientId: CLIENT, title, description: 'probe', location: 'TLV', deadline: 'flexible',
    crewSlots: [{ category: 'Editor', quantity: 1 }, { category: 'Colorist', quantity: 1 }],
    filledSlots: [], professionalIds: [], slotHolders: [], status: 'open', createdAt: new Date(),
  });
  await adminDb.doc(`projects/${P_OFF}`).set(openProject('Replay — switch off'));
  await adminDb.doc(`projects/${P_ON}`).set(openProject('Replay — switch on'));
  await adminDb.doc(`projects/${P_DEBT}`).set({
    ...openProject('Replay — debt'), status: 'completed', professionalIds: [PRO],
    completion: { state: 'confirmed', source: 'client', confirmedAt: new Date(Date.now() - 9 * 86400_000) },
  });
  const overdueAt = Date.now() - 2 * 86400_000;
  log('WRITE overdue fee');
  await adminDb.doc(`projects/${P_DEBT}/fees/${PRO}`).set({
    professionalId: PRO, projectId: P_DEBT, feeStatus: 'owed', status: 'pending', feePaid: false,
    feeRate: 0.03, minFeeApplied: 6, baseAmount: 1000, feeDue: 30, slotActive: false,
    engagementStatus: 'completed', chargeDueAt: Timestamp.fromMillis(Date.now() - 5 * 86400_000),
    overdueAt: Timestamp.fromMillis(overdueAt),
    completion: { state: 'confirmed', source: 'client', confirmedAt: new Date(Date.now() - 9 * 86400_000) },
    createdAt: new Date(), hiredAt: new Date(),
  });
  let seen = null;
  for (let i = 0; i < 30 && seen !== overdueAt; i++) {
    await sleep(2000);
    seen = (await adminDb.doc(`feeBlocks/${PRO}`).get()).get('blockedFrom')?.toMillis?.() ?? null;
  }
  log(`feeBlocks ready: ${seen === overdueAt}`);
  if (seen !== overdueAt) throw new Error('trigger never wrote feeBlocks — not flipping');

  // ── phase 2 of the first run, verbatim order ───────────────────────────
  await as('pro');
  await step('OFF: pro offer P_OFF Editor', () => sendOffer(P_OFF, 'Editor'), 'ALLOW');
  const proOfferOn = await step('OFF: pro offer P_ON Editor', () => sendOffer(P_ON, 'Editor'), 'ALLOW');
  await step('OFF: pro bundle P_OFF', () => sendBundle(P_OFF), 'ALLOW');
  await step('OFF: pro application P_OFF', () => sendApplication(P_OFF), 'ALLOW');
  const proOfferOff = (await adminDb.collection('priceOffers')
    .where('projectId', '==', P_OFF).where('professionalId', '==', PRO).get()).docs[0].id;
  await as('client');
  log('client: hireProfessional(P_OFF offer) …');
  try { await httpsCallable(fns, 'hireProfessional')({ offerId: proOfferOff }); log('hire → ok'); }
  catch (e) { log(`hire → ${e?.code} ${e?.message}`); }
  await server('after hire');

  // ── the flip, then phase 3 verbatim ────────────────────────────────────
  const forceOff = setTimeout(() => { setOff('hard timer 30s').catch(() => {}); }, 30_000);
  const wr = await configRef.set({ feeOverdueBlockEnabled: true }, { merge: true });
  flipAt = Date.now();
  flipWriteTime = wr.writeTime.toDate().toISOString();
  log(`switch ON — server commit time ${flipWriteTime}`);
  await as('pro');
  log('as(pro) done');
  await step('ON: pro offer P_ON Colorist', () => sendOffer(P_ON, 'Colorist'), 'DENY');
  await step('ON: pro bundle P_ON', () => sendBundle(P_ON), 'DENY');
  await step('ON: pro application P_ON', () => sendApplication(P_ON), 'DENY');
  await step('ON: pro edits existing offer', () => updateDoc(doc(db, 'priceOffers', proOfferOn.id), { price: 1100 }), 'ALLOW');
  await step('ON: pro reads own feeBlocks', () => getDoc(doc(db, `feeBlocks/${PRO}`)), 'ALLOW');
  await sleep(2000);
  await step('ON: pro offer P_ON Colorist, +2 s', () => sendOffer(P_ON, 'Colorist', 1200), 'DENY');
  await step('ON: pro reads own feeBlocks, +2 s', () => getDoc(doc(db, `feeBlocks/${PRO}`)), 'ALLOW');

  clearTimeout(forceOff);
  await setOff('end of window');
  log(`switch was ON for ${Date.now() - flipAt} ms`);

  // ── inspect anything ALLOWED while ON (kept, not deleted) ───────────────
  console.log('\nRESULTS:');
  for (const r of results) {
    const odd = r.want && r.got !== r.want;
    console.log(`  ${odd ? 'ODD' : 'ok '}  ${r.sinceFlip === null ? '   pre-flip' : `+${String(r.sinceFlip).padStart(6)}ms`}  ${r.label.padEnd(36)} got=${r.got} want=${r.want ?? '-'}`);
    if (odd) failures++;
  }
  const allowedOn = results.filter((r) => r.sinceFlip !== null && r.got === 'ALLOW' && r.want === 'DENY' && r.ref?.id);
  for (const r of allowedOn) {
    const snap = await adminDb.doc(`priceOffers/${r.ref.id}`).get();
    console.log(`\n  KEPT for inspection: priceOffers/${r.ref.id}`);
    console.log(`    createTime=${snap.createTime?.toDate().toISOString()}  switch commit=${flipWriteTime}`);
    console.log(`    created ${snap.createTime && snap.createTime.toMillis() < Date.parse(flipWriteTime) ? 'BEFORE' : 'AFTER'} the switch write committed`);
    console.log(`    data=${JSON.stringify(snap.data())}`);
  }
} catch (e) {
  console.error('\nprobe threw:', e);
  failures++;
} finally {
  await teardown();
}
console.log(`\n${failures === 0 ? 'NOT REPRODUCED — all as wanted' : `${failures} ODD / FAILED`}\n`);
process.exit(failures ? 1 : 0);
