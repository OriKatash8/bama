#!/usr/bin/env node
/**
 * FOCUSED production probe for the two anomalies in run probe1790908193020:
 *   F1  the first price offer right after the switch flipped ON was ALLOWED;
 *   F2  the pro's read of their own feeBlocks doc was DENIED.
 *
 * Separates three causes, logging a timestamp (and ms since the flip) for every step:
 *   A  trigger lag   — Admin SDK reads feeBlocks/{pro} (and config) immediately
 *                      before EVERY client attempt, so each result sits next to
 *                      what the server actually held at that moment.
 *   B  stale creds   — three client instances, all the same pro:
 *                        warm   : signed in + warmed up (a read and a write) long before the flip
 *                        fresh  : a brand-new app instance signed in AFTER the flip
 *                        switch : signed in as the client, then switched to the pro
 *                                 with the original probe's exact as() (signOut,
 *                                 signIn, getIdToken(true)) — the F1/F2 sequence
 *   C  config lag    — warm repeats the offer and the read at
 *                      0, 250, 500, 1000, 2000, 4000, 8000, 15000 ms after the flip.
 *
 * The switch is ON for at most ~25 s (a hard timer forces it OFF at 40 s), then
 * the same teardown as the full probe; run probe-fee-overdue-sweep-prod.mjs after.
 * Refuses to run within 15 min of lifecycleCron (03:00 Israel) or within 5 min of
 * the top of the hour (feeOverdueCron is hourly).
 *
 *   node scripts/probe-fee-overdue-focused-prod.mjs [--run-file <path>]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, deleteUser,
} from 'firebase/auth';

// ── time guard ─────────────────────────────────────────────────────────────
{
  const il = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const mins = il.getHours() * 60 + il.getMinutes();
  const nearLifecycle = Math.abs(mins - 180) <= 15;
  const nearHour = il.getMinutes() >= 55 || il.getMinutes() <= 5;
  if (nearLifecycle || nearHour) {
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

const { initializeApp: ia } = await import('firebase-admin/app');
const { getFirestore: gdb, Timestamp } = await import('firebase-admin/firestore');
const { getAuth: ga } = await import('firebase-admin/auth');
const adminApp = ia({ projectId: cfg.projectId }, STAMP);
const adminDb = gdb(adminApp), adminAuth = ga(adminApp);
const configRef = adminDb.doc('config/pricing');

let flipAt = null;
const ts = () => {
  const now = Date.now();
  return `${new Date(now).toISOString()}${flipAt ? ` (+${String(now - flipAt).padStart(5)}ms)` : '            '}`;
};
const log = (msg) => console.log(`${ts()}  ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(`\nproject: ${cfg.projectId} (LIVE)   STAMP=${STAMP}\n`);
const original = (await configRef.get()).get('feeOverdueBlockEnabled');
if (original === true) { console.error('ABORT: the switch is already ON.'); process.exit(1); }
log(`kill switch before: ${JSON.stringify(original ?? null)}`);
recordRun();

const PW = 'Probe-Password-123!';
const email = (tag) => `${STAMP}.${tag}@bama-invalid.test`;
/** A separate client SDK instance — its own auth state and its own Firestore streams. */
function client(name) {
  const app = initializeApp(cfg, `${STAMP}-${name}`);
  return { name, db: getFirestore(app), auth: getAuth(app) };
}
async function signInAs(c, tag) {
  await signInWithEmailAndPassword(c.auth, email(tag), PW);
}
/** The original probe's switch, verbatim. */
async function switchTo(c, tag) {
  await signOut(c.auth).catch(() => {});
  await signInWithEmailAndPassword(c.auth, email(tag), PW);
  await c.auth.currentUser.getIdToken(true);
}

const P = `${STAMP}-p`;
let PRO, CLIENT;
const rows = [];

/** One attempt: Admin snapshot of the server state, then the client's offer and read. */
async function attempt(c, label, { offer = true, read = true } = {}) {
  const [fb, cf] = await Promise.all([adminDb.doc(`feeBlocks/${PRO}`).get(), configRef.get()]);
  const blockedFrom = fb.exists ? (fb.get('blockedFrom')?.toMillis?.() ?? null) : 'MISSING';
  const sw = cf.get('feeOverdueBlockEnabled');
  const authUid = c.auth.currentUser?.uid === PRO ? 'pro' : (c.auth.currentUser?.uid ?? 'none');
  log(`[${c.name}/${label}] server: feeBlocks.blockedFrom=${blockedFrom} switch=${JSON.stringify(sw ?? null)}  client auth=${authUid}`);
  const out = { client: c.name, label, sw, blockedFrom, sinceFlip: flipAt ? Date.now() - flipAt : null };
  if (offer) {
    try {
      await addDoc(collection(c.db, 'priceOffers'), {
        projectId: P, professionalId: PRO, category: 'Editor', price: 1000 + rows.length,
        status: 'pending', createdAt: serverTimestamp(),
      });
      out.offer = 'ALLOW';
    } catch (e) { out.offer = e?.code === 'permission-denied' ? 'DENY' : `ERR ${e?.code}`; }
    log(`[${c.name}/${label}] offer → ${out.offer}`);
  }
  if (read) {
    try { await getDoc(doc(c.db, `feeBlocks/${PRO}`)); out.read = 'ALLOW'; }
    catch (e) { out.read = e?.code === 'permission-denied' ? 'DENY' : `ERR ${e?.code}`; }
    log(`[${c.name}/${label}] read own feeBlocks → ${out.read}`);
  }
  rows.push(out);
}

let tornDown = false;
async function setOff(why) {
  await configRef.set({ feeOverdueBlockEnabled: false }, { merge: true });
  log(`switch OFF (${why}) → ${JSON.stringify((await configRef.get()).get('feeOverdueBlockEnabled'))}`);
}
let failures = 0;
const warm = client('warm');
const sw = client('switch');
const fresh = [];

async function teardown() {
  if (tornDown) return;
  tornDown = true;
  console.log('\nTeardown:');
  try { await setOff('teardown'); } catch (e) { console.error('SWITCH RESTORE FAILED', e); failures++; }
  for (const tag of Object.keys(accounts)) {
    try { await adminAuth.deleteUser(accounts[tag].uid); } catch (e) { if (e?.code !== 'auth/user-not-found') { console.error('delete', tag, e?.code); failures++; } }
  }
  for (const c of [warm, sw, ...fresh]) await signOut(c.auth).catch(() => {});
  for (const d of (await adminDb.collection('priceOffers').where('projectId', '==', P).get()).docs) await d.ref.delete();
  await adminDb.recursiveDelete(adminDb.doc(`projects/${P}`));
  await adminDb.recursiveDelete(adminDb.doc(`projects/${STAMP}-debt`));
  await sleep(12_000); // the fee delete re-runs the trigger; onUserCreate is async
  for (const a of Object.values(accounts)) {
    for (const n of (await adminDb.collection('notifications').where('userId', '==', a.uid).get()).docs) await n.ref.delete();
    await adminDb.doc(`feeBlocks/${a.uid}`).delete();
    await adminDb.recursiveDelete(adminDb.doc(`users/${a.uid}`));
  }
  console.log('  done — run probe-fee-overdue-sweep-prod.mjs for the proof');
}
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, async () => { failures++; await teardown().catch(() => {}); process.exit(1); });
process.on('uncaughtException', async (e) => { console.error(e); failures++; await teardown().catch(() => {}); process.exit(1); });

try {
  // ── accounts and seed (switch OFF throughout) ───────────────────────────
  for (const tag of ['pro', 'client']) {
    const c = client(`mk-${tag}`);
    const u = (await createUserWithEmailAndPassword(c.auth, email(tag), PW)).user;
    accounts[tag] = { uid: u.uid };
    recordRun();
    await signOut(c.auth);
  }
  PRO = accounts.pro.uid; CLIENT = accounts.client.uid;
  log(`pro=${PRO} client=${CLIENT}`);
  await adminDb.doc(`projects/${P}`).set({
    clientId: CLIENT, title: 'Focused probe', description: 'probe', location: 'TLV', deadline: 'flexible',
    crewSlots: [{ category: 'Editor', quantity: 1 }], filledSlots: [], professionalIds: [], slotHolders: [],
    status: 'open', createdAt: new Date(),
  });
  const overdueAt = Date.now() - 2 * 86400_000;
  await adminDb.doc(`projects/${STAMP}-debt`).set({
    clientId: CLIENT, title: 'Focused probe — debt', status: 'completed', createdAt: new Date(),
  });
  log('WRITE the overdue fee (Admin SDK)');
  await adminDb.doc(`projects/${STAMP}-debt/fees/${PRO}`).set({
    professionalId: PRO, projectId: `${STAMP}-debt`, feeStatus: 'owed', status: 'pending', feePaid: false,
    feeDue: 30, engagementStatus: 'completed', overdueAt: Timestamp.fromMillis(overdueAt),
    chargeDueAt: Timestamp.fromMillis(overdueAt - 3 * 86400_000),
  });
  log('fee written; polling feeBlocks via Admin SDK');
  let seen = null;
  for (let i = 0; i < 40 && seen !== overdueAt; i++) {
    await sleep(500);
    seen = (await adminDb.doc(`feeBlocks/${PRO}`).get()).get('blockedFrom')?.toMillis?.() ?? null;
  }
  log(`feeBlocks/{pro}.blockedFrom = ${seen} (${seen === overdueAt ? 'matches overdueAt' : 'DID NOT APPEAR'})`);
  if (seen !== overdueAt) throw new Error('trigger never wrote feeBlocks — not flipping the switch');

  // warm: signed in and exercised well before the flip
  await signInAs(warm, 'pro');
  log('warm: signed in as pro');
  await attempt(warm, 'pre-flip warm-up (switch off: both ALLOW)');
  // switch: signed in as the CLIENT, like the original probe before phase 3
  await signInAs(sw, 'client');
  log('switch: signed in as client');
  await sleep(10_000);
  log('10 s after sign-ins; flipping');

  // ── the flip: ON for at most ~25 s ──────────────────────────────────────
  const forceOff = setTimeout(() => { setOff('hard timer 40s').catch(() => {}); }, 40_000);
  await configRef.set({ feeOverdueBlockEnabled: true }, { merge: true });
  flipAt = Date.now();
  log('switch ON (Admin write committed)');

  // The original sequence first, as fast as it ran then.
  await switchTo(sw, 'pro');
  log('switch: client → pro (signOut, signIn, getIdToken(true))');
  await attempt(sw, 'right after user switch');

  const schedule = [0, 250, 500, 1000, 2000, 4000, 8000, 15000];
  for (const at of schedule) {
    const wait = flipAt + at - Date.now();
    if (wait > 0) await sleep(wait);
    await attempt(warm, `t+${at}`);
    if (at === 1000 || at === 8000) {
      const f = client(`fresh${at}`);
      fresh.push(f);
      await signInAs(f, 'pro');
      log(`fresh${at}: new instance signed in as pro`);
      await attempt(f, 'immediately after fresh sign-in');
    }
  }
  await attempt(sw, 'switch client, +15 s');

  clearTimeout(forceOff);
  await setOff('end of window');
  log(`switch was ON for ${Date.now() - flipAt} ms`);

  // ── summary ────────────────────────────────────────────────────────────
  console.log('\nSUMMARY (switch ON rows; want offer=DENY, read=ALLOW):');
  for (const r of rows.filter((x) => x.sw === true)) {
    const ok = r.offer === 'DENY' && r.read === 'ALLOW';
    console.log(`  ${ok ? 'ok ' : 'ODD'}  +${String(r.sinceFlip).padStart(5)}ms  ${r.client.padEnd(9)} ${r.label.padEnd(36)} blockedFrom=${r.blockedFrom === 'MISSING' ? 'MISSING' : r.blockedFrom === null ? 'null' : 'set'}  offer=${r.offer}  read=${r.read}`);
  }
} catch (e) {
  console.error('\nprobe threw:', e);
  failures++;
} finally {
  await teardown();
}
process.exit(failures ? 1 : 0);
