#!/usr/bin/env node
/**
 * Backfill `projects/{id}.endedEngagementIds` — who has finished their part, so
 * their price is frozen (f64e3a4).
 *
 * The server writes the array in applyDerivedProjectState, on every engagement
 * state change. Engagements that ended BEFORE that code was deployed never got
 * one, so the client keeps offering "update price" on them until something else
 * moves the project. This writes what the derivation would write, now.
 *
 * Writes ONLY `endedEngagementIds`, and only where it differs from the fee docs
 * (absent + nobody finished is left absent). Never deletes, never touches another
 * field. IDEMPOTENT: a second run finds nothing to do.
 *
 * Run AFTER the functions deploy, or a pre-deploy derivation could not have
 * written the array anyway and the two would briefly disagree for no reason.
 *
 * The frozen predicate comes from the COMPILED server code, so build first:
 *   (cd functions && npm run build)
 *
 *   DRY RUN (default):  node scripts/backfill-ended-engagement-ids.mjs --project bama-af0a0
 *   FOR REAL:           node scripts/backfill-ended-engagement-ids.mjs --project bama-af0a0 --commit
 */
import { createRequire } from 'node:module';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { planEndedEngagementIds } from './lib/endedEngagements.mjs';

const BATCH_LIMIT = 400; // Firestore hard limit is 500; leave headroom

// ── args ───────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const commit = args.includes('--commit');
const projectId = args[args.indexOf('--project') + 1];

if (!args.includes('--project') || !projectId || projectId.startsWith('--')) {
  console.error('ERROR: --project <firebaseProjectId> is required. Refusing to guess.');
  process.exit(1);
}

for (const v of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) {
  if (process.env[v]) {
    console.error(`ERROR: ${v}=${process.env[v]} is set. Unset it — this script targets a real project.`);
    process.exit(1);
  }
}

// ── the server's own predicate ─────────────────────────────────────────────
const require = createRequire(import.meta.url);
let engagementPriceFrozen;
try {
  ({ engagementPriceFrozen } = require('../functions/lib/lifecycle/priceRequestPolicy.js'));
} catch (err) {
  console.error('ERROR: functions/lib is not built. Run: (cd functions && npm run build)');
  console.error(String(err));
  process.exit(1);
}
// A stale build would silently apply an old rule. These are the two cases that
// matter: a completion freezes, the open two-step end request does not.
if (typeof engagementPriceFrozen !== 'function'
  || engagementPriceFrozen('completed') !== true
  || engagementPriceFrozen('end_requested_by_pro') !== false
  || engagementPriceFrozen('hired') !== false) {
  console.error('ERROR: functions/lib/lifecycle/priceRequestPolicy.js does not behave like HEAD. Rebuild functions.');
  process.exit(1);
}

initializeApp({ projectId });
const db = getFirestore();

console.log(`Project: ${projectId}`);
console.log(`Mode:    ${commit ? 'COMMIT (writing)' : 'DRY RUN (no writes)'}`);
console.log('');

// ── scan ───────────────────────────────────────────────────────────────────
const projects = await db.collection('projects').get();
if (projects.empty) {
  console.error(`ERROR: no projects in ${projectId}. Wrong project?`);
  process.exit(1);
}

const writes = [];
const anomalies = [];
let scanned = 0;
let alreadyRight = 0;

for (const doc of projects.docs) {
  scanned++;
  const project = doc.data();
  const feesSnap = await doc.ref.collection('fees').get();
  const fees = feesSnap.docs.map((d) => ({ ...d.data(), _docId: d.id }));
  const plan = planEndedEngagementIds(project.endedEngagementIds, fees, engagementPriceFrozen);

  if (plan.missingProfessionalId.length > 0) {
    anomalies.push({ id: doc.id, docs: plan.missingProfessionalId });
  }
  if (!plan.write) { alreadyRight++; continue; }

  writes.push({ ref: doc.ref, next: plan.next });
  const statuses = fees.map((f) => `${f._docId}=${f.engagementStatus ?? '(none)'}`).join(', ');
  console.log(`  ${doc.id}  "${project.title ?? ''}"  status=${project.status}`);
  console.log(`      current: ${JSON.stringify(project.endedEngagementIds ?? '(absent)')}`);
  console.log(`      next:    ${JSON.stringify(plan.next)}`);
  console.log(`      fees:    ${statuses}`);
}

console.log('');
console.log(`Scanned:           ${scanned}`);
console.log(`Already correct:   ${alreadyRight}`);
console.log(`To write:          ${writes.length}`);
if (anomalies.length > 0) {
  // derive.ts skips these too, so the backfill matches it — but a finished
  // engagement that cannot be named will keep its price unfrozen. Worth a look.
  console.log(`Ended fee docs with no professionalId (skipped, as derive does): ${anomalies.length} project(s)`);
  for (const a of anomalies) console.log(`  ${a.id}: ${a.docs.join(', ')}`);
}

if (!commit) {
  console.log('');
  console.log('DRY RUN — nothing written. Re-run with --commit to apply.');
  process.exit(0);
}

// ── write ──────────────────────────────────────────────────────────────────
let written = 0;
for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
  const batch = db.batch();
  for (const w of writes.slice(i, i + BATCH_LIMIT)) {
    batch.update(w.ref, { endedEngagementIds: w.next });
  }
  await batch.commit();
  written += Math.min(BATCH_LIMIT, writes.length - i);
}
console.log('');
console.log(`Written: ${written}`);

// ── verify: a second pass must find nothing to do ──────────────────────────
let stillWrong = 0;
for (const w of writes) {
  const fresh = (await w.ref.get()).data();
  const fees = (await w.ref.collection('fees').get()).docs.map((d) => ({ ...d.data(), _docId: d.id }));
  if (planEndedEngagementIds(fresh?.endedEngagementIds, fees, engagementPriceFrozen).write) stillWrong++;
}
console.log(`Verify: ${stillWrong === 0 ? 'every written project now matches its fee docs' : `${stillWrong} project(s) still differ — investigate`}`);
process.exit(stillWrong === 0 ? 0 : 1);
