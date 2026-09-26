#!/usr/bin/env node
/**
 * DELETE the `email` field from every `users/{uid}` document.
 *
 * WHY: `users/{uid}` is readable by every signed-in user — displayName and
 * photoURL are needed everywhere — so an `email` field sitting beside them let
 * one throwaway account enumerate the address of every person on the platform.
 * The field existed only so the admin screen could run
 * where('email','==',term) from the client. Firebase Auth is the authoritative
 * store and always was; that lookup is now the adminFindUser callable, which
 * asks Auth with the Admin SDK.
 *
 * THIS IS THE ONE DESTRUCTIVE SCRIPT IN THIS SET. It removes data. It is safe
 * because Auth keeps every address independently — deleting here loses nothing
 * that is not held authoritatively elsewhere — but verify that before running:
 *
 *   --verify-auth  reads each user's Auth record BEFORE deleting and SKIPS any
 *                  document whose email is not present in Auth, listing them at
 *                  the end. Slower (one Auth read per user) and worth it on the
 *                  first real run.
 *
 * ORDER DOES NOT MATTER. The firestore.rules guard checks the DIFF on update,
 * not the resulting document, so a user whose doc still has the field can still
 * edit their profile. Deploy the rules before or after this; either works.
 *
 * IDEMPOTENT: a document with no `email` is skipped. Touches no other field.
 *
 *   DRY RUN (default):  node scripts/backfill-remove-user-email.mjs --project bama-af0a0
 *   VERIFY FIRST:       node scripts/backfill-remove-user-email.mjs --project bama-af0a0 --verify-auth
 *   FOR REAL:           node scripts/backfill-remove-user-email.mjs --project bama-af0a0 --commit --verify-auth
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const COLLECTION = 'users';
const PAGE = 200;
const BATCH_LIMIT = 400; // Firestore's hard limit is 500 — leave headroom

const args = process.argv.slice(2);
const commit = args.includes('--commit');
const verifyAuth = args.includes('--verify-auth');
const projectIdx = args.indexOf('--project');
const projectId = projectIdx >= 0 ? args[projectIdx + 1] : process.env.GCLOUD_PROJECT;

if (!projectId) {
  console.error('Usage: node scripts/backfill-remove-user-email.mjs --project <id> [--verify-auth] [--commit]');
  process.exit(1);
}

const app = initializeApp({ projectId });
const db = getFirestore(app);
const auth = getAuth(app);

console.log(`\n${commit ? 'COMMIT' : 'DRY RUN'} — project ${projectId}`);
console.log(`Auth verification: ${verifyAuth ? 'ON (skips docs whose email is missing from Auth)' : 'OFF'}\n`);

let scanned = 0;
let toClear = 0;
let cleared = 0;
let alreadyClean = 0;
const skipped = [];

let cursor = null;
let batch = db.batch();
let batched = 0;

async function flush() {
  if (batched === 0) return;
  if (commit) await batch.commit();
  cleared += batched;
  batch = db.batch();
  batched = 0;
}

for (;;) {
  let q = db.collection(COLLECTION).orderBy('__name__').limit(PAGE);
  if (cursor) q = q.startAfter(cursor);
  const snap = await q.get();
  if (snap.empty) break;

  for (const doc of snap.docs) {
    scanned++;
    const email = doc.get('email');
    if (email === undefined) { alreadyClean++; continue; }

    if (verifyAuth) {
      const rec = await auth.getUser(doc.id).catch(() => null);
      // Case-insensitive: Auth normalises, the document may not have.
      const inAuth = rec?.email && String(rec.email).toLowerCase() === String(email).toLowerCase();
      if (!inAuth) {
        skipped.push({ uid: doc.id, docEmail: email, authEmail: rec?.email ?? '(no auth record)' });
        continue;
      }
    }

    toClear++;
    batch.update(doc.ref, { email: FieldValue.delete() });
    batched++;
    if (batched >= BATCH_LIMIT) await flush();
  }

  cursor = snap.docs[snap.docs.length - 1];
  if (snap.size < PAGE) break;
}
await flush();

console.log(`scanned          ${scanned}`);
console.log(`already clean    ${alreadyClean}`);
console.log(`${commit ? 'cleared' : 'would clear'}      ${commit ? cleared : toClear}`);

if (skipped.length > 0) {
  console.log(`\nSKIPPED ${skipped.length} — the document's email is NOT in Auth, so deleting it`);
  console.log('would lose the only copy. Inspect these by hand before deciding:\n');
  for (const s of skipped) {
    console.log(`  ${s.uid}  doc=${s.docEmail}  auth=${s.authEmail}`);
  }
}

if (!commit) console.log('\nDry run — nothing written. Re-run with --commit to apply.');
process.exit(0);
