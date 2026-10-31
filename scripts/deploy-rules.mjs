#!/usr/bin/env node
/**
 * Guarded Firestore rules deploy:  npm run deploy:rules
 *
 *   node scripts/deploy-rules.mjs [--project bama-af0a0] [--dry]
 *
 * `firebase deploy --only firestore:rules` replaces the ENTIRE production ruleset
 * with whatever file is on disk. On 2026-10-31 the file on a branch that had not
 * been rebased was 48 lines behind production and would have silently deleted the
 * rentals and payments rules. So this:
 *   1. fetches the LIVE ruleset (Firebase Rules API, read-only);
 *   2. prints the exact diff, live -> local firestore.rules;
 *   3. refuses to continue unless you type  yes  (nothing else counts);
 *   4. deploys, then fetches the live ruleset again and checks it now equals the file.
 * --dry stops after step 2 (no prompt, no deploy), for checking what a deploy would do.
 * Identical files: nothing to deploy, exit 0.
 */
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { spawnSync } from 'node:child_process';
import { GoogleAuth } from 'google-auth-library';
import { diffRules, isYes } from './lib/rulesDiff.mjs';

const args = process.argv.slice(2);
const projectIdx = args.indexOf('--project');
const projectId = projectIdx >= 0 ? args[projectIdx + 1] : 'bama-af0a0';
const dry = args.includes('--dry');

const client = await new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] }).getClient();
const get = async (url) => (await client.request({ url, timeout: 60_000 })).data;

async function liveRules() {
  const { releases = [] } = await get(`https://firebaserules.googleapis.com/v1/projects/${projectId}/releases`);
  const rel = releases.find((r) => r.name.endsWith('/releases/cloud.firestore'));
  if (!rel) throw new Error('no cloud.firestore release found');
  const id = rel.rulesetName.split('/').pop();
  const rs = await get(`https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets/${id}`);
  return { text: rs.source.files.map((f) => f.content).join(''), id, released: rel.updateTime };
}

const local = readFileSync('firestore.rules', 'utf8');
const live = await liveRules();
console.log(`project ${projectId}; live ruleset ${live.id}, released ${live.released}`);

const d = diffRules(live.text, local);
if (d.identical) {
  console.log('firestore.rules is IDENTICAL to the live ruleset. Nothing to deploy.');
  process.exit(0);
}
console.log(`\n${d.text}`);
console.log(`${d.added} line(s) added, ${d.removed} line(s) removed in production if this is deployed.\n`);

if (dry) {
  console.log('--dry: no prompt, nothing deployed.');
  process.exit(0);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = await new Promise((resolve) => {
  rl.question(`Type "yes" to run: firebase deploy --only firestore:rules --project ${projectId}\n> `, resolve);
  rl.on('close', () => resolve(''));
});
rl.close();
if (!isYes(answer)) {
  console.log('Not "yes". Aborted; nothing deployed.');
  process.exit(1);
}

const run = spawnSync('firebase', ['deploy', '--only', 'firestore:rules', '--project', projectId], { stdio: 'inherit' });
if (run.status !== 0) {
  console.error('firebase deploy failed; production may be unchanged. Check the output above.');
  process.exit(run.status ?? 1);
}

const after = await liveRules();
if (after.text === local) console.log(`\nVerified: live ruleset ${after.id} (released ${after.released}) now matches firestore.rules byte for byte.`);
else {
  console.error(`\nDRIFT: the live ruleset ${after.id} does NOT match firestore.rules after the deploy.`);
  process.exit(1);
}
