#!/usr/bin/env node
/**
 * Seed and verify config/appLinks, the config every invite link is built from.
 *
 *   node scripts/seed-app-links.mjs --project bama-af0a0 --dry-run   print what would be written
 *   node scripts/seed-app-links.mjs --project bama-af0a0             write (refuses to overwrite)
 *   node scripts/seed-app-links.mjs --project bama-af0a0 --force     write, overwriting
 *   node scripts/seed-app-links.mjs --project bama-af0a0 --verify    READ-ONLY: read back and assert
 *
 * Targets the emulator when FIRESTORE_EMULATOR_HOST is set, otherwise PRODUCTION
 * (Application Default Credentials). The target is printed before anything happens.
 *
 * --verify exits non-zero unless the stored doc passes the same bare-https-origin
 * rule createCommunityInvite enforces. A half-seeded config would otherwise surface
 * later as a failed-precondition that reads like a code bug.
 *
 * Switching to the real domain: change APP_LINKS_DEV.baseUrl (scripts/lib/appLinks.mjs)
 * or pass --base-url, then run with --force and --verify.
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { APP_LINKS_DEV, validateAppLinks } from './lib/appLinks.mjs';

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const valueOf = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : undefined; };

const projectId = valueOf('--project');
if (!projectId || projectId.startsWith('--')) {
  console.error('ERROR: --project <firebaseProjectId> is required. Refusing to guess.');
  process.exit(2);
}
const modes = ['--dry-run', '--verify'].filter(flag);
if (modes.length > 1 || (flag('--force') && modes.length)) {
  console.error('ERROR: use one of --dry-run, --verify, or a write (optionally --force).');
  process.exit(2);
}

const target = process.env.FIRESTORE_EMULATOR_HOST
  ? `EMULATOR ${process.env.FIRESTORE_EMULATOR_HOST} (project ${projectId})`
  : `PRODUCTION project ${projectId}`;
console.log(`target: ${target}`);

const desired = { ...APP_LINKS_DEV, ...(valueOf('--base-url') ? { baseUrl: valueOf('--base-url') } : {}) };
const desiredProblems = validateAppLinks(desired);
if (desiredProblems.length) {
  console.error('ERROR: the doc to write is invalid:\n  ' + desiredProblems.join('\n  '));
  process.exit(1);
}

const db = getFirestore(initializeApp({ projectId }));
const ref = db.collection('config').doc('appLinks');

if (flag('--dry-run')) {
  const existing = await ref.get();
  console.log('would write config/appLinks:', JSON.stringify(desired));
  console.log(existing.exists
    ? `existing doc (a write would REFUSE without --force): ${JSON.stringify(existing.data())}`
    : 'no existing doc');
  process.exit(0);
}

if (flag('--verify')) {
  const snap = await ref.get();
  const data = snap.exists ? snap.data() : null;
  console.log('stored config/appLinks:', JSON.stringify(data));
  const problems = validateAppLinks(data);
  if (problems.length) {
    console.error('VERIFY FAILED:\n  ' + problems.join('\n  '));
    process.exit(1);
  }
  console.log(`VERIFY OK: baseUrl ${data.baseUrl} is a bare https origin; iosUrl and androidUrl are strings.`);
  process.exit(0);
}

const wrote = await db.runTransaction(async (tx) => {
  const snap = await tx.get(ref);
  if (snap.exists && !flag('--force')) return { refused: true, existing: snap.data() };
  tx.set(ref, desired);
  return { refused: false };
});
if (wrote.refused) {
  console.error(`REFUSED: config/appLinks already exists: ${JSON.stringify(wrote.existing)}. Re-run with --force to overwrite.`);
  process.exit(1);
}
console.log('wrote config/appLinks:', JSON.stringify(desired));
console.log('next: run again with --verify');
process.exit(0);
