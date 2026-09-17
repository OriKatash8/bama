#!/usr/bin/env node
/**
 * V1 step (b) — the candidate review callables, end to end, against the EMULATORS.
 *
 *   firebase emulators:start --only firestore,auth,functions --project bama-af0a0 > emu.log
 *   EMU_LOG=emu.log node scripts/probe-candidate-review.mjs
 *
 * Scenarios:
 *  1 confirm + price-change lock + activation + crew message, idempotent
 *  2 reject the sole candidate with a reason: released, DM'd, project stays OPEN (C1)
 *  3 stale flag: rejected B's removed offer still says review:'pending'; after B's
 *    seat is refilled and confirmed, the project still activates
 *  4 C6: a candidate who completed cannot be rejected; the completion is logged
 *  5 rules (C4) with positive controls
 *  6 a professional cannot call either decision
 *  7 item 3: the pro acknowledges (proAccepted, review untouched; client cannot write it)
 *  8 item 3: the pro's one unprompted price request; respond-only after acknowledging
 *  9 item 3: sole pro declines → open project, own notice, client pushed, request closed
 * 10 item 3: who may call the professional callables
 * 11 a released BUNDLE candidate leaves the review (bundle 'removed', not stuck 'accepted')
 */
import { readFileSync, existsSync } from 'node:fs';
import { initializeApp as initAdmin } from 'firebase-admin/app';
import { getFirestore as getAdminDb } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import {
  getFirestore, connectFirestoreEmulator, doc, setDoc, updateDoc, setLogLevel,
} from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import {
  getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
} from 'firebase/auth';

setLogLevel('silent');
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
const P = 'bama-af0a0';
const adb = getAdminDb(initAdmin({ projectId: P }));
const app = initializeApp({ apiKey: 'k', projectId: P }, 'cr');
const db = getFirestore(app), auth = getAuth(app), fns = getFunctions(app);
connectFirestoreEmulator(db, '127.0.0.1', 8080);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
connectFunctionsEmulator(fns, '127.0.0.1', 5001);
const call = (name) => async (data) => {
  try { return { ok: true, data: (await httpsCallable(fns, name)(data)).data }; }
  catch (e) { return { ok: false, code: e.code, msg: String(e.message) }; }
};
const hire = call('hireProfessional');
const confirm = call('confirmCandidate');
const reject = call('rejectCandidate');
const acknowledge = call('acknowledgeCandidacy');
const decline = call('declineCandidacy');
const createPR = call('createPaymentRequest');
const respondPR = call('respondToPaymentRequest');
const markComplete = call('markEngagementComplete');

let failures = 0;
const check = (l, ok, d = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}${d ? `  — ${d}` : ''}`); if (!ok) failures++; };
const PW = 'pw123456';
const uids = {};
async function account(tag, displayName) {
  const email = `cr-${tag}@probe.invalid`;
  try { uids[tag] = (await createUserWithEmailAndPassword(auth, email, PW)).user.uid; }
  catch { uids[tag] = (await signInWithEmailAndPassword(auth, email, PW)).user.uid; }
  await signOut(auth);
  await adb.doc(`users/${uids[tag]}`).set({ displayName }, { merge: true });
}
async function as(tag) { await signOut(auth).catch(() => {}); await signInWithEmailAndPassword(auth, `cr-${tag}@probe.invalid`, PW); }
const get = async (path) => (await adb.doc(path).get()).data();
const created = [];

async function project(id, crewSlots) {
  await adb.doc(`projects/${id}`).set({
    clientId: uids.client, title: `Probe ${id}`, description: 'x', location: 'TLV', deadline: 'flexible',
    status: 'open', createdAt: new Date(), crewSlots, filledSlots: [],
  });
  created.push(id);
}
async function offer(id, projectId, proTag, category, price = 500) {
  await adb.doc(`priceOffers/${id}`).set({
    projectId, professionalId: uids[proTag], category, price, status: 'pending', createdAt: new Date(),
  });
}
async function systemMessages(projectId) {
  const chatId = (await get(`projects/${projectId}`))?.chatId;
  if (!chatId) return [];
  const snap = await adb.collection(`chats/${chatId}/messages`).get();
  return snap.docs.map((d) => d.data()).filter((m) => m.system).map((m) => m.text);
}

async function wipe() {
  for (const col of ['priceOffers', 'bundleOffers']) {
    for (const d of (await adb.collection(col).get()).docs) if (String(d.id).startsWith('cr-')) await d.ref.delete();
  }
  for (const id of created.splice(0)) {
    const ref = adb.doc(`projects/${id}`);
    const chatId = (await ref.get()).data()?.chatId;
    for (const sub of ['fees', 'paymentRequests']) for (const d of (await ref.collection(sub).get()).docs) await d.ref.delete();
    if (chatId) {
      for (const m of (await adb.collection(`chats/${chatId}/messages`).get()).docs) await m.ref.delete();
      await adb.doc(`chats/${chatId}`).delete();
    }
    await ref.delete();
  }
}

await account('client', 'Client Probe');
await account('proA', 'Avi Editor');
await account('proB', 'Beni Sound');
await account('proC', 'Chen Sound');

try {
  // ── 1 ────────────────────────────────────────────────────────────────────
  console.log('\n=== 1. confirm, price-change lock, activation ===');
  await project('cr-p1', [{ category: 'Editor', quantity: 1 }]);
  await offer('cr-o1', 'cr-p1', 'proA', 'Editor', 500);
  await as('client');
  check('hire A', (await hire({ offerId: 'cr-o1' })).ok);
  check('offer starts review: pending', (await get('priceOffers/cr-o1')).review === 'pending');

  const pr = await createPR({ projectId: 'cr-p1', professionalId: uids.proA, proposedAmount: 450, category: 'Editor' });
  check('client raises a price change', pr.ok, pr.msg);
  const blocked = await confirm({ projectId: 'cr-p1', professionalId: uids.proA });
  check('confirm refused while the price change is pending', !blocked.ok && blocked.msg.includes('price-change-pending'), blocked.msg);
  check('...and review still pending', (await get('priceOffers/cr-o1')).review === 'pending');

  await as('proA');
  check('pro accepts the price change', (await respondPR({ projectId: 'cr-p1', requestId: pr.data.requestId, accept: true })).ok);
  await as('client');
  const c1 = await confirm({ projectId: 'cr-p1', professionalId: uids.proA });
  check('confirm now succeeds and activates', c1.ok && c1.data.activated === true, JSON.stringify(c1.data ?? c1.msg));
  const o1 = await get('priceOffers/cr-o1');
  check('offer confirmed at the agreed price', o1.review === 'confirmed' && o1.price === 450 && !!o1.reviewedAt, `${o1.review} ${o1.price}`);
  check('project is in_progress', (await get('projects/cr-p1')).status === 'in_progress');
  let crew = (await systemMessages('cr-p1')).filter((t) => t.startsWith('🎬'));
  check('one crew message naming the pro', crew.length === 1 && crew[0].includes('Avi Editor'), JSON.stringify(crew));
  const again = await confirm({ projectId: 'cr-p1', professionalId: uids.proA });
  check('confirming again is refused (not-under-review)', !again.ok && again.msg.includes('not-under-review'), again.msg);
  crew = (await systemMessages('cr-p1')).filter((t) => t.startsWith('🎬'));
  check('still exactly one crew message', crew.length === 1, `${crew.length}`);
  await wipe();

  // ── 2 ────────────────────────────────────────────────────────────────────
  console.log('\n=== 2. reject the sole candidate (C1) ===');
  await project('cr-p2', [{ category: 'Editor', quantity: 1 }]);
  await offer('cr-o2', 'cr-p2', 'proA', 'Editor');
  await as('client');
  check('hire A', (await hire({ offerId: 'cr-o2' })).ok);
  const chatId2 = (await get('projects/cr-p2')).chatId;
  const r2 = await reject({ projectId: 'cr-p2', professionalId: uids.proA, reason: 'בחרנו סגנון עריכה אחר' });
  check('reject succeeds, DM sent, no activation', r2.ok && r2.data.dmSent === true && r2.data.activated === false, JSON.stringify(r2.data ?? r2.msg));
  const p2 = await get('projects/cr-p2');
  check('project stays OPEN, not completed (C1)', p2.status === 'open', p2.status);
  check('pro out of professionalIds and slotHolders', !(p2.professionalIds ?? []).includes(uids.proA) && !(p2.slotHolders ?? []).includes(uids.proA));
  check('seat vacant again', !(p2.filledSlots ?? []).some((s) => s.professionalId === uids.proA));
  const chat2 = await get(`chats/${chatId2}`);
  check('pro removed from chat members', !chat2.members.includes(uids.proA));
  const fee2 = await get(`projects/cr-p2/fees/${uids.proA}`);
  check('fee withdrawn / candidate_rejected / not owed', fee2.engagementStatus === 'withdrawn' && fee2.releaseReason === 'candidate_rejected' && fee2.status === 'not_owed', JSON.stringify({ e: fee2.engagementStatus, r: fee2.releaseReason, s: fee2.status }));
  const o2 = await get('priceOffers/cr-o2');
  check('offer removed (stale review flag left as-is)', o2.status === 'removed' && o2.review === 'pending', `${o2.status}/${o2.review}`);
  const msgs2 = (await adb.collection(`chats/${chatId2}/messages`).get()).docs.map((d) => d.data());
  check('neutral "left" notice in group chat', msgs2.some((m) => m.system && m.text.includes('עזב את הפרויקט')));
  check('reason NOT in group chat', !msgs2.some((m) => String(m.text).includes('סגנון עריכה')));
  const dm = (await adb.collection(`chats/sys_${uids.proA}/messages`).get()).docs.map((d) => d.data().text);
  check('reason delivered by private BAMA DM', dm.some((t) => t.includes('בחרנו סגנון עריכה אחר') && t.includes('Probe cr-p2')), JSON.stringify(dm.at(-1)));
  check('client can hire onto the project again', (await (async () => { await offer('cr-o2b', 'cr-p2', 'proB', 'Editor'); return hire({ offerId: 'cr-o2b' }); })()).ok);
  await wipe();

  // ── 3 ────────────────────────────────────────────────────────────────────
  console.log('\n=== 3. stale review flag on a removed offer does not block activation ===');
  await project('cr-p3', [{ category: 'Editor', quantity: 1 }, { category: 'Sound Recordist', quantity: 1 }]);
  await offer('cr-o3a', 'cr-p3', 'proA', 'Editor');
  await offer('cr-o3b', 'cr-p3', 'proB', 'Sound Recordist');
  await as('client');
  check('hire A and B', (await hire({ offerId: 'cr-o3a' })).ok && (await hire({ offerId: 'cr-o3b' })).ok);
  const a3 = await confirm({ projectId: 'cr-p3', professionalId: uids.proA });
  check('confirm A — not yet active (B pending)', a3.ok && a3.data.activated === false, JSON.stringify(a3.data ?? a3.msg));
  const b3 = await reject({ projectId: 'cr-p3', professionalId: uids.proB });
  check('reject B (no reason) — not active, Sound seat is vacant (C3)', b3.ok && b3.data.activated === false && b3.data.dmSent === false, JSON.stringify(b3.data ?? b3.msg));
  check('project still open', (await get('projects/cr-p3')).status === 'open');
  await offer('cr-o3c', 'cr-p3', 'proC', 'Sound Recordist');
  check('hire C into the Sound seat', (await hire({ offerId: 'cr-o3c' })).ok);
  check('precondition: B\'s removed offer still carries review: pending', (await get('priceOffers/cr-o3b')).review === 'pending');
  const c3 = await confirm({ projectId: 'cr-p3', professionalId: uids.proC });
  check('confirm C ACTIVATES despite the stale flag', c3.ok && c3.data.activated === true, JSON.stringify(c3.data ?? c3.msg));
  check('project in_progress', (await get('projects/cr-p3')).status === 'in_progress');
  const crew3 = (await systemMessages('cr-p3')).filter((t) => t.startsWith('🎬'));
  check('crew message names A and C, not B', crew3.length === 1 && crew3[0].includes('Avi Editor') && crew3[0].includes('Chen Sound') && !crew3[0].includes('Beni Sound'), JSON.stringify(crew3));
  await wipe();

  // ── 4 ────────────────────────────────────────────────────────────────────
  console.log('\n=== 4. C6: completed under review ===');
  await project('cr-p4', [{ category: 'Editor', quantity: 1 }]);
  await offer('cr-o4', 'cr-p4', 'proA', 'Editor');
  await as('client');
  check('hire A', (await hire({ offerId: 'cr-o4' })).ok);
  await as('proA');
  const done = await markComplete({ projectId: 'cr-p4' });
  check('pro completes while still under review (never blocked)', done.ok, done.msg);
  await as('client');
  const r4 = await reject({ projectId: 'cr-p4', professionalId: uids.proA });
  check('reject refused: engagement-not-open', !r4.ok && r4.msg.includes('engagement-not-open'), r4.msg);
  check('fee left completed, not voided', (await get(`projects/cr-p4/fees/${uids.proA}`)).engagementStatus === 'completed');
  if (process.env.EMU_LOG && existsSync(process.env.EMU_LOG)) {
    await new Promise((r) => setTimeout(r, 1500));
    const log = readFileSync(process.env.EMU_LOG, 'utf8');
    check('completion under review was logged', log.includes('[review] engagement completed while under review'));
  } else {
    console.log('  SKIP  log check (EMU_LOG not set)');
  }
  await wipe();

  // ── 5 ────────────────────────────────────────────────────────────────────
  console.log('\n=== 5. rules (C4) ===');
  await as('client');
  const tryCreate = async (id, status) => {
    try { await setDoc(doc(db, 'projects', id), { clientId: uids.client, title: 't', status, crewSlots: [], filledSlots: [] }); created.push(id); return 'allowed'; }
    catch (e) { return e.code; }
  };
  check('CONTROL create with status open', (await tryCreate('cr-r-open', 'open')) === 'allowed');
  check('create with status in_progress denied', (await tryCreate('cr-r-ip', 'in_progress')) === 'permission-denied');
  const tryStatus = async (id, status) => { try { await updateDoc(doc(db, 'projects', id), { status }); return 'allowed'; } catch (e) { return e.code; } };
  check('update open → in_progress denied', (await tryStatus('cr-r-open', 'in_progress')) === 'permission-denied');
  await adb.doc('projects/cr-r-open').update({ status: 'in_progress' });
  check('CONTROL update in_progress → open allowed (repost)', (await tryStatus('cr-r-open', 'open')) === 'allowed');
  check('CONTROL unrelated client field still editable', (await (async () => { try { await updateDoc(doc(db, 'projects', 'cr-r-open'), { title: 't2' }); return 'allowed'; } catch (e) { return e.code; } })()) === 'allowed');
  await wipe();

  // ── 6 ────────────────────────────────────────────────────────────────────
  console.log('\n=== 6. only the client decides ===');
  await project('cr-p6', [{ category: 'Editor', quantity: 1 }]);
  await offer('cr-o6', 'cr-p6', 'proA', 'Editor');
  await as('client');
  await hire({ offerId: 'cr-o6' });
  await as('proA');
  const pc = await confirm({ projectId: 'cr-p6', professionalId: uids.proA });
  const pr6 = await reject({ projectId: 'cr-p6', professionalId: uids.proA });
  check('pro calling confirmCandidate → permission-denied', !pc.ok && pc.code === 'functions/permission-denied', pc.code);
  check('pro calling rejectCandidate → permission-denied', !pr6.ok && pr6.code === 'functions/permission-denied', pr6.code);
  check('...and nothing changed', (await get('priceOffers/cr-o6')).review === 'pending' && (await get('priceOffers/cr-o6')).status === 'accepted');

  // ── 7 ────────────────────────────────────────────────────────────────────
  console.log('\n=== 7. pro acknowledges (Option A) ===');
  await project('cr-p7', [{ category: 'Editor', quantity: 1 }]);
  await offer('cr-o7', 'cr-p7', 'proA', 'Editor');
  await as('client');
  check('hire A', (await hire({ offerId: 'cr-o7' })).ok);
  await as('proA');
  const ack = await acknowledge({ projectId: 'cr-p7' });
  check('pro acknowledges', ack.ok && ack.data.acknowledged === 1, JSON.stringify(ack.data ?? ack.msg));
  const o7 = await get('priceOffers/cr-o7');
  check('proAccepted recorded, review still pending', o7.proAccepted === true && !!o7.proAcceptedAt && o7.review === 'pending', JSON.stringify({ pa: o7.proAccepted, r: o7.review }));
  check('acknowledging again is fine (idempotent)', (await acknowledge({ projectId: 'cr-p7' })).ok);
  check('project did not activate from the pro side', (await get('projects/cr-p7')).status === 'open');
  await as('client');
  let clientWrite;
  try { await updateDoc(doc(db, 'priceOffers', 'cr-o7'), { proAccepted: false }); clientWrite = 'allowed'; } catch (e) { clientWrite = e.code; }
  check('client cannot write proAccepted', clientWrite === 'permission-denied', clientWrite);
  await as('proA');
  let proWrite;
  try { await updateDoc(doc(db, 'priceOffers', 'cr-o7'), { proAccepted: false }); proWrite = 'allowed'; } catch (e) { proWrite = e.code; }
  check('pro cannot write proAccepted directly either', proWrite === 'permission-denied', proWrite);
  await as('client');
  const c7 = await confirm({ projectId: 'cr-p7', professionalId: uids.proA });
  check('client still confirms as before → activates', c7.ok && c7.data.activated === true, JSON.stringify(c7.data ?? c7.msg));
  await wipe();

  // ── 8 ────────────────────────────────────────────────────────────────────
  console.log('\n=== 8. pro unprompted price request ===');
  await project('cr-p8', [{ category: 'Editor', quantity: 1 }, { category: 'Sound Recordist', quantity: 1 }]);
  await offer('cr-o8e', 'cr-p8', 'proA', 'Editor', 500);
  await offer('cr-o8s', 'cr-p8', 'proA', 'Sound Recordist', 400);
  await as('client');
  check('hire A for Editor and Sound', (await hire({ offerId: 'cr-o8e' })).ok && (await hire({ offerId: 'cr-o8s' })).ok);
  await as('proA');
  const u1 = await createPR({ projectId: 'cr-p8', category: 'Editor', proposedAmount: 600 });
  check('pro raises one unprompted Editor request', u1.ok, u1.msg);
  const clientNote8 = (await adb.collection('notifications').where('userId', '==', uids.client).get()).docs
    .some((d) => String(d.get('message')).startsWith('💰'));
  check('client is pushed for it', clientNote8);
  await as('client');
  check('client rejects it', (await respondPR({ projectId: 'cr-p8', requestId: u1.data.requestId, accept: false })).ok);
  await as('proA');
  const u2 = await createPR({ projectId: 'cr-p8', category: 'Editor', proposedAmount: 620 });
  check('a second unprompted Editor request is refused', !u2.ok && u2.msg.includes('counter-not-allowed'), u2.msg);
  await as('client');
  const cp8 = await createPR({ projectId: 'cr-p8', professionalId: uids.proA, category: 'Editor', proposedAmount: 450 });
  check('client proposes', cp8.ok, cp8.msg);
  await as('proA');
  check('pro rejects the client proposal', (await respondPR({ projectId: 'cr-p8', requestId: cp8.data.requestId, accept: false })).ok);
  const counter8 = await createPR({ projectId: 'cr-p8', category: 'Editor', proposedAmount: 550 });
  check('…and may counter it', counter8.ok, counter8.msg);
  await as('client');
  check('client rejects the counter', (await respondPR({ projectId: 'cr-p8', requestId: counter8.data.requestId, accept: false })).ok);
  await as('proA');
  check('pro acknowledges', (await acknowledge({ projectId: 'cr-p8' })).ok);
  const soundAfterAck = await createPR({ projectId: 'cr-p8', category: 'Sound Recordist', proposedAmount: 450 });
  check('after acknowledging, his unused Sound unprompted request is refused', !soundAfterAck.ok && soundAfterAck.msg.includes('counter-not-allowed'), soundAfterAck.msg);
  await wipe();

  // ── 9 ────────────────────────────────────────────────────────────────────
  console.log('\n=== 9. sole pro declines ===');
  await project('cr-p9', [{ category: 'Editor', quantity: 1 }]);
  await offer('cr-o9', 'cr-p9', 'proB', 'Editor');
  await as('client');
  check('hire B', (await hire({ offerId: 'cr-o9' })).ok);
  const chatId9 = (await get('projects/cr-p9')).chatId;
  await as('proB');
  const pending9 = await createPR({ projectId: 'cr-p9', category: 'Editor', proposedAmount: 700 });
  check('B has a pending unprompted request', pending9.ok, pending9.msg);
  for (const n of (await adb.collection('notifications').where('userId', '==', uids.client).get()).docs) await n.ref.delete();
  const d9 = await decline({ projectId: 'cr-p9' });
  check('B declines', d9.ok && d9.data.activated === false, JSON.stringify(d9.data ?? d9.msg));
  const p9 = await get('projects/cr-p9');
  check('project stays OPEN', p9.status === 'open', p9.status);
  check('B out of professionalIds / slotHolders / seat', !(p9.professionalIds ?? []).includes(uids.proB) && !(p9.slotHolders ?? []).includes(uids.proB) && !(p9.filledSlots ?? []).some((f) => f.professionalId === uids.proB));
  const f9 = await get(`projects/cr-p9/fees/${uids.proB}`);
  check('fee withdrawn / candidate_declined / not_owed', f9.engagementStatus === 'withdrawn' && f9.releaseReason === 'candidate_declined' && f9.status === 'not_owed', JSON.stringify({ e: f9.engagementStatus, r: f9.releaseReason, s: f9.status }));
  check('offer removed', (await get('priceOffers/cr-o9')).status === 'removed');
  check('his pending request was closed', (await get(`projects/cr-p9/paymentRequests/${pending9.data.requestId}`)).status === 'rejected');
  const msgs9 = (await adb.collection(`chats/${chatId9}/messages`).get()).docs.map((d) => d.data()).filter((m) => m.system).map((m) => m.text);
  check('chat notice says he chose not to continue', msgs9.some((t) => t === 'Beni Sound החליט/ה לא להמשיך בפרויקט'), JSON.stringify(msgs9));
  const notes9 = (await adb.collection('notifications').where('userId', '==', uids.client).get()).docs.map((d) => d.data());
  check('client got a system push', notes9.some((n) => n.data?.type === 'system' && String(n.message).includes('החליט/ה לא להמשיך בפרויקט') && n.data?.chatId === chatId9), JSON.stringify(notes9.map((n) => n.message)));
  const again9 = await decline({ projectId: 'cr-p9' });
  check('declining again is refused (no longer on the project)', !again9.ok && again9.msg.includes('permission-denied') || again9.msg?.includes('Only a professional'), again9.msg);
  await wipe();

  // ── 10 ───────────────────────────────────────────────────────────────────
  console.log('\n=== 10. who may call the professional callables ===');
  await project('cr-p10', [{ category: 'Editor', quantity: 1 }]);
  await offer('cr-o10', 'cr-p10', 'proA', 'Editor');
  await as('client');
  await hire({ offerId: 'cr-o10' });
  const byClientAck = await acknowledge({ projectId: 'cr-p10' });
  const byClientDecline = await decline({ projectId: 'cr-p10' });
  check('client calling acknowledgeCandidacy → permission-denied', !byClientAck.ok && byClientAck.msg.includes('Only a professional'), byClientAck.msg);
  check('client calling declineCandidacy → permission-denied', !byClientDecline.ok && byClientDecline.msg.includes('Only a professional'), byClientDecline.msg);
  await as('proC');
  const outsider = await decline({ projectId: 'cr-p10' });
  check('a professional not on the project → permission-denied', !outsider.ok && outsider.msg.includes('Only a professional'), outsider.msg);
  await as('client');
  check('client confirms A', (await confirm({ projectId: 'cr-p10', professionalId: uids.proA })).ok);
  await as('proA');
  const lateDecline = await decline({ projectId: 'cr-p10' });
  check('after the client confirmed, decline → not-under-review', !lateDecline.ok && lateDecline.msg.includes('not-under-review'), lateDecline.msg);
  check('…and nothing changed', (await get(`projects/cr-p10/fees/${uids.proA}`)).engagementStatus === 'hired');
  await wipe();

  // ── 11 ───────────────────────────────────────────────────────────────────
  console.log('\n=== 11. a released bundle candidate leaves the review ===');
  await project('cr-p11', [{ category: 'Editor', quantity: 1 }, { category: 'Sound Recordist', quantity: 1 }]);
  await adb.doc('priceOffers/cr-b11a').set({ projectId: 'cr-p11', professionalId: uids.proB, category: 'Editor', price: 300, status: 'pending', bundleId: 'cr-bundle11', createdAt: new Date() });
  await adb.doc('priceOffers/cr-b11b').set({ projectId: 'cr-p11', professionalId: uids.proB, category: 'Sound Recordist', price: 300, status: 'pending', bundleId: 'cr-bundle11', createdAt: new Date() });
  await adb.doc('bundleOffers/cr-bundle11').set({ projectId: 'cr-p11', professionalId: uids.proB, slots: [{ category: 'Editor' }, { category: 'Sound Recordist' }], individualTotal: 600, bundlePrice: 550, offerIds: ['cr-b11a', 'cr-b11b'], status: 'pending', createdAt: new Date() });
  await as('client');
  check('hire B on the bundle', (await hire({ bundleId: 'cr-bundle11' })).ok);
  check('bundle under review', (await get('bundleOffers/cr-bundle11')).review === 'pending');
  const r11 = await reject({ projectId: 'cr-p11', professionalId: uids.proB });
  check('client rejects B', r11.ok, r11.msg);
  const b11 = await get('bundleOffers/cr-bundle11');
  check('the BUNDLE is removed too (was left accepted + pending)', b11.status === 'removed', b11.status);
  check('its component offers are removed', (await get('priceOffers/cr-b11a')).status === 'removed' && (await get('priceOffers/cr-b11b')).status === 'removed');
  const still11 = [...(await adb.collection('priceOffers').where('projectId', '==', 'cr-p11').where('status', '==', 'accepted').get()).docs,
    ...(await adb.collection('bundleOffers').where('projectId', '==', 'cr-p11').where('status', '==', 'accepted').get()).docs]
    .filter((d) => d.get('review') === 'pending');
  check('nothing on the project is still accepted + under review', still11.length === 0, `${still11.length}`);
  await wipe();
} catch (e) {
  console.error('\nprobe threw:', e); failures++;
} finally {
  await wipe();
  for (const tag of Object.keys(uids)) {
    await adb.doc(`chats/sys_${uids[tag]}`).collection('messages').get().then((s) => Promise.all(s.docs.map((d) => d.ref.delete())));
    await adb.doc(`chats/sys_${uids[tag]}`).delete();
  }
}
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
