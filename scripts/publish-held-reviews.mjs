#!/usr/bin/env node
/**
 * Release every held review.
 *
 * Reviews used to be withheld (`published: false`) while the professional they
 * are about still owed their platform fee, and released either on payment or by
 * a 60-day cron sweep. That hold is gone — reviews publish on completion,
 * unconditionally — but turning the trigger off only affects NEW reviews.
 * Anything already held stays invisible until the 60-day sweep reaches it.
 *
 * This publishes them now. Sets `published: true` and, only where it is absent,
 * `visibleAt`, so a review that was published once keeps its original date.
 *
 * IDEMPOTENT: queries only `published == false`, so a second run finds nothing.
 *
 *   DRY RUN (default):  node scripts/publish-held-reviews.mjs --project bama-af0a0
 *   FOR REAL:           node scripts/publish-held-reviews.mjs --project bama-af0a0 --commit
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const PAGE = 200;
const BATCH_LIMIT = 400; // Firestore hard limit is 500; leave headroom

const args = process.argv.slice(2);
const commit = args.includes('--commit');
const projectId = args[args.indexOf('--project') + 1];

if (!args.includes('--project') || !projectId || projectId.startsWith('--')) {
  console.error('ERROR: --project <projectId> is required. Refusing to guess.');
  process.exit(1);
}
for (const v of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) {
  if (process.env[v]) {
    console.error(`ERROR: ${v}=${process.env[v]} is set. Unset it — this script targets a real project.`);
    process.exit(1);
  }
}

initializeApp({ projectId });
const db = getFirestore();

const probe = await db.collection('reviews').limit(1).get();
if (probe.empty) {
  console.error(`ERROR: no 'reviews' collection in ${projectId}. Wrong project?`);
  process.exit(1);
}

console.log(`Project: ${projectId}`);
console.log(`Mode:    ${commit ? '*** COMMIT — will write ***' : 'DRY RUN — no writes'}\n`);

// The exact query the released state is defined by. Equality on a single field,
// so no composite index is involved.
let last;
let found = 0;
let written = 0;
const ids = [];

for (;;) {
  let q = db.collection('reviews').where('published', '==', false).limit(PAGE);
  if (last) q = q.startAfter(last);
  const snap = await q.get();
  if (snap.empty) break;

  found += snap.size;
  for (const d of snap.docs) {
    ids.push(d.id);
    console.log(`  held ${d.id}  project=${d.data().projectId ?? '(none)'} pro=${d.data().professionalId ?? '(none)'}`);
  }

  if (commit) {
    for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
      const batch = db.batch();
      for (const d of snap.docs.slice(i, i + BATCH_LIMIT)) {
        const update = { published: true };
        // Only set visibleAt where it is absent: a review that was published
        // once and later re-held should keep the date it first became visible.
        if (d.data().visibleAt === undefined) update.visibleAt = FieldValue.serverTimestamp();
        batch.update(d.ref, update);
      }
      await batch.commit();
      written += Math.min(BATCH_LIMIT, snap.docs.length - i);
    }
  }

  if (snap.size < PAGE) break;
  last = snap.docs[snap.docs.length - 1];
}

console.log(`\nHeld reviews found: ${found}`);

if (!commit) {
  console.log(found === 0 ? 'Nothing to do.' : `DRY RUN — would publish ${found}. Re-run with --commit.`);
  process.exit(0);
}

// Read back and ASSERT. A migration that reports success without confirming it
// is the failure catalogued in docs/known-issues-silent-failures.md.
const survivors = await db.collection('reviews').where('published', '==', false).get();
if (!survivors.empty) {
  console.error(`\nFAILED verification — ${survivors.size} review(s) still held: ${survivors.docs.map((d) => d.id).join(', ')}`);
  process.exit(1);
}
for (const id of ids) {
  const after = await db.collection('reviews').doc(id).get();
  if (after.data()?.published !== true) {
    console.error(`\nFAILED verification — ${id} did not take the update.`);
    process.exit(1);
  }
}
console.log(`Published ${written}. Verified: 0 reviews remain held, and all ${ids.length} touched docs read back published:true.`);
