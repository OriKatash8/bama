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
 *
 * FUNCTIONS ARE CHECKED THREE WAYS: every exported function is deployed (or allowlisted); and
 * every deployed function's uploaded source is fetched, reduced to a git tree hash and compared
 * with docs/deploy-ledger.json, the record of deploys a human accepted. A function that is live
 * and not in a recorded deploy, or was updated since, is DRIFT. (A deploy that went unrecorded
 * for a week, on 2026-09-30, is why.) Source hashing downloads ~60 small zips; --no-source skips
 * it and compares update times only.
 *
 * RECORDING a deploy, after you have checked it:
 *   node scripts/check-deploy-drift.mjs --project P --record-functions --only a,b --note "what and why"
 *   node scripts/check-deploy-drift.mjs --project P --record-functions --baseline --note "..."   (everything live, first time)
 * A name in --only that is no longer deployed is REMOVED from the ledger (that is how a deletion
 * is recorded). --how is deploy (default), baseline (default with --baseline) or found-unrecorded.
 * Nothing is recorded without an explicit list or --baseline, and an unreadable source is refused.
 */
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase-admin/app';
import { GoogleAuth } from 'google-auth-library';
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { evaluateAllowlist, todayUtc, ALLOWLIST_MAX_AGE_DAYS } from './lib/driftAllowlist.mjs';
import { evaluateLedger, recordFunctions, serializeLedger, RECORD_HOWS } from './lib/functionsLedger.mjs';
import { commitIndex, listFunctions, pool, projectNumberOf, sourceTreeSha } from './lib/functionSources.mjs';

const args = process.argv.slice(2);
const projectId = args[args.indexOf('--project') + 1];
if (!args.includes('--project') || !projectId || projectId.startsWith('--')) {
  console.error('ERROR: --project <firebaseProjectId> is required. Refusing to guess.');
  process.exit(1);
}

const flag = (f) => args.includes(f);
const flagValue = (f) => { const i = args.indexOf(f); return i !== -1 && !args[i + 1]?.startsWith('--') ? args[i + 1] : undefined; };
const LEDGER_PATH = flagValue('--ledger') ?? 'docs/deploy-ledger.json';
const LEDGER_HEADER = {
  _readme: 'The deploys of Cloud Functions that a human has accepted: per function, the updateTime and the git tree hash of the uploaded src/ that were live when it was recorded. scripts/check-deploy-drift.mjs fails on any function that is live and not in here, or whose updateTime or source differs from its entry here. Update it with --record-functions (see that script); never by hand. how: deploy = recorded right after a deploy; baseline = the state found on the day the ledger was created, NOT individually verified; found-unrecorded = a deploy that was discovered afterwards.',
};
const readLedger = () => { try { return JSON.parse(readFileSync(LEDGER_PATH, 'utf8')).functions ?? {}; } catch { return null; } };

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});
const client = await auth.getClient();
// A timeout, so a stalled connection fails in a minute instead of hanging for ten.
const REQUEST_TIMEOUT_MS = 60_000;
const get = async (url) => (await client.request({ url, timeout: REQUEST_TIMEOUT_MS })).data;

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

// ── functions: which source is running, and was the deploy recorded? ───────
const deployedList = (await listFunctions(get, projectId)).filter((f) => f.state === 'ACTIVE');
const projectNumber = projectNumberOf(deployedList);
const repoCommits = commitIndex('.');
const withSources = async (names) => {
  const wanted = deployedList.filter((f) => !names || names.includes(f.name));
  const hashed = await pool(wanted, 6, async (f) => ({ ...f, treeSha: await sourceTreeSha(client, f, projectNumber) }));
  return hashed.map((f) => ({ ...f, commit: repoCommits.index.get(f.treeSha)?.commit ?? null }));
};

if (flag('--record-functions')) {
  const baseline = flag('--baseline');
  const only = (flagValue('--only') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const note = flagValue('--note');
  const how = flagValue('--how') ?? (baseline ? 'baseline' : 'deploy');
  if (!baseline && only.length === 0) { console.error('ERROR: --record-functions needs --only name,name or --baseline. It will not record "everything that drifted".'); process.exit(2); }
  if (!note) { console.error('ERROR: --record-functions needs --note "what was deployed and why".'); process.exit(2); }
  if (!RECORD_HOWS.includes(how)) { console.error(`ERROR: --how must be one of ${RECORD_HOWS.join(', ')}.`); process.exit(2); }
  const hashed = await withSources(baseline ? null : only);
  const result = recordFunctions({
    ledger: readLedger() ?? {},
    deployed: hashed,
    only: baseline ? deployedList.map((f) => f.name) : only,
    how, note, today: todayUtc(),
  });
  writeFileSync(LEDGER_PATH, serializeLedger(result.ledger, LEDGER_HEADER));
  console.log(`recorded in ${LEDGER_PATH} (${how}): ${result.changed.length} change(s)`);
  result.changed.forEach((c) => console.log(`  ${c.action.padEnd(8)} ${c.name}`));
  const unknown = only.filter((n) => !deployedList.some((f) => f.name === n) && !result.changed.some((c) => c.name === n));
  if (unknown.length) console.log(`  note: not deployed and not in the ledger, nothing to do: ${unknown.join(', ')}`);
  process.exit(0);
}

const ledger = readLedger();
if (ledger === null) {
  bad(`${LEDGER_PATH} does not exist or is unreadable: no deploy of any function has been recorded`);
  console.log('        run: node scripts/check-deploy-drift.mjs --project <p> --record-functions --baseline --note "..."');
} else {
  const checked = flag('--no-source')
    ? deployedList.map((f) => ({ ...f, treeSha: ledger[f.name]?.treeSha ?? null }))
    : await withSources(null);
  const verdict = evaluateLedger({ deployed: checked, ledger });
  verdict.problems.forEach((p) => bad(`function deploy not recorded: ${p.message}`));
  if (verdict.problems.length === 0) ok(`all ${checked.length} deployed functions are in the ledger, unchanged since (${flag('--no-source') ? 'update times only; --no-source' : 'source hashed'})`);
  else ok(`${verdict.recorded.length} of ${checked.length} deployed functions are recorded and unchanged`);
  if (verdict.problems.length) console.log('        after checking a deploy: node scripts/check-deploy-drift.mjs --project <p> --record-functions --only <names> --note "..."');
  if (!flag('--no-source')) {
    const notHead = checked.filter((f) => f.treeSha && f.treeSha !== repoCommits.headTree);
    const byCommit = new Map();
    for (const f of notHead) {
      const label = f.commit ? `${f.commit} (${repoCommits.index.get(f.treeSha).date})` : 'NO COMMIT (an uncommitted tree)';
      byCommit.set(label, [...(byCommit.get(label) ?? []), f.name]);
    }
    console.log(`  info  ${checked.length - notHead.length} functions run exactly HEAD's functions/src (${repoCommits.head}); ${notHead.length} run an older source (normal when a function was not touched by later commits):`);
    for (const [label, names] of [...byCommit].sort((a, b) => b[1].length - a[1].length)) console.log(`          ${String(names.length).padStart(3)} @ ${label}${names.length <= 4 ? `: ${names.join(', ')}` : ''}`);
    const orphans = checked.filter((f) => f.treeSha && !f.commit);
    if (orphans.length) bad(`${orphans.length} function(s) run source that matches NO commit (deployed from an uncommitted tree): ${orphans.map((f) => f.name).join(', ')}`);
  }
}

console.log('');
if (drift > 0) {
  console.log(`  ${drift} surface(s) drifted. Production does not match this repo.`);
  process.exit(1);
}
console.log('  No drift. Production matches this repo on all three surfaces.');
