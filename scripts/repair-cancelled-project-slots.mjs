#!/usr/bin/env node
/**
 * One-time repair for iE5bnmC138mftNwdYvyg.
 *
 * hireProfessional used to have no project-status guard, so a hire landed on this
 * project AFTER cancelProject had emptied `slotHolders` and voided the fees. The
 * result is a state cancelProject's postcondition (completion.ts:207-223) cannot
 * produce: status 'cancelled' and feeDue 0, but the pro still occupying a slot
 * that nothing will ever free — one of their two slots, held forever.
 *
 * The guard (hire.ts, canHireOnStatus) stops the next one; it does not undo this.
 *
 * Restores exactly cancelProject's postcondition, nothing more:
 *   projects/{id}.slotHolders            -> []
 *   projects/{id}.slotActive             -> false
 *   projects/{id}/fees/{proId}.slotActive -> false
 *
 * feeDue is already 0 and is left untouched; no money moves. Idempotent — a
 * second run finds nothing to do. Verifies before, after, and re-runs the
 * shape check across every project.
 *
 *   node scripts/repair-cancelled-project-slots.mjs [--apply]
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APPLY = process.argv.includes('--apply');
const PROJECT_ID = 'iE5bnmC138mftNwdYvyg';

initializeApp({ projectId: 'bama-af0a0' });
const db = getFirestore();

/** Every project whose fee docs still claim a slot on a dead project. */
async function findBadShape() {
  const projects = await db.collection('projects').get();
  const bad = [];
  for (const p of projects.docs) {
    const d = p.data();
    if (!['cancelled', 'completed'].includes(d.status)) continue;
    const fees = await db.collection(`projects/${p.id}/fees`).get();
    const live = fees.docs.filter((f) => f.data().slotActive === true);
    // On a COMPLETED project a pro who still owes legitimately keeps their slot,
    // so only flag it when the project's own slotHolders disagrees — and on a
    // CANCELLED project nobody should hold one at all.
    const holders = d.slotHolders ?? [];
    if (d.status === 'cancelled' && (live.length || holders.length)) {
      bad.push({ id: p.id, status: d.status, holders, live: live.map((f) => f.id) });
    } else if (d.status === 'completed' && live.some((f) => !holders.includes(f.id))) {
      bad.push({ id: p.id, status: d.status, holders, live: live.map((f) => f.id) });
    }
  }
  return bad;
}

console.log(`\n${APPLY ? 'APPLY' : 'DRY RUN (pass --apply to write)'}\n`);

const projRef = db.collection('projects').doc(PROJECT_ID);
const before = await projRef.get();
if (!before.exists) { console.error('project not found'); process.exit(1); }
const bd = before.data();
const feesSnap = await db.collection(`projects/${PROJECT_ID}/fees`).get();

console.log('BEFORE');
console.log(`  projects/${PROJECT_ID}.status       = ${bd.status}`);
console.log(`  projects/${PROJECT_ID}.slotHolders  = ${JSON.stringify(bd.slotHolders ?? [])}`);
console.log(`  projects/${PROJECT_ID}.slotActive   = ${bd.slotActive}`);
for (const f of feesSnap.docs) {
  console.log(`  fees/${f.id}.slotActive = ${f.data().slotActive}  (feeDue=${f.data().feeDue}, feePaid=${f.data().feePaid === true})`);
}

if (bd.status !== 'cancelled') {
  console.error(`\nREFUSING: expected status 'cancelled', found '${bd.status}'. Nothing written.`);
  process.exit(1);
}
// No fee check here, deliberately. This used to refuse while any fee doc still
// showed feeDue > 0 ("freeing a slot would strand it") — the same pattern removed
// from freeSlot and confirmCompletion, and for the same reason: money owed must
// never decide whether a slot is occupied. A cancelled project holds nobody, paid
// or not. The status guard above is the real precondition.

if (APPLY) {
  const batch = db.batch();
  batch.update(projRef, { slotHolders: [], slotActive: false });
  for (const f of feesSnap.docs) batch.update(f.ref, { slotActive: false });
  await batch.commit();
  console.log('\nwrote 1 project + ' + feesSnap.size + ' fee doc(s)');

  const after = await projRef.get();
  const ad = after.data();
  const afterFees = await db.collection(`projects/${PROJECT_ID}/fees`).get();
  console.log('\nAFTER');
  console.log(`  projects/${PROJECT_ID}.status       = ${ad.status}`);
  console.log(`  projects/${PROJECT_ID}.slotHolders  = ${JSON.stringify(ad.slotHolders ?? [])}`);
  console.log(`  projects/${PROJECT_ID}.slotActive   = ${ad.slotActive}`);
  for (const f of afterFees.docs) {
    console.log(`  fees/${f.id}.slotActive = ${f.data().slotActive}  (feeDue=${f.data().feeDue}, feePaid=${f.data().feePaid === true})`);
  }
  const ok = (ad.slotHolders ?? []).length === 0
    && ad.slotActive === false
    && afterFees.docs.every((f) => f.data().slotActive === false);
  console.log(`\nASSERT postcondition matches cancelProject: ${ok ? 'PASS' : 'FAIL'}`);
  if (!ok) process.exit(1);
}

console.log('\nSHAPE CHECK across every project:');
const bad = await findBadShape();
for (const b of bad) console.log(`  ${b.id} (${b.status}) holders=${JSON.stringify(b.holders)} liveFees=${JSON.stringify(b.live)}`);
console.log(`  projects with a fee doc still slotActive on a cancelled/completed project: ${bad.length}`);
console.log(`  ${bad.length === 0 ? 'PASS — none' : (APPLY ? 'FAIL' : '(expected 1 before --apply)')}\n`);
process.exit(APPLY && bad.length !== 0 ? 1 : 0);
