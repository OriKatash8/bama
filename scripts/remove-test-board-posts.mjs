#!/usr/bin/env node
/**
 * Remove two noticeboard posts left by the owner's own (now deleted) test
 * account, and everything that hangs off them. Touches nothing else: the post
 * ids are fixed below, the demo accounts' "Wedding" post is not in the list.
 *
 * For each post it collects the project doc, its subcollections, its price and
 * bundle offers, and the notifications that point at it. It REFUSES — and
 * deletes nothing for either post — unless the post is still `open`, belongs to
 * the expected owner, and has no chat, no hire, no filled slot, no fee doc and
 * no accepted offer. The same test the deleteMyAccount cleanup uses
 * (functions/src/account/unhiredPosts.ts).
 *
 *   DRY RUN (default):  node scripts/remove-test-board-posts.mjs
 *   FOR REAL:           node scripts/remove-test-board-posts.mjs --apply
 *   VERIFY (read-only): node scripts/remove-test-board-posts.mjs --verify
 *
 * --apply writes a JSON backup of every document it will delete to
 * ~/bama-backups/board-cleanup-2026-10-15/ FIRST, reads it back, and only then
 * deletes (the project doc last). Restoring = set() each document back at its path.
 *
 * Credentials: gcloud Application Default Credentials, like the other admin
 * scripts (gcloud auth application-default login).
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PROJECT_ID = 'bama-af0a0';
const OWNER_UID = 'jv4xfNYT8xRJLr9lHvZJMxVvgf22';
const POST_IDS = ['JBGRQG9l1I26rp7PQ7Ey', 'SzAZds7sHwqJcuQOZrvx'];
/** Kept on purpose; --verify checks it is untouched. */
const KEEP_POST_ID = '1JPYH5yoAHDx7qh8PFrw';
const SUBCOLLECTIONS = ['fees', 'missions', 'meetings', 'removalRequests', 'paymentRequests'];
const BATCH_LIMIT = 400;

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const verify = args.includes('--verify');
const unknown = args.filter((a) => !['--apply', '--verify', '--dry-run'].includes(a));
if (unknown.length || (apply && verify)) {
  console.error(`Usage: node scripts/remove-test-board-posts.mjs [--dry-run | --apply | --verify]  (got: ${args.join(' ')})`);
  process.exit(1);
}

const db = getFirestore(initializeApp({ projectId: PROJECT_ID }));

/** Everything that belongs to one post, as { path, data } entries (project doc last). */
async function collect(postId) {
  const postRef = db.doc(`projects/${postId}`);
  const post = await postRef.get();
  if (!post.exists) return { postId, exists: false, docs: [], problems: [] };
  const p = post.data();

  const [offers, bundles, notifications, chats, ...subs] = await Promise.all([
    db.collection('priceOffers').where('projectId', '==', postId).get(),
    db.collection('bundleOffers').where('projectId', '==', postId).get(),
    db.collection('notifications').where('data.projectId', '==', postId).get(),
    db.collection('chats').where('projectId', '==', postId).get(),
    ...SUBCOLLECTIONS.map((n) => postRef.collection(n).get()),
  ]);

  const nonEmpty = (v) => Array.isArray(v) && v.length > 0;
  const problems = [];
  if (p.status !== 'open') problems.push(`status is ${p.status}, not open`);
  if (p.clientId !== OWNER_UID) problems.push(`owner is ${p.clientId}, not ${OWNER_UID}`);
  if (p.chatId) problems.push(`has chatId ${p.chatId}`);
  if (!chats.empty) problems.push(`${chats.size} chat doc(s) reference it`);
  if (nonEmpty(p.professionalIds)) problems.push('has professionalIds');
  if (nonEmpty(p.slotHolders)) problems.push('has slotHolders');
  if (nonEmpty(p.filledSlots)) problems.push('has filledSlots');
  if (subs[0].size > 0) problems.push(`${subs[0].size} fee doc(s)`);
  for (const d of [...offers.docs, ...bundles.docs]) if (d.data().status === 'accepted') problems.push(`accepted offer ${d.ref.path}`);

  const docs = [
    ...offers.docs, ...bundles.docs, ...notifications.docs,
    ...subs.flatMap((s) => s.docs),
    post,
  ].map((d) => ({ path: d.ref.path, ref: d.ref, data: d.data() }));
  return { postId, exists: true, title: p.title, docs, problems };
}

if (verify) {
  let ok = true;
  for (const id of POST_IDS) {
    const c = await collect(id);
    const left = c.docs.length;
    console.log(`${id}: ${c.exists ? 'STILL EXISTS' : 'gone'}, ${left} linked doc(s) left`);
    if (c.exists || left) ok = false;
  }
  const keep = await collect(KEEP_POST_ID);
  console.log(`${KEEP_POST_ID} (demo Wedding post, must stay): ${keep.exists ? 'present' : 'MISSING'}, ${keep.docs.length} doc(s) incl. offers/notifications`);
  if (!keep.exists) ok = false;
  const all = await db.collection('projects').count().get();
  console.log(`projects total now: ${all.data().count} (21 before the cleanup, so 19 expected)`);
  console.log(ok ? 'VERIFY OK' : 'VERIFY FAILED');
  process.exit(ok ? 0 : 1);
}

const plan = [];
for (const id of POST_IDS) plan.push(await collect(id));

console.log(`${apply ? 'APPLY' : 'DRY RUN'} — ${POST_IDS.length} post(s) of ${OWNER_UID}`);
let refused = false;
for (const c of plan) {
  if (!c.exists) { console.log(`\n${c.postId}: already gone — skipped`); continue; }
  console.log(`\n${c.postId} "${c.title}"`);
  c.docs.forEach((d) => console.log(`  delete ${d.path}`));
  if (c.problems.length) { refused = true; console.log(`  REFUSED: ${c.problems.join('; ')}`); }
}
if (refused) { console.error('\nRefusing: at least one post is not a plain unhired open post. Nothing deleted.'); process.exit(1); }

const toDelete = plan.flatMap((c) => c.docs);
if (toDelete.length === 0) { console.log('\nNothing to do.'); process.exit(0); }
console.log(`\n${toDelete.length} document(s) in total. ${KEEP_POST_ID} (demo Wedding post) is not touched.`);
if (!apply) { console.log('Dry run only — nothing written. Re-run with --apply.'); process.exit(0); }

// Backup first, and read it back before anything is deleted.
const dir = join(homedir(), 'bama-backups', 'board-cleanup-2026-10-15');
mkdirSync(dir, { recursive: true });
const file = join(dir, `board-posts-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(file, JSON.stringify(toDelete.map(({ path, data }) => ({ path, data })), null, 2));
const back = JSON.parse(readFileSync(file, 'utf8'));
if (back.length !== toDelete.length) { console.error(`Backup check failed (${back.length} of ${toDelete.length}). Nothing deleted.`); process.exit(1); }
console.log(`Backup written and re-read: ${file} (${back.length} docs)`);

for (const c of plan) {
  const refs = c.docs.map((d) => d.ref); // the project doc is last
  for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    refs.slice(i, i + BATCH_LIMIT).forEach((r) => batch.delete(r));
    await batch.commit();
  }
  console.log(`deleted ${c.postId}: ${refs.length} doc(s)`);
}
console.log('\nDone. Run with --verify to confirm.');
process.exit(0);
