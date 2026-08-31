#!/usr/bin/env node
/**
 * Slice 1 — Backfill pricing/lifecycle fields onto pre-pricing-model projects.
 *
 * Writes, only where the field is currently ABSENT:
 *   feeStatus       -> 'exempt'   pre-model projects are never charged or blocked
 *   slotActive      -> false      exempt projects must not occupy a slot
 *   professionalIds -> derived from filledSlots (deduped), so a hired pro can
 *                      call requestCompletion, which checks that array
 *
 * IDEMPOTENT: a doc already carrying feeStatus is skipped entirely. ADDITIVE:
 * never overwrites an existing value, never deletes, never touches any other
 * field. Safe to re-run.
 *
 *   DRY RUN (default):  node scripts/backfill-lifecycle.mjs --project bama-af0a0
 *   FOR REAL:           node scripts/backfill-lifecycle.mjs --project bama-af0a0 --commit
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const COLLECTION = 'projects';
const PAGE = 200;
const BATCH_LIMIT = 400; // Firestore hard limit is 500; leave headroom

// ── args ───────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const commit = args.includes('--commit');
const projectId = args[args.indexOf('--project') + 1];

if (!args.includes('--project') || !projectId || projectId.startsWith('--')) {
  console.error('ERROR: --project <projectId> is required. Refusing to guess.');
  process.exit(1);
}

// Guard: we have been running against emulators all session. If that env var is
// still set, admin writes silently go to the emulator instead of production
// (or vice versa) and the counts would be meaningless.
for (const v of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) {
  if (process.env[v]) {
    console.error(`ERROR: ${v}=${process.env[v]} is set. Unset it — this script targets a real project.`);
    process.exit(1);
  }
}

initializeApp({ projectId });
const db = getFirestore();

// ── safety: confirm the collection looks like what we think it is ──────────
const probe = await db.collection(COLLECTION).limit(3).get();
if (probe.empty) {
  console.error(`ERROR: collection '${COLLECTION}' is empty in ${projectId}. Wrong project?`);
  process.exit(1);
}
const looksRight = probe.docs.every((d) => typeof d.data().clientId === 'string');
console.log(`Project:    ${projectId}`);
console.log(`Collection: ${COLLECTION}`);
console.log(`Shape probe (${probe.size} docs): clientId present on all = ${looksRight}`);
for (const d of probe.docs) {
  const p = d.data();
  console.log(`  sample ${d.id}: status=${p.status} filledSlots=${(p.filledSlots ?? []).length} feeStatus=${p.feeStatus ?? '(absent)'}`);
}
if (!looksRight) {
  console.error(`ERROR: docs in '${COLLECTION}' do not carry clientId. This does not look like the projects collection. Aborting.`);
  process.exit(1);
}
console.log(`\nMode: ${commit ? '*** COMMIT — will write ***' : 'DRY RUN — no writes'}\n`);

// ── scan ───────────────────────────────────────────────────────────────────
let scanned = 0;
let alreadyDone = 0;   // has feeStatus -> skipped
let wouldTouch = 0;    // would receive at least one field
let touched = 0;       // actually written
const fieldCounts = { feeStatus: 0, slotActive: 0, professionalIds: 0 };
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
    const p = doc.data();

    if (p.feeStatus !== undefined) { alreadyDone++; continue; }

    const update = { feeStatus: 'exempt' };
    fieldCounts.feeStatus++;

    if (p.slotActive === undefined) { update.slotActive = false; fieldCounts.slotActive++; }

    if (p.professionalIds === undefined) {
      const ids = [...new Set((p.filledSlots ?? []).map((s) => s?.professionalId).filter(Boolean))];
      update.professionalIds = ids;
      fieldCounts.professionalIds++;
    }

    wouldTouch++;
    if (examples.length < 5) examples.push({ id: doc.id, update });

    if (commit) {
      batch.update(doc.ref, update);
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

// ── report ─────────────────────────────────────────────────────────────────
console.log('\n── sample of intended writes ──');
for (const e of examples) console.log(`  ${e.id}: ${JSON.stringify(e.update)}`);

console.log('\n── counts ──');
console.log(`  scanned:                 ${scanned}`);
console.log(`  already had feeStatus:   ${alreadyDone}  (skipped, idempotent)`);
console.log(`  ${commit ? 'touched' : 'would touch'}:${commit ? '                 ' : '             '}${commit ? touched : wouldTouch}`);
console.log(`    feeStatus set:         ${fieldCounts.feeStatus}`);
console.log(`    slotActive set:        ${fieldCounts.slotActive}`);
console.log(`    professionalIds set:   ${fieldCounts.professionalIds}`);

if (commit && touched !== wouldTouch) {
  console.error(`\nWARNING: touched (${touched}) != wouldTouch (${wouldTouch}) — investigate before trusting this run.`);
  process.exit(1);
}
console.log(commit ? '\nDone.' : '\nDry run only — re-run with --commit to write.');
