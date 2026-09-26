#!/usr/bin/env node
/**
 * Does production match this repo?
 *
 * THREE DEPLOY SURFACES, THREE SEPARATE COMMANDS, and until now only one of them
 * was ever checked. On 2026-09-13 a client could not edit a project deadline
 * because `firestore.rules` had carried the fix for three days and nobody had run
 * `firebase deploy --only firestore:rules`. The visible symptom was a permissions
 * error; the part that mattered was that two authorisation tightenings had never
 * been in force either.
 *
 * A GREEN DEPLOY MESSAGE IS NOT EVIDENCE. This fetches the deployed artefacts and
 * compares them, which is the only check that distinguishes "released" from "the
 * CLI printed a tick".
 *
 *   node scripts/check-deploy-drift.mjs --project bama-af0a0
 *
 * Exits non-zero on drift, so it can gate a release.
 */
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase-admin/app';
import { GoogleAuth } from 'google-auth-library';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { evaluateAllowlist, todayUtc, ALLOWLIST_MAX_AGE_DAYS } from './lib/driftAllowlist.mjs';

const args = process.argv.slice(2);
const projectId = args[args.indexOf('--project') + 1];
if (!args.includes('--project') || !projectId || projectId.startsWith('--')) {
  console.error('ERROR: --project <firebaseProjectId> is required. Refusing to guess.');
  process.exit(1);
}

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});
const client = await auth.getClient();
const get = async (url) => (await client.request({ url })).data;

let drift = 0;
const ok = (m) => console.log(`  ok    ${m}`);
const bad = (m) => { drift += 1; console.log(`  DRIFT ${m}`); };

// ── rules ──────────────────────────────────────────────────────────────────
// BOTH rules files. This checked firestore.rules alone until storage.rules was
// rewritten from a single `allow write: if request.auth != null` into 13 scoped
// path blocks — the largest rules change the project has had, on the one surface
// this script could not see. Exactly the failure in the header note, one file
// over.
const releases = await get(`https://firebaserules.googleapis.com/v1/projects/${projectId}/releases`);

/**
 * `match` is a PREDICATE, not a suffix, because the two services name releases
 * differently. Firestore's ends at the service: `.../releases/cloud.firestore`.
 * Storage APPENDS THE BUCKET: `.../releases/firebase.storage/<bucket>` — and a
 * project with several buckets has one release each. A suffix check on
 * 'firebase.storage' therefore matches nothing and reports "no release at all"
 * for rules that are in fact deployed, which is worse than not checking: it is
 * a false alarm that trains you to ignore the output.
 */
async function checkRules(localPath, match, deployTarget) {
  const found = (releases.releases ?? []).filter((r) => match(r.name));
  if (found.length === 0) { bad(`${localPath}: no release at all`); return; }
  if (found.length > 1) {
    console.log(`  note  ${localPath}: ${found.length} releases (one per bucket); checking ${found[0].name.split('/').pop()}`);
  }
  const rel = found[0];
  const rs = await get(`https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets/${rel.rulesetName.split('/').pop()}`);
  const deployed = rs.source.files.map((f) => f.content).join('');
  const local = readFileSync(localPath, 'utf8');
  if (deployed === local) ok(`${localPath} matches (released ${rel.updateTime})`);
  else {
    bad(`${localPath} DIFFERS from the deployed ruleset (released ${rel.updateTime})`);
    console.log(`        run: firebase deploy --only ${deployTarget}`);
  }
}

await checkRules('firestore.rules', (n) => n.endsWith('cloud.firestore'), 'firestore:rules');
await checkRules('storage.rules', (n) => n.includes('/releases/firebase.storage'), 'storage');

// ── indexes ────────────────────────────────────────────────────────────────
// Compared as a set of (collectionGroup, fields) rather than textually: the API
// returns them with server-assigned names and its own ordering.
initializeApp({ projectId });
const key = (i) => `${i.collectionGroup}|${(i.fields ?? [])
  .filter((f) => f.fieldPath !== '__name__')
  .map((f) => `${f.fieldPath}:${f.order ?? f.arrayConfig}`).join(',')}`;
const local = JSON.parse(readFileSync('firestore.indexes.json', 'utf8'));
const wantIdx = new Set(local.indexes.map(key));
const live = await get(
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/collectionGroups/-/indexes`,
);
const haveIdx = new Set((live.indexes ?? [])
  .filter((i) => i.state === 'READY' || i.state === 'CREATING')
  .map((i) => key({ collectionGroup: i.name.split('/').slice(-3)[0], fields: i.fields })));
const missing = [...wantIdx].filter((k) => !haveIdx.has(k));
if (missing.length === 0) ok(`all ${wantIdx.size} composite indexes present`);
else {
  bad(`${missing.length} composite index(es) in firestore.indexes.json are NOT deployed`);
  missing.forEach((m) => console.log(`        ${m}`));
  console.log('        run: firebase deploy --only firestore:indexes');
}

// ── functions ──────────────────────────────────────────────────────────────
// Every `export const <name> = onCall/onDocument.../onSchedule` in functions/src
// must exist in the deployed list. Catches the failure that bit us before: a new
// callable shipped in the app while its function was never named in the deploy.
const grepped = execSync(
  `grep -rhoE "^export const [a-zA-Z0-9_]+ = (onCall|onRequest|onSchedule|onDocument[a-zA-Z]*|onValue[a-zA-Z]*)" functions/src || true`,
  { encoding: 'utf8' },
).split('\n').filter(Boolean).map((l) => l.split(' ')[2]);
const fns = await get(
  `https://cloudfunctions.googleapis.com/v2/projects/${projectId}/locations/-/functions?pageSize=300`,
);
const deployedFns = new Set((fns.functions ?? []).map((f) => f.name.split('/').pop()));

// Exported but INTENTIONALLY not deployed (scripts/deploy-drift-allowlist.json).
// Every entry has a reason and a date and expires; a problem with the list is drift.
const allowlistFile = JSON.parse(readFileSync('scripts/deploy-drift-allowlist.json', 'utf8'));
const allow = evaluateAllowlist({
  entries: allowlistFile.functionsNotDeployed,
  exported: grepped,
  deployed: deployedFns,
  today: todayUtc(),
});
allow.problems.forEach((p) => bad(`allowlist ${p.kind}: ${p.message}`));
allow.allowed.forEach((a) =>
  ok(`${a.name} not deployed, allowed (added ${a.addedOn}, day ${a.ageDays} of ${ALLOWLIST_MAX_AGE_DAYS}): ${a.reason}`));

const exportedFns = new Set(grepped);
const missingFns = [...exportedFns].filter((n) => !deployedFns.has(n) && !allow.allowedNames.has(n));
if (missingFns.length === 0) {
  ok(`all ${exportedFns.size - allow.allowedNames.size} exported functions that should be deployed are deployed`);
} else {
  bad(`${missingFns.length} exported function(s) are NOT deployed`);
  missingFns.forEach((m) => console.log(`        ${m}`));
  console.log('        run: firebase deploy --only functions:<name>');
}

console.log('');
if (drift > 0) {
  console.log(`  ${drift} surface(s) drifted. Production does not match this repo.`);
  process.exit(1);
}
console.log('  No drift. Production matches this repo on all three surfaces.');
