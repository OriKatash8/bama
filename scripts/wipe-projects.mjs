#!/usr/bin/env node
/**
 * Empty the `projects` collection and everything that hangs off it.
 *
 * DRY RUN BY DEFAULT. `--commit` is the only thing that deletes. `--project <id>`
 * is required and never guessed — this script destroys production data and must
 * not be able to do it to the wrong database because an env var was set.
 *
 *   node scripts/wipe-projects.mjs --project bama-af0a0
 *   node scripts/wipe-projects.mjs --project bama-af0a0 --commit
 *
 * SUBCOLLECTIONS ARE DISCOVERED, NOT ASSUMED. `listCollections()` per project is
 * authoritative; a list grepped out of the code would silently skip anything
 * written by a path nobody found. The names we expect are fees, meetings,
 * missions, paymentRequests and removalRequests — if a sixth appears in the
 * output, that is the script working.
 *
 * THE FEE LEDGER IS EXPORTED EVERY RUN, dry or not, before anything is counted.
 * `baseAmount`, `feeRate` and `minFeeApplied` are snapshots taken at hire
 * precisely so they could never be recomputed from live config — which also means
 * nothing can rebuild them afterwards. The export is cheap; the loss is total.
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const commit = args.includes('--commit');
const projectId = args[args.indexOf('--project') + 1];
if (!args.includes('--project') || !projectId || projectId.startsWith('--')) {
  console.error('ERROR: --project <firebaseProjectId> is required. Refusing to guess.');
  process.exit(1);
}

initializeApp({ projectId });
const db = getFirestore();

const n = (x) => x.toLocaleString('en-US');
const log = (...a) => console.log(...a);

/** Every project, with its discovered subcollections. */
async function survey() {
  const projects = await db.collection('projects').get();

  const byStatus = new Map();
  const subBySuffix = new Map();     // collection name -> doc count
  const chatIds = new Set();
  const feeDocs = [];               // the ledger, for export

  for (const p of projects.docs) {
    const d = p.data();
    const status = d.status ?? '<none>';
    byStatus.set(status, (byStatus.get(status) ?? 0) + 1);
    if (d.chatId) chatIds.add(d.chatId);

    // AUTHORITATIVE: ask Firestore what is under this document.
    const subs = await p.ref.listCollections();
    for (const c of subs) {
      const snap = await c.get();
      subBySuffix.set(c.id, (subBySuffix.get(c.id) ?? 0) + snap.size);
      if (c.id === 'fees') {
        for (const f of snap.docs) {
          feeDocs.push({ projectId: p.id, projectStatus: status, feeId: f.id, ...f.data() });
        }
      }
    }
  }

  return { projects, byStatus, subBySuffix, chatIds, feeDocs };
}

/** Documents outside `projects/` that point at one. */
async function collateral(liveProjectIds, chatIds) {
  const counted = {};
  for (const [name, field] of [
    ['priceOffers', 'projectId'],
    ['bundleOffers', 'projectId'],
    ['reviews', 'projectId'],
  ]) {
    const snap = await db.collection(name).get();
    counted[name] = {
      total: snap.size,
      matching: snap.docs.filter((d) => liveProjectIds.has(d.data()[field])).length,
      orphanedAlready: snap.docs.filter((d) => {
        const v = d.data()[field];
        return v && !liveProjectIds.has(v);
      }).length,
    };
  }

  // Chats reachable from a project, plus what hangs off them. The production
  // cascade deletes the chat but NOT its messages, so these orphan today.
  let chatMessages = 0;
  let channelMessages = 0;
  let chatsFound = 0;
  for (const id of chatIds) {
    const ref = db.doc(`chats/${id}`);
    if (!(await ref.get()).exists) continue;
    chatsFound += 1;
    for (const c of await ref.listCollections()) {
      const snap = await c.get();
      if (c.id === 'messages') chatMessages += snap.size;
      else if (c.id === 'channels') {
        for (const ch of snap.docs) {
          for (const cc of await ch.ref.listCollections()) {
            channelMessages += (await cc.get()).size;
          }
        }
      }
    }
  }

  // Notifications carrying a projectId. Scanned rather than queried: the field is
  // nested under `data` and is not indexed for equality across the collection.
  const notifs = await db.collection('notifications').get();
  const notifMatching = notifs.docs.filter((d) => {
    const pid = d.data()?.data?.projectId;
    return pid && liveProjectIds.has(pid);
  }).length;

  return {
    ...counted,
    chats: { referenced: chatIds.size, found: chatsFound, messages: chatMessages, channelMessages },
    notifications: { total: notifs.size, matching: notifMatching },
  };
}

/**
 * Offers pointing at a project that is ALREADY gone — pre-existing damage from the
 * old client-side cascade, which issued deletes the rules denied and orphaned
 * every offer while appearing to succeed.
 *
 * They would survive a wipe keyed on live project ids, which is the worst
 * outcome: a cleared database with a residue nobody can explain six months later.
 * Swept here, and exported first for the same reason the ledger is — `computeProAmount`
 * prices a fee off accepted offers, so these are fee bases with no project behind
 * them and the only remaining record of what was agreed.
 */
async function findOrphanedOffers(liveProjectIds) {
  const out = {};
  for (const name of ['priceOffers', 'bundleOffers', 'projectApplications']) {
    const snap = await db.collection(name).get();
    out[name] = snap.docs.filter((d) => {
      const pid = d.data().projectId;
      return pid && !liveProjectIds.has(pid);
    });
  }
  // Notifications keep the id one level down, under `data`, which is also why
  // they cannot be queried for it — no index reaches a nested field across the
  // collection, so this scans. Their routing cases (end_date_soon,
  // engagement_completed, charge_failed) all push to a project screen, so an
  // orphan is a push that opens a page which fails to load.
  const notifs = await db.collection('notifications').get();
  out.notifications = notifs.docs.filter((d) => {
    const pid = d.data()?.data?.projectId;
    return pid && !liveProjectIds.has(pid);
  });
  return out;
}

/** The collections the orphan sweep covers, in deletion order. */
const ORPHAN_COLLECTIONS = ['priceOffers', 'bundleOffers', 'projectApplications', 'notifications'];

/**
 * Writes nothing when there is nothing to write.
 *
 * A dry run AFTER the wipe would otherwise drop a 0-record file into the backup
 * directory as the NEWEST one there — which is worse than no file, because the
 * obvious way to find the export is to take the latest. Verification runs are
 * expected and must not bury what they are verifying.
 */
function exportJson(basename, payload, count) {
  if (count === 0) return '(nothing to export)';
  const dir = join(homedir(), 'bama-backups');
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(dir, `${basename}-${projectId}-${stamp}.json`);
  writeFileSync(file, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return file;
}

function exportLedger(feeDocs) {
  return exportJson('fee-ledger', feeDocs, feeDocs.length);
}

/** Shekels this ledger says were actually collected. */
function paidSummary(feeDocs) {
  const paid = feeDocs.filter((f) => (f.paidAmount ?? 0) > 0 || f.feePaid === true);
  const shekels = paid.reduce((s, f) => s + (f.paidAmount ?? 0), 0);
  const owing = feeDocs.filter((f) => (f.feeDue ?? 0) > 0);
  const owingShekels = owing.reduce((s, f) => s + (f.feeDue ?? 0), 0);
  return { paid: paid.length, shekels, owing: owing.length, owingShekels };
}

const { projects, byStatus, subBySuffix, chatIds, feeDocs } = await survey();
const liveProjectIds = new Set(projects.docs.map((d) => d.id));
const extra = await collateral(liveProjectIds, chatIds);

const orphans = await findOrphanedOffers(liveProjectIds);

// Written BEFORE any count is printed, so an interrupted run has still saved it.
const ledgerFile = exportLedger(feeDocs);
const orphanCount = ORPHAN_COLLECTIONS.reduce((t, k) => t + orphans[k].length, 0);
const orphanFile = exportJson('orphaned-offers', Object.fromEntries(
  Object.entries(orphans).map(([k, docs]) => [k, docs.map((d) => ({ id: d.id, ...d.data() }))]),
), orphanCount);
const money = paidSummary(feeDocs);

log('');
log(`  database            ${projectId}`);
log(`  mode                ${commit ? '*** COMMIT — WILL DELETE ***' : 'DRY RUN (nothing written)'}`);
log('');
log(`  fee ledger exported ${ledgerFile}`);
log(`                      ${n(feeDocs.length)} engagement records`);
log(`  orphans exported    ${orphanFile}`);
log('');
log('  PROJECTS');
log(`    total             ${n(projects.size)}`);
for (const [s, c] of [...byStatus.entries()].sort((a, b) => b[1] - a[1])) {
  log(`      ${s.padEnd(16)}${n(c)}`);
}
log('');
log('  SUBCOLLECTIONS (discovered via listCollections, not assumed)');
if (subBySuffix.size === 0) log('    (none)');
for (const [name, c] of [...subBySuffix.entries()].sort((a, b) => b[1] - a[1])) {
  log(`    ${name.padEnd(18)}${n(c)}`);
}
log('');
log('  COLLATERAL OUTSIDE projects/');
for (const name of ['priceOffers', 'bundleOffers', 'reviews']) {
  const x = extra[name];
  log(`    ${name.padEnd(18)}${n(x.matching)} of ${n(x.total)} point at a project being deleted`
    + (x.orphanedAlready ? `   (${n(x.orphanedAlready)} already orphaned)` : ''));
}
log(`    chats             ${n(extra.chats.found)} of ${n(extra.chats.referenced)} referenced still exist`);
log(`      messages        ${n(extra.chats.messages)}   <- NOT deleted by the production cascade`);
log(`      channel msgs    ${n(extra.chats.channelMessages)}`);
log(`    notifications     ${n(extra.notifications.matching)} of ${n(extra.notifications.total)}`);
log('');
log('  ALREADY ORPHANED — point at a project that is ALREADY gone (swept too)');
for (const name of ORPHAN_COLLECTIONS) {
  log(`    ${name.padEnd(20)}${n(orphans[name].length)}`);
}
log('');
log('  THE IRREVERSIBLE PART');
log(`    fees recording a payment   ${n(money.paid)}   (₪${n(money.shekels)} collected)`);
log(`    fees still owing           ${n(money.owing)}   (₪${n(money.owingShekels)} outstanding)`);
log('');

if (!commit) {
  log('  Dry run. Nothing was deleted. Re-run with --commit to delete.');
  process.exit(0);
}

log('  Deleting. Collateral first, project documents last.');
let deleted = 0;
for (const name of ['priceOffers', 'bundleOffers', 'reviews']) {
  const snap = await db.collection(name).get();
  const refs = snap.docs.filter((d) => liveProjectIds.has(d.data().projectId)).map((d) => d.ref);
  for (let i = 0; i < refs.length; i += 400) {
    const batch = db.batch();
    refs.slice(i, i + 400).forEach((r) => batch.delete(r));
    await batch.commit();
  }
  deleted += refs.length;
  log(`    ${name}: ${n(refs.length)}`);
}
// The pre-existing orphans, swept in the same pass so these collections are
// actually empty of project-linked residue rather than merely of live-project
// residue. `projectApplications` and the nested-id notifications are here because
// deleteProject's cascade never covered them — see docs/pre-launch-backlog.md.
for (const name of ORPHAN_COLLECTIONS) {
  const refs = orphans[name].map((d) => d.ref);
  for (let i = 0; i < refs.length; i += 400) {
    const batch = db.batch();
    refs.slice(i, i + 400).forEach((r) => batch.delete(r));
    await batch.commit();
  }
  log(`    ${name} (already orphaned): ${n(refs.length)}`);
}
for (const id of chatIds) {
  // recursiveDelete takes the messages and channels the cascade leaves behind.
  await db.recursiveDelete(db.doc(`chats/${id}`));
}
log(`    chats (recursive): ${n(chatIds.size)}`);
const notifs = await db.collection('notifications').get();
const notifRefs = notifs.docs
  .filter((d) => { const p = d.data()?.data?.projectId; return p && liveProjectIds.has(p); })
  .map((d) => d.ref);
for (let i = 0; i < notifRefs.length; i += 400) {
  const batch = db.batch();
  notifRefs.slice(i, i + 400).forEach((r) => batch.delete(r));
  await batch.commit();
}
log(`    notifications: ${n(notifRefs.length)}`);
for (const p of projects.docs) {
  await db.recursiveDelete(p.ref);
}
log(`    projects (recursive, incl. every subcollection): ${n(projects.size)}`);
log('');
log('  Done. Re-run the dry run; every count must read 0.');
