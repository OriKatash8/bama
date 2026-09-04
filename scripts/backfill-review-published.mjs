#!/usr/bin/env node
/**
 * Backfill `published: true` onto reviews that have no `published` field.
 *
 * WHY: the review hold is expressed as `published: false`, and every read path
 * treats a MISSING field as visible (`published !== false`) so legacy reviews
 * kept working without a migration. That default is what blocks tightening the
 * professional's own-profile query to `where('published','==',true)` — such a
 * query silently drops every field-less document and would wipe existing
 * ratings. Materialising the default makes the constrained query safe.
 *
 * Semantics are unchanged: absent already MEANS visible, so writing `true` is
 * what those documents already resolve to.
 *
 * IDEMPOTENT: a document that already carries `published` (true OR false) is
 * skipped. ADDITIVE: never overwrites, never deletes, touches no other field.
 * A held review (`published: false`) is never disturbed.
 *
 *   DRY RUN (default):  node scripts/backfill-review-published.mjs --project bama-af0a0
 *   FOR REAL:           node scripts/backfill-review-published.mjs --project bama-af0a0 --commit
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const COLLECTION = 'reviews';
const PAGE = 200;
const BATCH_LIMIT = 400; // Firestore's hard limit is 500 — leave headroom

const args = process.argv.slice(2);
const commit = args.includes('--commit');
const projectId = args[args.indexOf('--project') + 1];

if (!args.includes('--project') || !projectId || projectId.startsWith('--')) {
  console.error('ERROR: --project <projectId> is required. Refusing to guess.');
  process.exit(1);
}

// We run against emulators constantly; a stray env var would silently redirect
// every write and make the counts meaningless.
for (const v of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) {
  if (process.env[v]) {
    console.error(`ERROR: ${v}=${process.env[v]} is set. Unset it — this targets a real project.`);
    process.exit(1);
  }
}

initializeApp({ projectId });
const db = getFirestore();

// Shape probe — confirm this collection is what we think it is before writing.
const probe = await db.collection(COLLECTION).limit(3).get();
if (probe.empty) {
  console.error(`ERROR: collection '${COLLECTION}' is empty in ${projectId}. Wrong project?`);
  process.exit(1);
}
const looksRight = probe.docs.every((d) => typeof d.data().professionalId === 'string');
console.log(`Project:    ${projectId}`);
console.log(`Collection: ${COLLECTION}`);
console.log(`Shape probe (${probe.size} docs): professionalId present on all = ${looksRight}`);
if (!looksRight) {
  console.error(`ERROR: docs in '${COLLECTION}' do not carry professionalId. Aborting.`);
  process.exit(1);
}
console.log(`\nMode: ${commit ? '*** COMMIT — will write ***' : 'DRY RUN — no writes'}\n`);

let scanned = 0;
let alreadyTrue = 0;
let heldSkipped = 0;   // published:false — the hold, never touched
let wouldTouch = 0;
let touched = 0;
const examples = [];

let last = null;
for (;;) {
  let q = db.collection(COLLECTION).orderBy('__name__').limit(PAGE);
  if (last) q = q.startAfter(last);
  const snap = await q.get();
  if (snap.empty) break;

  let batch = db.batch();
  let inBatch = 0;

  for (const doc of snap.docs) {
    scanned++;
    const p = doc.data().published;
    if (p === true) { alreadyTrue++; continue; }
    if (p === false) { heldSkipped++; continue; }   // a live hold — leave it alone

    wouldTouch++;
    if (examples.length < 5) {
      examples.push({ id: doc.id, professionalId: doc.data().professionalId });
    }
    if (commit) {
      batch.update(doc.ref, { published: true });
      inBatch++;
      if (inBatch >= BATCH_LIMIT) {
        await batch.commit();
        touched += inBatch;
        batch = db.batch();
        inBatch = 0;
      }
    }
  }

  if (commit && inBatch > 0) { await batch.commit(); touched += inBatch; }

  last = snap.docs[snap.docs.length - 1];
  if (snap.size < PAGE) break;
  console.log(`  …scanned ${scanned}`);
}

console.log('── sample of intended writes ──');
for (const e of examples) console.log(`  ${e.id}: published -> true  (pro ${e.professionalId})`);

console.log('\n── counts ──');
console.log(`  scanned:                    ${scanned}`);
console.log(`  already published:true:     ${alreadyTrue}  (skipped)`);
console.log(`  held (published:false):     ${heldSkipped}  (skipped — the hold)`);
console.log(`  ${commit ? 'touched' : 'would touch'}:${commit ? '                    ' : '                ' }${commit ? touched : wouldTouch}`);

if (commit && touched !== wouldTouch) {
  console.error(`\nWARNING: touched (${touched}) != wouldTouch (${wouldTouch}) — investigate before trusting this run.`);
  process.exit(1);
}
