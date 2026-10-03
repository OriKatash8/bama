#!/usr/bin/env node
/**
 * PRODUCTION — pre-launch wipe. Deletes every user and their data except the
 * hard-coded keep list (scripts/lib/wipeClassifier.mjs). PERMANENT.
 * Plan, inventory and owner decisions: docs/status/2026-10-03-prelaunch-wipe-phase1.md.
 *
 *   node scripts/wipe-prelaunch.mjs                  # dry run: the plan, nothing deleted
 *   node scripts/wipe-prelaunch.mjs dump             # Firestore → firestore-docs.json (backup)
 *   node scripts/wipe-prelaunch.mjs backup-check --export-op OP --storage-copy gs://B/storage
 *                                                    # proves the backup complete, writes BACKUP_OK.json
 *   node scripts/wipe-prelaunch.mjs --commit         # deletes (needs BACKUP_OK.json)
 *   node scripts/wipe-prelaunch.mjs verify           # read-only: nothing left to delete, no orphans
 *
 * Everything (logs, manifest, dump, marker) goes to --out, default
 * ~/bama-backups/wipe-2026-10-03 — never into the project.
 *
 * DELETES ONLY. No write or update, so no onCreate/onUpdate trigger fires — no
 * push, no system message. Push tokens of deleted users go first.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import {
  ADMIN_UID, DEMO_UIDS, KEEP_UIDS, PLANNED_COLLECTIONS,
  keepDoc, keepProject, keepChat, keepSubDoc, keepFile, refsOfKept, storagePathOfUrl, keepMissingParent,
} from './lib/wipeClassifier.mjs';

const PROJECT = 'bama-af0a0';
const BUCKET = 'bama-af0a0.firebasestorage.app';
const args = process.argv.slice(2);
const CMD = args.find((a) => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--')) ?? 'plan';
const COMMIT = args.includes('--commit');
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const OUT = flag('--out') ?? join(homedir(), 'bama-backups', 'wipe-2026-10-03');
mkdirSync(OUT, { recursive: true });
const MARKER = join(OUT, 'BACKUP_OK.json');
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const lines = [];
const say = (...a) => { const s = a.join(' '); console.log(s); lines.push(s); };

initializeApp({ projectId: PROJECT, storageBucket: BUCKET });
const db = getFirestore();
const auth = getAuth();
const bucket = getStorage().bucket();
const KEEP = new Set(KEEP_UIDS);

async function allAuthUsers() {
  const out = []; let t;
  do { const p = await auth.listUsers(1000, t); out.push(...p.users); t = p.pageToken; } while (t);
  return out;
}

/** Every doc under `ref`, depth-first: [{ ref, data }]. */
async function subtree(ref) {
  const out = [];
  for (const sub of await ref.listCollections()) {
    for (const d of (await sub.get()).docs) { out.push(d); out.push(...(await subtree(d.ref))); }
  }
  return out;
}

// ── preflight ───────────────────────────────────────────────────────────────
async function preflight() {
  const problems = [];
  for (const uid of KEEP_UIDS) {
    const u = await auth.getUser(uid).catch(() => null);
    if (!u) problems.push(`keep uid missing from Auth: ${uid}`);
    if (uid === ADMIN_UID && u?.customClaims?.role !== 'admin') problems.push('admin has no role:admin claim');
  }
  const cfg = (await db.doc('config/demoAccounts').get()).data();
  if (JSON.stringify([...(cfg?.uids ?? [])].sort()) !== JSON.stringify([...DEMO_UIDS].sort())) problems.push('config/demoAccounts.uids ≠ demo uids');
  for (const c of await db.listCollections()) if (!PLANNED_COLLECTIONS.includes(c.id)) problems.push(`unplanned collection: ${c.id}`);
  if (problems.length) { for (const p of problems) say(`REFUSING: ${p}`); process.exit(2); }
}

// ── the plan ────────────────────────────────────────────────────────────────
async function buildPlan() {
  const cols = (await db.listCollections()).map((c) => c.id);
  const snap = {};
  for (const c of cols) snap[c] = (await db.collection(c).get()).docs;

  const ctx = { keptProjects: new Set(), keptChats: new Set(), keptListings: new Set(), keptMedia: new Set(), keptInviteTokens: new Set() };
  for (const d of snap.projects ?? []) if (keepProject(d.data())) ctx.keptProjects.add(d.id);
  for (const d of snap.chats ?? []) if (keepChat(d.id, d.data(), ctx)) ctx.keptChats.add(d.id);
  for (const d of snap.communityInvites ?? []) if (ctx.keptChats.has(d.get('communityId'))) ctx.keptInviteTokens.add(d.id);

  const plan = { collections: {}, deleteDocs: {}, deleteSubDocs: [], keptDocs: [] };
  for (const c of cols) {
    const row = { total: 0, delete: 0, keep: 0, subDelete: 0, subKeep: 0 };
    plan.deleteDocs[c] = [];
    for (const d of snap[c]) {
      row.total++;
      const keep = keepDoc(c, d.id, d.data(), ctx);
      const sub = await subtree(d.ref);
      if (keep) {
        row.keep++;
        plan.keptDocs.push({ col: c, id: d.id, data: d.data() });
        if (c === 'marketplace_listings') ctx.keptListings.add(d.id);
        if (c === 'courses') { const p = storagePathOfUrl(d.get('coverImageUrl')); if (p) ctx.keptMedia.add(p); }
        if (c === 'chats' && d.get('type') === 'community') { const p = storagePathOfUrl(d.get('photoURL')); if (p) ctx.keptMedia.add(p); }
        for (const s of sub) {
          const parts = s.ref.path.split('/');   // col/id/sub/subId[/…]
          if (parts.length === 4 && !keepSubDoc(c, parts[2], parts[3])) { plan.deleteSubDocs.push(s.ref.path); row.subDelete++; } else row.subKeep++;
        }
      } else {
        row.delete++; row.subDelete += sub.length;
        plan.deleteDocs[c].push(d.id);
      }
    }
    // Missing parents: a path with subcollections but no document (get() never
    // returns it). Found after the first --commit left a deleted user's phone
    // under users/{uid}/private and clicks under four deleted courses.
    const existing = new Set(snap[c].map((d) => d.id));
    plan.missingParents ??= [];
    for (const ref of await db.collection(c).listDocuments()) {
      if (existing.has(ref.id)) continue;
      const sub = await subtree(ref);
      if (sub.length === 0) continue;
      if (keepMissingParent(c, ref.id)) { row.subKeep += sub.length; continue; }
      row.missingParents = (row.missingParents ?? 0) + 1;
      row.subDelete += sub.length;
      plan.missingParents.push(ref.path);
    }
    plan.collections[c] = row;
  }

  // Orphan check on what stays: no kept doc may still name a deleted user.
  const orphans = [];
  for (const k of plan.keptDocs) {
    for (const u of refsOfKept(k.col, k.data)) if (!KEEP.has(u)) orphans.push(`${k.col}/${k.id} → ${u}`);
    if (k.col === 'users') {
      for (const ch of k.data.mutedChats ?? []) if (!ctx.keptChats.has(ch)) orphans.push(`users/${k.id}.mutedChats → ${ch}`);
      for (const m of k.data.pendingMentions ?? []) if (!ctx.keptChats.has(m?.chatId ?? m)) orphans.push(`users/${k.id}.pendingMentions → ${JSON.stringify(m)}`);
    }
  }

  const users = await allAuthUsers();
  plan.authDelete = users.filter((u) => !KEEP.has(u.uid)).map((u) => ({ uid: u.uid, email: u.email ?? '(no email)', disabled: u.disabled }));
  plan.authKeep = users.filter((u) => KEEP.has(u.uid)).map((u) => u.uid);

  const [files] = await bucket.getFiles();
  plan.storage = { total: files.length, keep: [], delete: [], bytes: 0 };
  for (const f of files) {
    plan.storage.bytes += Number(f.metadata.size ?? 0);
    (keepFile(f.name, ctx) ? plan.storage.keep : plan.storage.delete).push(f.name);
  }
  plan.orphans = orphans;
  plan.ctx = { keptProjects: [...ctx.keptProjects], keptChats: [...ctx.keptChats] };
  return plan;
}

function printPlan(plan) {
  say('\nFirestore (top-level docs; sub = documents in their subcollections):');
  console.table(plan.collections);
  lines.push(JSON.stringify(plan.collections, null, 1));
  say(`kept-parent subdocs to delete: ${plan.deleteSubDocs.length}`);
  say(`missing parents (subcollections without a doc) to delete: ${(plan.missingParents ?? []).length} ${JSON.stringify(plan.missingParents ?? [])}`);
  say(`\nAuth: keep ${plan.authKeep.length} (${plan.authKeep.join(', ')}), delete ${plan.authDelete.length}:`);
  for (const u of plan.authDelete) say(`  ${u.email}${u.disabled ? ' (disabled)' : ''}  ${u.uid}`);
  say(`\nStorage: ${plan.storage.total} files, keep ${plan.storage.keep.length}: ${plan.storage.keep.join(', ')}; delete ${plan.storage.delete.length}`);
  say(`\nOrphans in what stays: ${plan.orphans.length}`);
  for (const o of plan.orphans) say(`  ${o}`);
}

// ── delete ──────────────────────────────────────────────────────────────────
async function commit(plan) {
  if (!existsSync(MARKER)) { say(`REFUSING: no backup marker at ${MARKER}`); process.exit(2); }
  const marker = JSON.parse(readFileSync(MARKER, 'utf8'));
  say(`backup marker: ${marker.createdAt} — export ${marker.exportOp}, auth ${marker.authUsers} users, storage ${marker.storageFiles} files`);
  if (plan.orphans.length) { say('REFUSING: what stays would still name deleted users (see above)'); process.exit(2); }
  const T0 = Timestamp.now();
  const bw = db.bulkWriter();
  let n = 0;
  const delTop = async (c) => {
    for (const id of plan.deleteDocs[c] ?? []) { await db.recursiveDelete(db.doc(`${c}/${id}`), bw); n++; }
    say(`  ${c}: ${plan.deleteDocs[c]?.length ?? 0} deleted`);
  };
  // Order (plan §5): push tokens first, so nothing can reach a deleted user mid-wipe.
  for (const c of ['pushTokens', 'notifications', 'priceOffers', 'bundleOffers', 'projectApplications', 'projects', 'chats']) await delTop(c);
  for (const c of Object.keys(plan.deleteDocs)) if (!['pushTokens', 'notifications', 'priceOffers', 'bundleOffers', 'projectApplications', 'projects', 'chats', 'users'].includes(c)) await delTop(c);
  for (const p of plan.deleteSubDocs) bw.delete(db.doc(p));
  for (const p of plan.missingParents ?? []) await db.recursiveDelete(db.doc(p), bw);
  say(`  missing parents: ${plan.missingParents?.length ?? 0} subtrees deleted`);
  say(`  kept-parent subdocs: ${plan.deleteSubDocs.length} deleted`);
  await delTop('users');
  await bw.close();
  for (const name of plan.storage.delete) await bucket.file(name).delete({ ignoreNotFound: true });
  say(`  storage: ${plan.storage.delete.length} files deleted`);
  const uids = plan.authDelete.map((u) => u.uid);
  for (let i = 0; i < uids.length; i += 1000) {
    const r = await auth.deleteUsers(uids.slice(i, i + 1000));
    say(`  auth: ${r.successCount} deleted, ${r.failureCount} failed`);
    for (const e of r.errors) say(`    auth failure ${uids[i + e.index]}: ${e.error.message}`);
  }
  // Anything a trigger wrote while we deleted?
  await new Promise((r) => setTimeout(r, 15000));
  const newNotifs = (await db.collection('notifications').where('createdAt', '>=', T0).count().get()).data().count;
  const feeBlocks = (await db.collection('feeBlocks').count().get()).data().count;
  const usersLeft = (await db.collection('users').count().get()).data().count;
  say(`\nafter: notifications created since start ${newNotifs}, feeBlocks ${feeBlocks}, users docs ${usersLeft}`);
  writeFileSync(join(OUT, `${STAMP}-commit.json`), JSON.stringify({ T0: T0.toDate(), newNotifs, feeBlocks, usersLeft }, null, 1));
}

// ── backup helpers ──────────────────────────────────────────────────────────
function plain(v) {
  if (v instanceof Timestamp) return { __ts: v.toDate().toISOString() };
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === 'object' && v.constructor?.name === 'DocumentReference') return { __ref: v.path };
  if (v && typeof v === 'object' && v.constructor?.name === 'GeoPoint') return { __geo: [v.latitude, v.longitude] };
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  return v;
}
async function liveCounts() {
  const counts = {};
  const walk = async (ref, key) => {
    for (const sub of await ref.listCollections()) {
      const k = `${key}/${sub.id}`;
      for (const d of (await sub.get()).docs) { counts[k] = (counts[k] ?? 0) + 1; await walk(d.ref, k); }
    }
  };
  for (const c of await db.listCollections()) {
    const seen = new Set();
    for (const d of (await c.get()).docs) { seen.add(d.id); counts[c.id] = (counts[c.id] ?? 0) + 1; await walk(d.ref, c.id); }
    for (const r of await c.listDocuments()) if (!seen.has(r.id)) await walk(r, c.id);   // missing parents
  }
  return counts;
}
async function dump() {
  const docs = {};
  const walk = async (ref) => {
    for (const sub of await ref.listCollections()) {
      for (const d of (await sub.get()).docs) { docs[d.ref.path] = plain(d.data()); await walk(d.ref); }
    }
  };
  for (const c of await db.listCollections()) {
    for (const d of (await c.get()).docs) { docs[d.ref.path] = plain(d.data()); await walk(d.ref); }
    for (const r of await c.listDocuments()) if (!docs[r.path]) await walk(r);   // missing parents
  }
  writeFileSync(join(OUT, 'firestore-docs.json'), JSON.stringify(docs));
  say(`dumped ${Object.keys(docs).length} docs → ${join(OUT, 'firestore-docs.json')}`);
}
async function backupCheck() {
  const op = flag('--export-op'); const copy = flag('--storage-copy');
  if (!op || !copy) { say('need --export-op and --storage-copy'); process.exit(2); }
  const checks = [];
  const ok = (name, pass, detail) => { checks.push({ name, pass, detail }); say(`  ${pass ? 'ok  ' : 'FAIL'} ${name} — ${detail}`); };
  const opInfo = JSON.parse(execFileSync('gcloud', ['firestore', 'operations', 'describe', op, '--project', PROJECT, '--format=json'], { encoding: 'utf8' }));
  ok('Firestore export operation finished', opInfo.done === true && !opInfo.error && opInfo.metadata?.operationState === 'SUCCESSFUL',
    `state ${opInfo.metadata?.operationState}, output ${opInfo.metadata?.outputUriPrefix}`);
  const liveAuth = (await allAuthUsers()).length;
  const exported = JSON.parse(readFileSync(join(OUT, 'auth-users.json'), 'utf8')).users.length;
  ok('Auth export complete', exported === liveAuth, `${exported} exported, ${liveAuth} live`);
  const [src] = await bucket.getFiles();
  const srcBytes = src.reduce((s, f) => s + Number(f.metadata.size ?? 0), 0);
  const m = copy.match(/^gs:\/\/([^/]+)\/(.*)$/);
  const [dst] = await getStorage().bucket(m[1]).getFiles({ prefix: m[2].replace(/\/?$/, '/') });
  const dstBytes = dst.reduce((s, f) => s + Number(f.metadata.size ?? 0), 0);
  ok('Storage copy complete', dst.length === src.length && dstBytes === srcBytes, `${dst.length}/${src.length} files, ${dstBytes}/${srcBytes} bytes`);
  const live = await liveCounts();
  const dumped = {};
  for (const p of Object.keys(JSON.parse(readFileSync(join(OUT, 'firestore-docs.json'), 'utf8')))) {
    const k = p.split('/').filter((_, i) => i % 2 === 0).join('/'); dumped[k] = (dumped[k] ?? 0) + 1;
  }
  const diff = [...new Set([...Object.keys(live), ...Object.keys(dumped)])].filter((k) => live[k] !== dumped[k]);
  ok('JSON dump matches live counts per collection', diff.length === 0, diff.length ? diff.map((k) => `${k}: dump ${dumped[k]} live ${live[k]}`).join('; ') : `${Object.keys(live).length} collection paths, ${Object.values(live).reduce((a, b) => a + b, 0)} docs`);
  writeFileSync(join(OUT, 'live-counts.json'), JSON.stringify(live, null, 1));
  if (checks.every((c) => c.pass)) {
    writeFileSync(MARKER, JSON.stringify({ createdAt: new Date().toISOString(), exportOp: op, exportUri: opInfo.metadata?.outputUriPrefix, authUsers: exported, storageFiles: dst.length, storageBytes: dstBytes, liveCounts: live }, null, 1));
    say(`\nBACKUP OK → ${MARKER}`);
  } else { say('\nBACKUP INCOMPLETE — no marker written'); process.exitCode = 1; }
}

// ── main ────────────────────────────────────────────────────────────────────
try {
  if (CMD === 'dump') await dump();
  else if (CMD === 'backup-check') await backupCheck();
  else {
    await preflight();
    const plan = await buildPlan();
    if (CMD === 'verify') {
      const leftover = Object.values(plan.collections).reduce((s, r) => s + r.delete + r.subDelete, 0);
      say(`verify: docs left to delete ${leftover}, auth users to delete ${plan.authDelete.length}, storage to delete ${plan.storage.delete.length}, orphans ${plan.orphans.length}`);
      say(`auth users now: ${plan.authKeep.length} (${plan.authKeep.join(', ')})`);
      console.table(Object.fromEntries(Object.entries(plan.collections).map(([c, r]) => [c, { docs: r.keep, subdocs: r.subKeep }])));
      process.exitCode = leftover || plan.authDelete.length || plan.storage.delete.length || plan.orphans.length || plan.authKeep.length !== KEEP_UIDS.length ? 1 : 0;
    } else {
      printPlan(plan);
      writeFileSync(join(OUT, `${STAMP}-plan.json`), JSON.stringify({ ...plan, keptDocs: plan.keptDocs.map((k) => `${k.col}/${k.id}`) }, null, 1));
      if (COMMIT) { say('\nCOMMIT — deleting'); await commit(plan); }
      else say('\nDry run: nothing deleted.');
    }
  }
} finally {
  writeFileSync(join(OUT, `${STAMP}-${CMD}${COMMIT ? '-commit' : ''}.log`), lines.join('\n') + '\n');
}
process.exit(process.exitCode ?? 0);
