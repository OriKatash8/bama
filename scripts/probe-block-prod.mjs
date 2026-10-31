#!/usr/bin/env node
/**
 * Production probe for the Guideline 1.2 block change: the SAME operations the
 * shipped app performs, run as a real signed-in test account, printed as
 * ALLOWED / DENIED so the output can be compared before and after the deploy.
 *
 *   PROBE_A_EMAIL=… PROBE_A_PASSWORD=… PROBE_B_EMAIL=… PROBE_B_PASSWORD=… \
 *     node scripts/probe-block-prod.mjs --prod
 *
 * A and B are two throwaway accounts that already exist in production (create
 * them in the app). The script never creates accounts and touches only
 * users/A/blocks/B plus the reports it files.
 *
 * What each row is, and what it should read
 *
 *   row                                      BEFORE rules+functions   AFTER
 *   1 list my blocks (subscribeBlocks query)         ALLOWED          ALLOWED
 *   2 direct block write (old client, build ≤43)     ALLOWED          DENIED
 *   3 unblock (unblockUser: deleteDoc)               ALLOWED          ALLOWED
 *   4 blockUser callable (new client)                NOT FOUND        ALLOWED
 *   5 callable again (idempotent)                    NOT FOUND        ALLOWED, alreadyBlocked
 *   6 report with targetType/targetId (new client)   ALLOWED          ALLOWED
 *   7 read someone else's block list                 DENIED           DENIED
 *
 * Row 4 leaves one `user_blocked` report in the admin queue (that is the feature);
 * delete it from Admin → Reports (Done tab) afterwards. Rows 4–5 end by unblocking.
 */
import './lib/requireProd.mjs'; // explicit --prod required, no default target
import { initializeApp } from 'firebase/app';
import {
  getFirestore, collection, doc, getDocs, setDoc, deleteDoc, addDoc, serverTimestamp,
} from 'firebase/firestore';
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
const fns = getFunctions(app); // us-central1, like callFunction() without a region

const A = { email: need('PROBE_A_EMAIL'), pw: need('PROBE_A_PASSWORD') };
const B = { email: need('PROBE_B_EMAIL'), pw: need('PROBE_B_PASSWORD') };
const login = async (u) => { await signOut(auth).catch(() => {}); return (await signInWithEmailAndPassword(auth, u.email, u.pw)).user.uid; };
const uidB = await login(B);
const uidA = await login(A);

const rows = [];
async function row(name, fn) {
  let out;
  try { out = await fn(); rows.push([name, 'ALLOWED', out ?? '']); }
  catch (e) {
    const code = e.code ?? '';
    rows.push([name, /not-found/.test(code) ? 'NOT FOUND' : /permission-denied/.test(code) ? 'DENIED' : `ERROR ${code}`, e.message ?? '']);
  }
}

// 1. The query subscribeBlocks() runs: the whole subcollection, as the owner.
await row('1 list my blocks', async () => `${(await getDocs(collection(db, 'users', uidA, 'blocks'))).size} doc(s)`);
// 2. The write the OLD client made: setDoc with exactly { blockedAt }.
await row('2 direct block write', () => setDoc(doc(db, 'users', uidA, 'blocks', uidB), { blockedAt: serverTimestamp() }));
// 3. unblockUser(): deleteDoc on the same path.
await row('3 unblock (deleteDoc)', () => deleteDoc(doc(db, 'users', uidA, 'blocks', uidB)));
// 4/5. What the NEW client calls: callFunction('blockUser')({ targetUid, context }).
const block = httpsCallable(fns, 'blockUser');
await row('4 blockUser callable', async () => JSON.stringify((await block({ targetUid: uidB, context: 'other' })).data));
await row('5 blockUser again', async () => JSON.stringify((await block({ targetUid: uidB, context: 'other' })).data));
await deleteDoc(doc(db, 'users', uidA, 'blocks', uidB)).catch(() => {});
// 6. The shape submitReport() writes.
await row('6 report with targetType', async () => (await addDoc(collection(db, 'reports'), {
  reporterId: uidA, reportedUserId: uidB, reportedUserName: 'probe', reason: 'probe — ignore, safe to delete',
  targetType: 'message', targetId: 'probe', snippet: 'probe', evidenceURLs: [], status: 'pending', createdAt: serverTimestamp(),
})).id);
// 7. Someone else's block list must stay private.
await login(B);
await row('7 read another user\'s blocks', async () => `${(await getDocs(collection(db, 'users', uidA, 'blocks'))).size} doc(s)`);

console.table(rows.map(([name, result, detail]) => ({ row: name, result, detail })));
await signOut(auth);
process.exit(0);
