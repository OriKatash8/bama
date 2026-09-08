#!/usr/bin/env node
/**
 * PRODUCTION verification of the slot-cap fix, real callable, throwaway accounts.
 *
 * The emulator round-trip proved the logic; this proves the DEPLOYED function.
 * The failure that matters is a false refusal — a client unable to hire a second
 * role — which is exactly what was happening before.
 *
 *   node scripts/probe-slot-cap-prod.mjs
 */
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, deleteUser,
} from 'firebase/auth';

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
console.log(`\nproject: ${cfg.projectId}  (LIVE)\n`);
const app = initializeApp(cfg, 'slotcap-prod');
const auth = getAuth(app);
const hire = httpsCallable(getFunctions(app), 'hireProfessional');

const { initializeApp: ia } = await import('firebase-admin/app');
const { getFirestore: gdb } = await import('firebase-admin/firestore');
const { getAuth: ga } = await import('firebase-admin/auth');
const STAMP = `slotcap${Date.now()}`;
const adminApp = ia({ projectId: cfg.projectId }, STAMP);
const adminDb = gdb(adminApp);

const PW = 'Probe-Password-123!';
const accounts = {};
let failures = 0;
const check = (l, ok, d = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}${d ? `  — ${d}` : ''}`); if (!ok) failures++; };
async function mk(tag) {
  const email = `${STAMP}.${tag}@probe.invalid`;
  const c = await createUserWithEmailAndPassword(auth, email, PW);
  accounts[tag] = { uid: c.user.uid, email };
  await signOut(auth);
}
async function as(tag) { await signOut(auth).catch(() => {}); await signInWithEmailAndPassword(auth, accounts[tag].email, PW); }

for (const t of ['pro', 'client']) await mk(t);
const PRO = accounts.pro.uid, CLIENT = accounts.client.uid;
console.log(`pro=${PRO}\nclient=${CLIENT}\n`);

const HERE = `${STAMP}-here`, OTHER = `${STAMP}-other`, THIRD = `${STAMP}-third`;
const madeChats = [];

async function project(id, extra = {}) {
  await adminDb.collection('projects').doc(id).set({
    clientId: CLIENT, title: `Probe ${id}`, description: 'x', location: 'TLV',
    deadline: 'flexible', status: 'open', createdAt: new Date(),
    crewSlots: [{ category: 'Editor', quantity: 1 }, { category: 'Video Photographer', quantity: 1 }],
    filledSlots: [], ...extra,
  });
}
async function offer(id, projectId, category, price) {
  await adminDb.collection('priceOffers').doc(id).set({
    projectId, professionalId: PRO, category, price, status: 'pending', createdAt: new Date(),
  });
}
async function callHire(offerId) {
  await as('client');
  try { const r = await hire({ offerId }); return { ok: true, chatId: r.data?.chatId ?? null }; }
  catch (e) { return { ok: false, code: e.code ?? '', msg: String(e.message ?? '') }; }
}

try {
  await project(HERE);
  // Already engaged HERE (after role 1) and on ONE other project => at the cap of 2.
  await project(OTHER, { slotHolders: [PRO], slotActive: true, professionalIds: [PRO] });
  await project(THIRD);

  console.log('1. First role on this project (legitimately takes the slot):');
  await offer(`${HERE}-o1`, HERE, 'Editor', 1000);
  const r1 = await callHire(`${HERE}-o1`);
  check('succeeds', r1.ok, r1.ok ? '' : `${r1.code} ${r1.msg}`);
  if (!r1.ok) throw new Error('first hire failed; cannot test the second');
  if (r1.chatId) madeChats.push(r1.chatId);

  console.log('\n2. SECOND different-category role on the SAME project (the bug):');
  await offer(`${HERE}-o2`, HERE, 'Video Photographer', 700);
  const r2 = await callHire(`${HERE}-o2`);
  check('succeeds', r2.ok, r2.ok ? '' : `${r2.code} ${r2.msg}`);

  const p = (await adminDb.collection('projects').doc(HERE).get()).data();
  const holders = (p.slotHolders ?? []).filter((h) => h === PRO);
  check('slotHolders still has exactly ONE entry for the pro', holders.length === 1,
        JSON.stringify(p.slotHolders ?? []));
  const mine = (p.filledSlots ?? []).filter((s) => s.professionalId === PRO);
  check('filledSlots has BOTH roles', mine.length === 2,
        JSON.stringify(mine.map((s) => s.category)));
  const fees = await adminDb.collection(`projects/${HERE}/fees`).get();
  check('exactly ONE fee doc', fees.size === 1, `${fees.size}`);
  check('baseAmount accumulated across both offers (1000+700)',
        fees.docs[0]?.data().baseAmount === 1700, `${fees.docs[0]?.data().baseAmount}`);

  console.log('\n3. Hire onto a THIRD, genuinely new project:');
  await offer(`${THIRD}-o1`, THIRD, 'Editor', 500);
  const r3 = await callHire(`${THIRD}-o1`);
  check('still denied', !r3.ok, r3.ok ? 'ALLOWED — cap not enforced!' : `${r3.code} ${r3.msg}`);
  check('reason is slot-cap-reached', !r3.ok && r3.msg.includes('slot-cap-reached'), r3.msg ?? '');
} catch (e) {
  console.error('\nprobe threw:', e.message ?? e); failures++;
} finally {
  console.log('\nTeardown:');
  for (const tag of ['pro', 'client']) {
    try { await as(tag); await deleteUser(auth.currentUser); }
    catch (e) { console.error('  account delete failed', tag, e.code ?? e); failures++; }
  }
  for (const pid of [HERE, OTHER, THIRD]) {
    const f = await adminDb.collection(`projects/${pid}/fees`).get();
    for (const d of f.docs) await d.ref.delete();
    await adminDb.collection('projects').doc(pid).delete();
  }
  const offers = await adminDb.collection('priceOffers').get();
  for (const d of offers.docs) if (d.id.startsWith(STAMP)) await d.ref.delete();
  for (const c of madeChats) await adminDb.collection('chats').doc(c).delete();

  let left = 0;
  for (const col of ['projects', 'priceOffers', 'chats']) {
    const s = await adminDb.collection(col).get();
    const junk = s.docs.filter((d) => d.id.startsWith(STAMP) || String(d.data().projectId ?? '').startsWith(STAMP) || String(d.data().title ?? '').includes(STAMP));
    for (const d of junk) { await d.ref.delete(); left++; console.error('  swept late:', col, d.id); }
  }
  let leaked = 0;
  for (const tag of ['pro', 'client']) {
    try { await ga(adminApp).getUser(accounts[tag].uid); leaked++; console.error('  LEAKED', accounts[tag].email); } catch {}
  }
  check('probe docs removed', left === 0, `${left} swept late`);
  check('probe accounts removed', leaked === 0, `${leaked} leaked`);
}
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
