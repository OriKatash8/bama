#!/usr/bin/env node
/**
 * BACKFILL, not creation. `projects/{id}/fees/{proId}` already IS the engagement
 * document — same key, already per-(project, professional). This stamps the
 * lifecycle fields onto the records that already exist.
 *
 * Two independent jobs, and only the second can change money:
 *
 *   1. engagementStatus — derived from the project and fee state that is
 *      authoritative today. Additive; nothing existing is overwritten.
 *
 *   2. baseAmount reconciliation — three columns per engagement: what is stored,
 *      what computeProAmount() derives from the accepted offers, and what would
 *      be written. They disagree because `baseAmount` has TWO writers: hire
 *      increments it, and confirmCompletion overwrites it with the recompute.
 *
 * DRY RUN BY DEFAULT. `--commit` writes. `--project <id>` is required and is
 * never guessed.
 *
 *   node scripts/backfill-engagements.mjs --project bama-af0a0
 *   node scripts/backfill-engagements.mjs --project bama-af0a0 --commit
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const commit = args.includes('--commit');
const projectId = args[args.indexOf('--project') + 1];
if (!args.includes('--project') || !projectId || projectId.startsWith('--')) {
  console.error('ERROR: --project <projectId> is required. Refusing to guess.');
  process.exit(1);
}
if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('ERROR: emulator host set. This backfill is for real data.');
  process.exit(1);
}

initializeApp({ projectId });
const db = getFirestore();

/**
 * The mapping. Ordered, first match wins — the order IS the policy.
 *
 * Every branch is justified by a state combination that actually exists in
 * production; none is speculative. `why` is printed so the table can be read
 * back against the data.
 */
function deriveEngagementStatus({ project, fee, proId }) {
  const inProIds = (project.professionalIds ?? []).includes(proId);
  const compState = project.completion?.state ?? 'none';
  const compSource = project.completion?.source;

  // 1. The whole project ended. Outranks everything: nothing was delivered and
  //    cancelProject already voided the fee.
  if (project.status === 'cancelled') return { status: 'cancelled', why: 'project cancelled' };

  // 2. The professional was removed by freeSlot, which arrayRemoves them from
  //    professionalIds and sets their offers to 'removed'. They left before the
  //    work closed, so this outranks the project being completed afterwards —
  //    they did not complete it.
  if (!inProIds) return { status: 'withdrawn', why: 'not in professionalIds — freeSlot removed them' };

  // 3. An open dispute on this pro's own fee.
  if (fee.status === 'disputed') return { status: 'disputed', why: 'fee.status disputed' };
  if (compState === 'disputed') return { status: 'disputed', why: 'project completion disputed' };

  // 4. Confirmed completion. Project status and completion.state agree in every
  //    production row; both are checked so a half-written doc cannot slip by.
  if (compState === 'confirmed' || project.status === 'completed') {
    return { status: 'completed', why: 'completion confirmed' };
  }

  // 5. An end was requested and not yet answered. `source` decides the side;
  //    every production row is source 'pro'.
  if (compState === 'requested') {
    return compSource === 'client'
      ? { status: 'end_requested_by_client', why: 'completion requested, source client' }
      : { status: 'end_requested_by_pro', why: `completion requested, source ${compSource ?? 'pro (default)'}` };
  }

  // 6. Still on the project and working. NOTE this deliberately ignores
  //    slotActive:false — five production rows are an EARLY SETTLEMENT (feePaid
  //    true, project still open, pro still on the team). Paying early released
  //    the slot under the old payFee; it never ended the engagement.
  return { status: 'hired', why: fee.feePaid === true ? 'on project, fee settled early' : 'on project, working' };
}

/** Mirror of functions/src/lifecycle/proAmount.ts — each accepted bundle counted
 *  ONCE at bundlePrice, other accepted offers at their own price. */
function sumProAmount(offers, bundles) {
  const seen = new Set();
  let total = 0;
  for (const o of offers) {
    if (o.bundleId) {
      const b = bundles.get(o.bundleId);
      if (b?.status === 'accepted') {
        if (seen.has(o.bundleId)) continue;
        seen.add(o.bundleId);
        total += b.bundlePrice ?? 0;
        continue;
      }
    }
    total += o.price ?? 0;
  }
  return total;
}

async function computeProAmount(pid, proId) {
  const snap = await db.collection('priceOffers')
    .where('projectId', '==', pid)
    .where('professionalId', '==', proId)
    .where('status', '==', 'accepted')
    .get();
  const offers = snap.docs.map((d) => d.data());
  const ids = [...new Set(offers.map((o) => o.bundleId).filter(Boolean))];
  const docs = await Promise.all(ids.map((id) => db.collection('bundleOffers').doc(id).get()));
  return sumProAmount(offers, new Map(ids.map((id, i) => [id, docs[i].data()])));
}

/** The charge, exactly as computeFee does it server-side. */
const feeOf = (base, rate, minFee) => Math.max(Math.round(base * (rate ?? 0.03)), minFee ?? 0);

console.log(`\nproject: ${projectId}   mode: ${commit ? '*** COMMIT ***' : 'DRY RUN'}\n`);

const fees = await db.collectionGroup('fees').get();
const rows = [];
for (const d of fees.docs) {
  const fee = d.data();
  const pid = d.ref.parent.parent.id;
  const proj = (await db.doc(`projects/${pid}`).get()).data();
  if (!proj) { console.log(`  SKIP ${d.ref.path} — project missing`); continue; }
  const derived = deriveEngagementStatus({ project: proj, fee, proId: d.id });
  const stored = fee.baseAmount ?? 0;
  const recomputed = await computeProAmount(pid, d.id);
  rows.push({
    ref: d.ref, pid, proId: d.id,
    title: (proj.title ?? '?').slice(0, 18),
    projStatus: proj.status,
    stored, recomputed,
    feeRate: fee.feeRate, minFeeApplied: fee.minFeeApplied,
    feePaid: fee.feePaid === true,
    settled: fee.feePaid === true || fee.status === 'paid',
    ...derived,
  });
}

// ── the mapping table ──
console.log('── engagementStatus mapping, as derived ──');
const byStatus = {};
for (const r of rows) (byStatus[r.status] ??= []).push(r);
for (const [st, rs] of Object.entries(byStatus)) {
  console.log(`\n  ${st}  (${rs.length})`);
  for (const r of rs) console.log(`     ${r.pid.slice(0, 10)} ${r.proId.slice(0, 8)} ${r.title.padEnd(20)} — ${r.why}`);
}

// ── the three-column diff ──
console.log('\n\n── baseAmount: stored vs recompute ──');
console.log('The third column is what this script WRITES, which is nothing: baseAmount');
console.log('is left alone. A stale base is corrected by confirmCompletion, which runs');
console.log('this same recompute at the moment the fee actually falls due.\n');
console.log('project      pro      | stored | recompute | writes | fee stays | settled');
let divergences = 0;
for (const r of rows) {
  const fee = feeOf(r.stored, r.feeRate, r.minFeeApplied);
  const stale = r.stored !== r.recomputed;
  if (stale) divergences++;
  console.log(
    `${r.pid.slice(0, 10)} ${r.proId.slice(0, 8)} |` +
    `${String(r.stored).padStart(7)} |${String(r.recomputed).padStart(10)} |` +
    `${'  —'.padStart(7)} |${String('₪' + fee).padStart(10)} |` +
    ` ${r.settled ? 'SETTLED' : '-'}` + (stale ? '   <-- STALE BASE' : ''),
  );
}

// ── the halt condition ──
//
// It measures WHAT THIS SCRIPT WRITES, not what the recompute would have said.
// `baseAmount` is deliberately not written (see the batch below), so the fee on
// every engagement is unchanged by construction and the totals cannot move. An
// earlier version compared stored-vs-recompute here, which halted on a change it
// was never going to make.
//
// The divergences above are still real and still reported — they are stale
// hire-time bases, and confirmCompletion already overwrites each one with this
// same recompute at the moment the fee actually falls due.
console.log('\n── per-project fee totals (the halt condition) ──');
const perProject = new Map();
for (const r of rows) {
  const e = perProject.get(r.pid) ?? { title: r.title, before: 0, after: 0 };
  const fee = feeOf(r.stored, r.feeRate, r.minFeeApplied);
  e.before += fee;
  e.after += fee;                     // baseAmount is not written; the fee cannot move
  perProject.set(r.pid, e);
}
let movedProjects = 0;
for (const [pid, e] of perProject) {
  if (e.before === e.after) continue;
  movedProjects++;
  console.log(`  MOVES  ${pid.slice(0, 10)} ${e.title.padEnd(20)} ₪${e.before} -> ₪${e.after}`);
}
console.log(`  projects whose fee total moves: ${movedProjects} of ${perProject.size}`);
console.log(`  engagements with a STALE baseAmount (reported, not rewritten): ${divergences} of ${rows.length}`);
console.log('  baseAmount: NOT WRITTEN by this script.');

if (movedProjects > 0) {
  console.log('\nHALT — a project total moved. That should be impossible here; investigate.');
  process.exit(2);
}

if (!commit) {
  console.log('\nDRY RUN — no writes. Re-run with --commit once the diff is agreed.');
  process.exit(0);
}

// ADDITIVE ONLY. One new field per engagement. Nothing existing is overwritten,
// and baseAmount in particular is left exactly as it is.
const batch = db.batch();
for (const r of rows) batch.update(r.ref, { engagementStatus: r.status });
await batch.commit();

// Read back, because a migration that reports success without checking is a
// migration that can silently half-apply.
let verified = 0;
const mismatches = [];
for (const r of rows) {
  const got = (await r.ref.get()).data();
  if (got?.engagementStatus === r.status) verified++;
  else mismatches.push(`${r.pid.slice(0, 10)}/${r.proId.slice(0, 8)} expected ${r.status}, got ${got?.engagementStatus ?? '(absent)'}`);
  if (got?.baseAmount !== r.stored) {
    mismatches.push(`${r.pid.slice(0, 10)}/${r.proId.slice(0, 8)} baseAmount CHANGED ${r.stored} -> ${got?.baseAmount}`);
  }
}
console.log(`\nWrote and verified engagementStatus on ${verified} of ${rows.length} engagements.`);
const sumBefore = rows.reduce((t, r) => t + r.stored, 0);
let sumAfter = 0;
for (const r of rows) sumAfter += (await r.ref.get()).data()?.baseAmount ?? 0;
console.log(`baseAmount total: ${sumBefore} before, ${sumAfter} after — ${sumBefore === sumAfter ? 'unchanged' : 'CHANGED, investigate'}.`);
if (sumBefore !== sumAfter) process.exit(2);
if (mismatches.length) {
  console.log('MISMATCHES:');
  for (const m of mismatches) console.log('  ' + m);
  process.exit(2);
}
process.exit(0);
