#!/usr/bin/env node
/**
 * Second line of defence after scripts/probe-fee-overdue-prod.mjs, run whether
 * the probe passed, failed or died. Idempotent.
 *
 *   1. Forces config/pricing.feeOverdueBlockEnabled = false.
 *   2. Deletes everything the probe run with this STAMP could have left:
 *      its accounts (found by email), projects (by id prefix, recursively), their
 *      offers/bundles/applications, chats those accounts belong to, their
 *      notifications, feeBlocks and users docs.
 *   3. Re-reads production and prints PROOF of each, exiting non-zero on any
 *      leftover.
 *
 *   node scripts/probe-fee-overdue-sweep-prod.mjs --stamp probe1759370000000
 *   node scripts/probe-fee-overdue-sweep-prod.mjs --logins ~/bama-test-logins.txt
 *
 * --logins reads TEST_STAMP and the TEST_*_UID lines from a manual-test logins
 * file. That file must live OUTSIDE the project: a stray .env-style file in the
 * project root is picked up by Metro's dev bundler and breaks the app (it did,
 * 2026-10-02). A path inside the project is refused.
 */
import { readFileSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldPath } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const i = process.argv.indexOf('--stamp');
let STAMP = i > -1 ? process.argv[i + 1] : '';
const fromLogins = {};
const li = process.argv.indexOf('--logins');
if (li > -1) {
  const file = resolve(process.argv[li + 1].replace(/^~(?=\/)/, process.env.HOME));
  const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const rel = relative(projectRoot, file);
  if (!rel.startsWith('..') && !isAbsolute(rel)) {
    console.error(`ERROR: ${file} is inside the project. Keep the logins file outside it (e.g. ~/bama-test-logins.txt).`);
    process.exit(1);
  }
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*(TEST_[A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m) fromLogins[m[1]] = m[2];
  }
  STAMP ||= fromLogins.TEST_STAMP ?? '';
}
if (!/^(probe|smoke)\d{13}$/.test(STAMP)) {
  console.error('ERROR: --stamp probe<13 digits> (or smoke<13 digits>), or --logins <file outside the project>, is required.');
  process.exit(1);
}
const app = initializeApp({ projectId: 'bama-af0a0' });
const db = getFirestore(app);
const auth = getAuth(app);
const TAGS = ['pro', 'pro2', 'client', 'admin'];
const OFFER_COLS = ['priceOffers', 'bundleOffers', 'projectApplications'];

// ── 1. the switch ──────────────────────────────────────────────────────────
await db.doc('config/pricing').set({ feeOverdueBlockEnabled: false }, { merge: true });

// ── 2. find the run's footprint ───────────────────────────────────────────
const uids = {};
for (const tag of TAGS) {
  try { uids[tag] = (await auth.getUserByEmail(`${STAMP}.${tag}@bama-invalid.test`)).uid; } catch { /* never created, or gone */ }
}
// Uids may also be known from a run file even if the auth accounts are gone.
const extra = process.argv.indexOf('--uids');
if (extra > -1) for (const [tag, uid] of Object.entries(JSON.parse(process.argv[extra + 1]))) uids[tag] ??= uid;
if (fromLogins.TEST_CLIENT_UID) uids.client ??= fromLogins.TEST_CLIENT_UID;
if (fromLogins.TEST_PRO_UID) uids.pro ??= fromLogins.TEST_PRO_UID;
const uidList = [...new Set(Object.values(uids))];

const projectsByPrefix = () => db.collection('projects')
  .where(FieldPath.documentId(), '>=', STAMP).where(FieldPath.documentId(), '<', `${STAMP}`).get();

const projectIds = (await projectsByPrefix()).docs.map((d) => d.id);
const chatIds = new Set();
for (const pid of projectIds) {
  const c = (await db.doc(`projects/${pid}`).get()).get('chatId');
  if (c) chatIds.add(c);
}
for (const uid of uidList) {
  for (const c of (await db.collection('chats').where('members', 'array-contains', uid).get()).docs) chatIds.add(c.id);
}

// ── 3. delete ──────────────────────────────────────────────────────────────
for (const uid of uidList) await auth.deleteUser(uid).catch(() => {});
for (const col of OFFER_COLS) {
  for (const pid of projectIds) {
    for (const d of (await db.collection(col).where('projectId', '==', pid).get()).docs) await d.ref.delete();
  }
  for (const uid of uidList) {
    for (const d of (await db.collection(col).where('professionalId', '==', uid).get()).docs) await d.ref.delete();
  }
}
for (const id of chatIds) await db.recursiveDelete(db.doc(`chats/${id}`));
for (const pid of projectIds) await db.recursiveDelete(db.doc(`projects/${pid}`));
await new Promise((r) => setTimeout(r, 10_000)); // late trigger writes (feeBlocks recompute, notifications)
for (const uid of uidList) {
  for (const n of (await db.collection('notifications').where('userId', '==', uid).get()).docs) await n.ref.delete();
  await db.doc(`feeBlocks/${uid}`).delete();
  await db.recursiveDelete(db.doc(`users/${uid}`));
}

// ── 4. PROOF ───────────────────────────────────────────────────────────────
let bad = 0;
const line = (ok, text) => { console.log(`  ${ok ? 'OK  ' : 'LEFT'}  ${text}`); if (!ok) bad++; };
console.log(`\nPROOF from production for ${STAMP}:`);
const sw = (await db.doc('config/pricing').get()).get('feeOverdueBlockEnabled');
line(sw === false, `config/pricing.feeOverdueBlockEnabled = ${JSON.stringify(sw)}`);
for (const tag of TAGS) {
  const email = `${STAMP}.${tag}@bama-invalid.test`;
  let byEmail = 'auth/user-not-found';
  try { await auth.getUserByEmail(email); byEmail = 'STILL EXISTS'; } catch (e) { byEmail = e?.code ?? String(e); }
  const uid = uids[tag];
  let byUid = 'n/a';
  if (uid) { try { await auth.getUser(uid); byUid = 'STILL EXISTS'; } catch (e) { byUid = e?.code ?? String(e); } }
  const userDoc = uid ? (await db.doc(`users/${uid}`).get()).exists : false;
  const block = uid ? (await db.doc(`feeBlocks/${uid}`).get()).exists : false;
  const notes = uid ? (await db.collection('notifications').where('userId', '==', uid).get()).size : 0;
  line(byEmail === 'auth/user-not-found' && byUid !== 'STILL EXISTS' && !userDoc && !block && notes === 0,
    `${tag.padEnd(6)} uid=${uid ?? '—'}  auth(email)=${byEmail}  auth(uid)=${byUid}  users doc=${userDoc}  feeBlocks=${block}  notifications=${notes}`);
}
const projLeft = (await projectsByPrefix()).size;
line(projLeft === 0, `projects with id prefix ${STAMP}: ${projLeft}`);
for (const col of OFFER_COLS) {
  let n = 0;
  for (const pid of projectIds) n += (await db.collection(col).where('projectId', '==', pid).get()).size;
  for (const uid of uidList) n += (await db.collection(col).where('professionalId', '==', uid).get()).size;
  line(n === 0, `${col} for the run: ${n}`);
}
let chatsLeft = 0;
for (const id of chatIds) if ((await db.doc(`chats/${id}`).get()).exists) chatsLeft++;
line(chatsLeft === 0, `chats for the run: ${chatsLeft} (of ${chatIds.size} found)`);
console.log(`\n${bad === 0 ? 'CLEAN' : `${bad} ITEM(S) LEFT`}\n`);
process.exit(bad === 0 ? 0 : 1);
