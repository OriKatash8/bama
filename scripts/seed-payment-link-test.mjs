#!/usr/bin/env node
/**
 * PRODUCTION end-to-end fixture for payment links: one completed project whose ₪6 fee
 * is due NOW, for the test account only. DRY RUN by default.
 *
 *   node scripts/seed-payment-link-test.mjs --prod --uid <test uid>                # show what would be created
 *   node scripts/seed-payment-link-test.mjs --prod --uid <test uid> --apply        # create it
 *   node scripts/seed-payment-link-test.mjs --prod --uid <test uid> --cleanup      # show what would be deleted
 *   node scripts/seed-payment-link-test.mjs --prod --uid <test uid> --cleanup --apply
 *
 * Creates with create() (never overwrites). Cleanup deletes only documents tagged
 * e2eTest, and a paymentLinks pointer only if it points back at the seeded project.
 * It does not delete the `notifications` docs the pushes created, and Grow's links
 * themselves cannot be deleted. See lib/paymentLinkE2e.mjs for why this is safe to run
 * against production.
 */
import './lib/requireProd.mjs';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { assertUid, buildSeed, cleanupPlan, E2E_TAG } from './lib/paymentLinkE2e.mjs';

const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
const cleanup = argv.includes('--cleanup');
let uid;
try { const i = argv.indexOf('--uid'); uid = assertUid(i >= 0 ? argv[i + 1] : undefined); } catch (e) { console.error(`error: ${e.message}`); process.exit(2); }

initializeApp({ projectId: 'bama-af0a0' });
const db = getFirestore();
const ts = (ms) => Timestamp.fromMillis(ms);

if (!cleanup) {
  const user = await db.doc(`users/${uid}`).get();
  if (!user.exists) throw new Error(`users/${uid} does not exist: wrong uid?`);
  const { projectId, project, fee } = buildSeed(uid, Date.now(), ts);
  console.log(`test account: ${uid} (${user.get('displayName') ?? 'no name'})`);
  console.log(`would create projects/${projectId}`, JSON.stringify({ ...project, createdAt: '<now>' }));
  console.log(`would create projects/${projectId}/fees/${uid}`, JSON.stringify({ ...fee, chargeDueAt: '<now - 1h>' }));
  if (!apply) { console.log('dry run; pass --apply to create'); process.exit(0); }
  await db.doc(`projects/${projectId}`).create(project);
  await db.doc(`projects/${projectId}/fees/${uid}`).create(fee);
  console.log(`created ${projectId}. Next: let feeChargeCron run (or run its scheduler job), then watch the fee doc.`);
  process.exit(0);
}

const projects = await db.collection('projects').where('e2eTest', '==', true).where('clientId', '==', uid).get();
const mine = projects.docs.filter((d) => d.id.startsWith(`${E2E_TAG}-`));
if (mine.length === 0) { console.log('nothing to clean up'); process.exit(0); }
let all = [];
for (const p of mine) {
  const feeSnap = await db.collection(`projects/${p.id}/fees`).get();
  const fees = feeSnap.docs.map((d) => ({ id: d.id, data: d.data() }));
  const pointers = {};
  for (const f of fees) {
    const pid = f.data.paymentLink?.processId;
    if (pid) { const s = await db.doc(`paymentLinks/${pid}`).get(); if (s.exists) pointers[pid] = s.data(); }
  }
  const plan = cleanupPlan(p.id, p.data(), fees, pointers);
  if (!plan.ok) { console.error(`REFUSED: ${plan.reason}`); process.exit(1); }
  all = all.concat(plan.paths);
}
console.log(`would delete ${all.length} documents:\n  ${all.join('\n  ')}`);
if (!apply) { console.log('dry run; pass --apply to delete'); process.exit(0); }
for (const path of all) await db.doc(path).delete();
console.log('deleted');
