#!/usr/bin/env node
/**
 * PRODUCTION verification of the three fee-path guards.
 *
 * Exercises hireProfessional END TO END on a real throwaway project — the point
 * is not just that the refusals fire, but that a legitimate hire still writes the
 * fee doc, slotHolders, filledSlots and the group chat. A guard that also broke
 * hiring would be worse than the bug it fixes.
 *
 *   node scripts/probe-fee-guards-prod.mjs
 */
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, collection, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, deleteUser } from 'firebase/auth';

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
const app = initializeApp(cfg, 'fee-guards');
const db = getFirestore(app), auth = getAuth(app), fns = getFunctions(app);
const hire = httpsCallable(fns, 'hireProfessional');

const { initializeApp: ia } = await import('firebase-admin/app');
const { getFirestore: gdb } = await import('firebase-admin/firestore');
const { getAuth: ga } = await import('firebase-admin/auth');
const STAMP = `probe${Date.now()}`;
const adminApp = ia({ projectId: cfg.projectId }, STAMP);
const adminDb = gdb(adminApp);

const PW = 'Probe-Password-123!';
const accounts = {}; let failures = 0;
const check = (l, ok, d='') => { console.log(`  ${ok?'PASS':'FAIL'}  ${l}${d?`  — ${d}`:''}`); if(!ok) failures++; };
async function mk(tag){ const e=`${STAMP}.${tag}@probe.invalid`; const c=await createUserWithEmailAndPassword(auth,e,PW); accounts[tag]={uid:c.user.uid,email:e}; await signOut(auth); return c.user.uid; }
async function as(tag){ await signOut(auth).catch(()=>{}); await signInWithEmailAndPassword(auth,accounts[tag].email,PW); }

const PRO = await mk('pro'), CLIENT = await mk('client');
console.log(`pro=${PRO}\nclient=${CLIENT}\n`);

const OPEN = `${STAMP}-open`, DEAD = `${STAMP}-cancelled`;
const made = { projects: [OPEN, DEAD], priceOffers: [], chats: [] };

async function seedProject(id, status) {
  await adminDb.collection('projects').doc(id).set({
    clientId: CLIENT, title: `Probe ${status}`, description: 'x', location: 'TLV',
    deadline: 'flexible', crewSlots: [{ category: 'Editor', quantity: 1 }],
    filledSlots: [], status, createdAt: new Date(),
  });
}
async function seedOffer(projectId, price, id) {
  await adminDb.collection('priceOffers').doc(id).set({
    projectId, professionalId: PRO, category: 'Editor', price,
    status: 'pending', createdAt: new Date(),
  });
  made.priceOffers.push(id);
}

try {
  // ── 1. hire onto a CANCELLED project ──
  console.log('1. Hire onto a cancelled project:');
  await seedProject(DEAD, 'cancelled');
  await seedOffer(DEAD, 1000, `${STAMP}-deadoffer`);
  await as('client');
  let code = '', msg = '';
  try { await hire({ offerId: `${STAMP}-deadoffer` }); }
  catch (e) { code = e.code ?? ''; msg = String(e.message ?? ''); }
  check('refused', !!code, `code=${code} message="${msg}"`);
  check('code is failed-precondition, NOT resource-exhausted',
        code === 'functions/failed-precondition', code);
  check('message carries project-not-hireable', msg.includes('project-not-hireable'), msg);
  const deadProj = await adminDb.collection('projects').doc(DEAD).get();
  check('no slotHolders written on the cancelled project',
        (deadProj.data().slotHolders ?? []).length === 0);
  const deadFee = await adminDb.doc(`projects/${DEAD}/fees/${PRO}`).get();
  check('no fee doc minted on the cancelled project', !deadFee.exists);

  // ── 2. hire onto an OPEN project, end to end ──
  console.log('\n2. Hire onto an open project (end to end):');
  await seedProject(OPEN, 'open');
  await seedOffer(OPEN, 1000, `${STAMP}-goodoffer`);
  await as('client');
  let chatId = null, hireErr = '';
  try { const r = await hire({ offerId: `${STAMP}-goodoffer` }); chatId = r.data?.chatId ?? null; }
  catch (e) { hireErr = `${e.code} ${e.message}`; }
  check('hire succeeded', !hireErr, hireErr || 'ok');
  if (chatId) made.chats.push(chatId);
  const proj = await adminDb.collection('projects').doc(OPEN).get();
  const pd = proj.data();
  check('slotHolders contains the pro', (pd.slotHolders ?? []).includes(PRO));
  check('professionalIds contains the pro', (pd.professionalIds ?? []).includes(PRO));
  check('filledSlots has the Editor entry',
        (pd.filledSlots ?? []).some((s) => s.professionalId === PRO && s.category === 'Editor'));
  check('chatId written', !!pd.chatId, pd.chatId ?? 'missing');
  const feeDoc = await adminDb.doc(`projects/${OPEN}/fees/${PRO}`).get();
  check('fee doc created', feeDoc.exists);
  check('fee baseAmount = 1000', feeDoc.data()?.baseAmount === 1000, `got ${feeDoc.data()?.baseAmount}`);
  check('fee slotActive true', feeDoc.data()?.slotActive === true);
  if (pd.chatId) {
    const chat = await adminDb.collection('chats').doc(pd.chatId).get();
    check('group chat has both members',
          (chat.data()?.members ?? []).includes(PRO) && (chat.data()?.members ?? []).includes(CLIENT));
  }
  const acc = await adminDb.collection('priceOffers').doc(`${STAMP}-goodoffer`).get();
  check('offer marked accepted', acc.data()?.status === 'accepted');

  // ── 3/4. price bounds on CREATE ──
  console.log('\n3. Offer create bounds:');
  await as('pro');
  for (const [price, want] of [[50_001, false], [50_000, true], [0, false], [554_545, false]]) {
    let ok = true, id = null;
    try { id = (await addDoc(collection(db, 'priceOffers'), {
      projectId: OPEN, professionalId: PRO, category: 'Sound', price,
      status: 'pending', createdAt: serverTimestamp(),
    })).id; } catch { ok = false; }
    if (id) await adminDb.collection('priceOffers').doc(id).delete();
    check(`create at ₪${price.toLocaleString()}`.padEnd(28) + (want ? 'ALLOW' : 'deny '),
          ok === want, ok ? 'ALLOW' : 'deny');
  }

  // ── 5. decline the REAL ₪10,000,000 offer that already exists ──
  console.log('\n4. The live ₪10,000,000 offer is still declinable:');
  const big = (await adminDb.collection('priceOffers').get()).docs
    .filter((d) => (d.data().price ?? 0) > 50_000)
    .sort((a, b) => (b.data().price ?? 0) - (a.data().price ?? 0));
  if (!big.length) { check('found an out-of-range production offer', false, 'none'); }
  else {
    const target = big[0];
    const t = target.data();
    console.log(`     ${target.id}  ₪${t.price.toLocaleString()}  status=${t.status}  project=${t.projectId}`);
    const proj = await adminDb.collection('projects').doc(t.projectId).get();
    if (!proj.exists) {
      check('SKIPPED — its project was deleted, so no client can act on it', true, 'orphan');
    } else {
      // Do NOT mutate real data: copy the exact shape onto a throwaway doc owned
      // by the probe client, and decline that.
      const clone = `${STAMP}-bigclone`;
      await adminDb.collection('priceOffers').doc(clone).set({
        ...t, projectId: OPEN, professionalId: PRO, status: 'pending',
      });
      made.priceOffers.push(clone);
      await as('client');
      let ok = true;
      try { await updateDoc(doc(db, 'priceOffers', clone), { status: 'rejected' }); } catch { ok = false; }
      check(`client declines a ₪${t.price.toLocaleString()} offer`, ok, ok ? 'ALLOW' : 'deny');
    }
  }
} catch (e) {
  console.error('\nprobe threw:', e); failures++;
} finally {
  console.log('\nTeardown:');
  for (const tag of ['pro', 'client']) {
    try { await as(tag); await deleteUser(auth.currentUser); }
    catch (e) { console.error('  account delete failed', tag, e.code ?? e); failures++; }
  }
  for (const id of made.priceOffers) await adminDb.collection('priceOffers').doc(id).delete();
  for (const id of made.chats) await adminDb.collection('chats').doc(id).delete();
  for (const pid of made.projects) {
    const fees = await adminDb.collection(`projects/${pid}/fees`).get();
    for (const f of fees.docs) await f.ref.delete();
    await adminDb.collection('projects').doc(pid).delete();
  }
  let left = 0;
  for (const pid of made.projects) if ((await adminDb.collection('projects').doc(pid).get()).exists) left++;
  for (const id of made.priceOffers) if ((await adminDb.collection('priceOffers').doc(id).get()).exists) left++;
  for (const id of made.chats) if ((await adminDb.collection('chats').doc(id).get()).exists) left++;
  let leaked = 0;
  for (const tag of ['pro', 'client']) {
    try { await ga(adminApp).getUser(accounts[tag].uid); leaked++; } catch {}
  }
  check('probe docs removed', left === 0, `${left} left`);
  check('probe accounts removed', leaked === 0, `${leaked} leaked`);
}
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
