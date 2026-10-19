#!/usr/bin/env node
/**
 * Production probe for cancelVideoJob: the SAME call the shipped client makes
 * (callFunction('cancelVideoJob', 'europe-west1')({ filePath })), run as a throwaway
 * account against ANOTHER user's video path and other bad paths. Every attack row must
 * read DENIED; the side-effect row checks nothing was written for the victim's path.
 *
 *   PROBE_A_EMAIL=… PROBE_A_PASSWORD=… node scripts/probe-cancel-video-prod.mjs
 *
 *   A = the attacker (a throwaway account that already exists in production). The victim
 *   only needs to be a uid STRING: it defaults to a made-up one (no second account needed).
 *   Set PROBE_VICTIM_UID to use a real user's uid, or PROBE_B_EMAIL/PROBE_B_PASSWORD to
 *   sign in as a second account and use its uid. Nothing is created or deleted in Auth. Optional
 *   PROBE_CONTROL=1 adds a positive control (A cancels A's own path) which leaves one
 *   `cancelled` marker doc in videoJobs for a file that never existed; delete it afterwards.
 *
 *   row                                             expected
 *   1 A cancels B's portfolio video                 DENIED (permission-denied)
 *   2 A cancels B's chat video                      DENIED
 *   3 A uses ".." to reach B through A's folder     DENIED
 *   4 A targets a non-video folder (courses/…)      DENIED
 *   5 A targets an already-compressed output        DENIED
 *   6 signed-out caller                             UNAUTHENTICATED
 *   7 videoJobs doc for B's path exists afterwards  NO (nothing written)
 *   8 (control) A cancels A's own path              ALLOWED
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';

const need = (k) => { const v = process.env[k]; if (!v) { console.error(`Set ${k}`); process.exit(2); } return v; };
const app = initializeApp({
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? 'AIzaSyAgECKwk9l1gV-F8zbaNSWViXeG7Vc6Uz8',
  authDomain: 'bama-af0a0.firebaseapp.com',
  projectId: 'bama-af0a0',
});
const db = getFirestore(app);
const auth = getAuth(app);
const cancel = httpsCallable(getFunctions(app, 'europe-west1'), 'cancelVideoJob');
const login = async (e, p) => { await signOut(auth).catch(() => {}); return (await signInWithEmailAndPassword(auth, e, p)).user.uid; };

const uidB = process.env.PROBE_B_EMAIL
  ? await login(need('PROBE_B_EMAIL'), need('PROBE_B_PASSWORD'))
  : (process.env.PROBE_VICTIM_UID ?? `probeVictim${Date.now().toString(36)}`);
const uidA = await login(need('PROBE_A_EMAIL'), need('PROBE_A_PASSWORD'));
const ts = Date.now();
const victimPath = `portfolio/${uidB}/${ts}.mp4`;
const jobIdOf = (p) => Buffer.from(p).toString('base64').replace(/[/+=]/g, '_');

const rows = [];
async function row(name, expected, filePath) {
  let got;
  try { await cancel({ filePath }); got = 'ALLOWED'; }
  catch (e) {
    const c = String(e.code ?? '');
    got = /permission-denied/.test(c) ? 'DENIED' : /unauthenticated/.test(c) ? 'UNAUTHENTICATED' : /not-found/.test(c) ? 'NOT FOUND (not deployed?)' : `ERROR ${c}`;
  }
  rows.push([name, expected, got, got === expected ? 'ok' : 'MISMATCH']);
}

await row("1 A cancels B's portfolio video", 'DENIED', victimPath);
await row("2 A cancels B's chat video", 'DENIED', `chat-videos/${uidB}/${ts}.mp4`);
await row('3 ".." from A\'s folder into B\'s', 'DENIED', `portfolio/${uidA}/../${uidB}/${ts}.mp4`);
await row('4 non-video folder (courses/…)', 'DENIED', `courses/${uidA}/${ts}.mp4`);
await row('5 already-compressed output', 'DENIED', `portfolio/${uidA}/${ts}_compressed.mp4`);

// Side effect: nothing may have been written for B's path.
const job = await getDoc(doc(db, 'videoJobs', jobIdOf(victimPath)));
rows.push(["7 videoJobs doc for B's path afterwards", 'absent', job.exists() ? 'EXISTS' : 'absent', job.exists() ? 'MISMATCH' : 'ok']);

if (process.env.PROBE_CONTROL === '1') {
  await row("8 control: A cancels A's own path", 'ALLOWED', `portfolio/${uidA}/${ts}.mp4`);
  console.log(`(control left videoJobs/${jobIdOf(`portfolio/${uidA}/${ts}.mp4`)} — delete it)`);
}

await signOut(auth);
await row('6 signed-out caller', 'UNAUTHENTICATED', victimPath);

console.table(rows.map(([name, expected, got, verdict]) => ({ row: name, expected, got, verdict })));
const bad = rows.filter((r) => r[3] !== 'ok');
console.log(bad.length ? `FAIL: ${bad.length} row(s) did not match` : 'PASS: every attack was rejected');
process.exit(bad.length ? 1 : 0);
