#!/usr/bin/env node
/**
 * Backfill `category` onto existing community chats.
 *
 * The category a professional picks when requesting a community is stored on the
 * `communityRequests` doc, but older approvals created the `chats` doc without
 * copying it. This one-time script copies the category from each approved
 * request to its matching community chat (matched by ownerId + name) when the
 * chat has no category yet.
 *
 * Uses the Firebase Admin SDK (Application Default Credentials), which bypasses
 * security rules — same setup as scripts/set-admin.mjs. Run:
 *   node scripts/backfill-community-categories.mjs
 * (Optionally `gcloud auth application-default login` first if ADC isn't set.)
 */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({ projectId: 'bama-af0a0' });
const db = getFirestore();

const requestsSnap = await db.collection('communityRequests').where('status', '==', 'approved').get();
console.log(`Found ${requestsSnap.size} approved community requests.`);

let updated = 0;
let skipped = 0;

for (const reqDoc of requestsSnap.docs) {
  const req = reqDoc.data();
  if (!req.category) { skipped++; continue; }

  // Match the community chat by owner + name.
  const chatsSnap = await db
    .collection('chats')
    .where('type', '==', 'community')
    .where('ownerId', '==', req.requesterId)
    .get();

  const target = chatsSnap.docs.find(
    (d) => d.data().name === req.name && !d.data().category,
  );
  if (!target) { skipped++; continue; }

  await target.ref.update({ category: req.category });
  console.log(`  ✓ ${target.id}  "${req.name}"  →  ${req.category}`);
  updated++;
}

console.log(`\nDone. Updated ${updated} community chat(s); skipped ${skipped}.`);
process.exit(0);
