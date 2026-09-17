#!/usr/bin/env node
/**
 * R8 — slot-cap RACE against PRODUCTION, real deployed hireProfessional,
 * throwaway accounts. The emulator run (probe-slot-cap-race.mjs) proved the
 * mechanism; this proves the deployed build.
 *
 * Each round: the throwaway pro already holds 1 slot of 2 (project A). Two
 * projects B and C each carry a pending offer from the pro. Both hires fire at
 * the same moment. Exactly one may land.
 *
 * NO REAL USER IS NOTIFIED. onProjectCreate fans "פרויקט חדש" out to every
 * matching professional for an OPEN project with a VACANT seat. Probe projects
 * are created with their only seat already filled and a targetProfessionalId
 * set to the throwaway pro — the trigger returns on either. hireProfessional
 * does not check vacancy, so the race is still exercised. Offer notifications go
 * only to the two throwaway accounts.
 *
 *   node scripts/probe-slot-cap-race-prod.mjs
 */
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { initializeApp as initAdmin } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';

for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '');
}
const cfg = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};
if (cfg.projectId !== 'bama-af0a0') throw new Error(`unexpected project ${cfg.projectId}`);
console.log(`\nproject: ${cfg.projectId}  (LIVE)\n`);

const ROUNDS = Number(process.env.ROUNDS ?? 5);
const STAMP = `race${Date.now()}`;
const app = initializeApp(cfg, STAMP);
const auth = getAuth(app);
const hire = httpsCallable(getFunctions(app), 'hireProfessional');
const adminApp = initAdmin({ projectId: cfg.projectId }, STAMP);
const db = getFirestore(adminApp);
const adminAuth = getAdminAuth(adminApp);

const cap = (await db.doc('config/pricing').get()).data()?.maxOpenProjects ?? 2;
const PW = 'Probe-Password-123!';
let failures = 0;
const check = (l, ok, d = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}${d ? `  — ${d}` : ''}`); if (!ok) failures++; };
const deleted = [];

const accounts = {};
async function mk(tag) {
  const email = `${STAMP}.${tag}@probe.invalid`;
  const c = await createUserWithEmailAndPassword(auth, email, PW);
  accounts[tag] = { uid: c.user.uid, email };
  await signOut(auth);
}
await mk('pro');
await mk('client');
const PRO = accounts.pro.uid, CLIENT = accounts.client.uid;
console.log(`cap=${cap}  pro=${PRO}  client=${CLIENT}  rounds=${ROUNDS}\n`);

const projectIds = [];
const chatIds = new Set();

async function project(id, extra = {}) {
  await db.doc(`projects/${id}`).set({
    clientId: CLIENT, title: `Probe ${STAMP}`, description: 'automated probe', location: 'TLV',
    deadline: 'flexible', status: 'open', createdAt: new Date(),
    targetProfessionalId: PRO,
    crewSlots: [{ category: 'Editor', quantity: 1 }],
    filledSlots: [{ category: 'Editor', professionalId: `${STAMP}-filler` }],
    ...extra,
  });
  projectIds.push(id);
}
const heldBy = async () => (await db.collection('projects').where('slotHolders', 'array-contains', PRO).get()).size;

try {
  await signInWithEmailAndPassword(auth, accounts.client.email, PW);
  const tally = {};
  let over = 0;
  for (let i = 0; i < ROUNDS; i++) {
    const A = `${STAMP}-${i}-A`, B = `${STAMP}-${i}-B`, C = `${STAMP}-${i}-C`;
    // Previous round's projects stop holding the pro, so each round starts at 1 of cap.
    for (const id of projectIds) await db.doc(`projects/${id}`).update({ slotHolders: [] }).catch(() => {});
    await project(A, { slotHolders: [PRO], professionalIds: [PRO], slotActive: true });
    // Fill up to cap-1 held so the next hire is the last free slot.
    for (let k = 1; k < cap - 1; k++) await project(`${A}${k}`, { slotHolders: [PRO], professionalIds: [PRO], slotActive: true });
    await project(B);
    await project(C);
    for (const p of [B, C]) {
      await db.doc(`priceOffers/${p}-o`).set({
        projectId: p, professionalId: PRO, category: 'Editor', price: 100, status: 'pending', createdAt: new Date(),
      });
    }
    const call = (offerId) => hire({ offerId })
      .then((r) => { if (r.data?.chatId) chatIds.add(r.data.chatId); return 'ok'; })
      .catch((e) => (String(e.message).includes('slot-cap-reached') ? 'capped' : `error:${e.code} ${e.message}`));
    const results = await Promise.all([call(`${B}-o`), call(`${C}-o`)]);
    const held = await heldBy();
    const key = results.slice().sort().join('+');
    tally[key] = (tally[key] ?? 0) + 1;
    if (held > cap) over++;
    console.log(`  round ${i + 1}: ${results.join(' / ')}  held=${held}`);
  }
  console.log(`\n  outcomes: ${JSON.stringify(tally)}`);
  check('deployed hireProfessional never over-commits', over === 0, `${over}/${ROUNDS} rounds over cap`);
  check('every round is exactly one ok + one capped', tally['capped+ok'] === ROUNDS, JSON.stringify(tally));
} catch (e) {
  console.error('\nprobe threw:', e); failures++;
} finally {
  console.log('\nTeardown:');
  await signOut(auth).catch(() => {});
  const del = async (ref, label) => { await ref.delete(); deleted.push(label); };

  for (const id of projectIds) {
    const ref = db.doc(`projects/${id}`);
    const snap = await ref.get();
    if (snap.data()?.chatId) chatIds.add(snap.data().chatId);
    for (const sub of ['fees', 'paymentRequests', 'removalRequests']) {
      for (const d of (await ref.collection(sub).get()).docs) await del(d.ref, `projects/${id}/${sub}/${d.id}`);
    }
    if (snap.exists) await del(ref, `projects/${id}`);
  }
  for (const d of (await db.collection('priceOffers').where('professionalId', '==', PRO).get()).docs) {
    await del(d.ref, `priceOffers/${d.id}`);
  }
  for (const c of chatIds) {
    const ref = db.doc(`chats/${c}`);
    for (const m of (await ref.collection('messages').get()).docs) await del(m.ref, `chats/${c}/messages/${m.id}`);
    if ((await ref.get()).exists) await del(ref, `chats/${c}`);
  }
  for (const uid of [PRO, CLIENT]) {
    for (const n of (await db.collection('notifications').where('userId', '==', uid).get()).docs) {
      await del(n.ref, `notifications/${n.id}`);
    }
    const userRef = db.doc(`users/${uid}`);
    for (const sub of await userRef.listCollections()) {
      for (const d of (await sub.get()).docs) await del(d.ref, `users/${uid}/${sub.id}/${d.id}`);
    }
    if ((await userRef.get()).exists) await del(userRef, `users/${uid}`);
    await adminAuth.deleteUser(uid); deleted.push(`auth user ${uid}`);
  }

  // Residue sweep — anything the trigger fan-out wrote late.
  await new Promise((r) => setTimeout(r, 5000));
  let left = 0;
  for (const uid of [PRO, CLIENT]) {
    const late = await db.collection('notifications').where('userId', '==', uid).get();
    for (const n of late.docs) { await del(n.ref, `notifications/${n.id} (late)`); }
    if ((await db.doc(`users/${uid}`).get()).exists) { await del(db.doc(`users/${uid}`), `users/${uid} (late)`); }
    try { await adminAuth.getUser(uid); left++; } catch {}
  }
  for (const id of projectIds) if ((await db.doc(`projects/${id}`).get()).exists) left++;
  if ((await db.collection('priceOffers').where('professionalId', '==', PRO).get()).size) left++;
  for (const c of chatIds) if ((await db.doc(`chats/${c}`).get()).exists) left++;
  check('zero residue', left === 0, `${left} left`);

  console.log(`\nDeleted (${deleted.length}):`);
  for (const d of deleted) console.log(`  - ${d}`);
}
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
