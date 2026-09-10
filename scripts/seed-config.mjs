#!/usr/bin/env node
/**
 * Seed / update the runtime pricing config at `config/pricing`.
 *
 * This document is the source of truth for every rate, cap and grace period.
 * Business logic reads it through functions/src/lifecycle/config.ts (server) and
 * src/features/pricing/services/configService.ts (client); the constants files
 * are only the fallback for when it is unreachable.
 *
 * ADDITIVE by default: a key already present is left alone, so re-running after
 * someone has tuned a value in the console does not stomp their change.
 * Pass --overwrite to force every key back to the seed value.
 *
 *   DRY RUN (default):  node scripts/seed-config.mjs --project bama-af0a0
 *   FOR REAL:           node scripts/seed-config.mjs --project bama-af0a0 --commit
 *   RESET ALL KEYS:     node scripts/seed-config.mjs --project bama-af0a0 --commit --overwrite
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const DOC_PATH = 'config/pricing';

/** Start values, per the pricing spec. Mirrored in both constants files. */
const SEED = {
  feePercent: 3,
  maxOpenProjects: 2,
  disputeWindowDays: 4,
  autoCloseReminderDays: 3,
  autoCloseFinalDays: 7,
  autoCloseDays: 14,
  paymentFailureGraceDays: 7,
};

// ── args ───────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const commit = args.includes('--commit');
const overwrite = args.includes('--overwrite');
const projectId = args[args.indexOf('--project') + 1];

if (!args.includes('--project') || !projectId || projectId.startsWith('--')) {
  console.error('ERROR: --project <projectId> is required. Refusing to guess.');
  process.exit(1);
}

// The emulator guard from backfill-lifecycle.mjs: with either var set, admin
// writes go somewhere other than the project named above, and the report lies.
for (const v of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) {
  if (process.env[v]) {
    console.error(`ERROR: ${v}=${process.env[v]} is set. Unset it — this script targets a real project.`);
    process.exit(1);
  }
}

initializeApp({ projectId });
const db = getFirestore();

// ── safety: confirm we are pointed at a real BAMA project ──────────────────
const probe = await db.collection('projects').limit(1).get();
if (probe.empty) {
  console.error(`ERROR: no 'projects' collection in ${projectId}. Wrong project?`);
  process.exit(1);
}

const ref = db.doc(DOC_PATH);
const snap = await ref.get();
const existing = snap.exists ? snap.data() : {};

console.log(`Project:  ${projectId}`);
console.log(`Document: ${DOC_PATH} (${snap.exists ? 'exists' : 'ABSENT — will be created'})`);
console.log(`Mode:     ${commit ? '*** COMMIT — will write ***' : 'DRY RUN — no writes'}${overwrite ? ' [OVERWRITE]' : ' [additive]'}\n`);

const payload = {};
for (const [key, value] of Object.entries(SEED)) {
  const current = existing?.[key];
  const present = typeof current === 'number' && Number.isFinite(current);
  if (present && !overwrite) {
    console.log(`  keep    ${key.padEnd(24)} ${current}`);
    continue;
  }
  payload[key] = value;
  console.log(`  ${present ? 'replace' : 'set    '} ${key.padEnd(24)} ${present ? `${current} -> ${value}` : value}`);
}

// Report any key the document carries that this script does not know about,
// rather than silently ignoring it — an unknown key is either a typo that the
// readers are quietly falling back over, or a value someone expects to matter.
for (const key of Object.keys(existing ?? {})) {
  if (!(key in SEED)) console.log(`  UNKNOWN ${key.padEnd(24)} ${JSON.stringify(existing[key])} — not read by any code`);
}

if (Object.keys(payload).length === 0) {
  console.log('\nNothing to write. Document is already complete.');
  process.exit(0);
}

if (!commit) {
  console.log(`\nDRY RUN — would write ${Object.keys(payload).length} key(s). Re-run with --commit.`);
  process.exit(0);
}

await ref.set(payload, { merge: true });

// Read back and ASSERT, rather than trusting the write. A seed script that
// reports success without confirming it is the failure mode catalogued in
// docs/known-issues-silent-failures.md.
const after = (await ref.get()).data() ?? {};
const wrong = Object.entries(SEED).filter(([k, v]) => {
  const got = after[k];
  if (typeof got !== 'number' || !Number.isFinite(got)) return true;
  return k in payload ? got !== v : false;
});
if (wrong.length > 0) {
  console.error(`\nFAILED verification — ${wrong.length} key(s) wrong or missing after write:`);
  wrong.forEach(([k]) => console.error(`  ${k}: ${JSON.stringify(after[k])}`));
  process.exit(1);
}

console.log(`\nWrote ${Object.keys(payload).length} key(s). Verified all ${Object.keys(SEED).length} keys read back as numbers.`);
