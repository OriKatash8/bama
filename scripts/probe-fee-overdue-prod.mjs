#!/usr/bin/env node
/**
 * PRODUCTION verification of the overdue-fee block.
 *
 * With throwaway accounts, the EXACT writes and calls the app ships:
 *   - usePriceOffer's priceOffers / bundleOffers addDoc, useProjectApplication's
 *     projectApplications addDoc, useAcceptOffer's hireProfessional({ offerId });
 *   - the admin's markFeePaid / resolveFeeDispute callables.
 *
 * It answers:
 *   1. switch OFF: a pro with an overdue fee sends offers and is hired normally;
 *   2. switch ON: that pro is refused on all three creates and on hire
 *      ('fee-overdue'), while an unblocked pro offers and is hired normally;
 *   3. a pro cannot mark their own fee paid, clear overdueAt, or write feeBlocks;
 *      a client cannot read feeBlocks;
 *   4. switching OFF lifts the offer block on the very next request;
 *   5. markFeePaid lifts the block BEFORE it returns (no waiting on the trigger);
 *   6. resolveFeeDispute: didnt_happen → completed restores the fee;
 *      amount_disputed → completed at an agreed price prices it like completion,
 *      minimum fee included; cancelled voids it; a non-admin is refused.
 *
 * THE KILL SWITCH IS FLIPPED IN PRODUCTION for the probe's duration and restored
 * in `finally`. It refuses to start if the switch is already on. No real fee
 * carries `overdueAt` until the switch has been on for a completion, so while it
 * is on here no real professional can be blocked.
 *
 *   node scripts/probe-fee-overdue-prod.mjs [--run-file <path>]
 *
 * --run-file records { stamp, uids } as they are created, so
 * scripts/probe-fee-overdue-sweep-prod.mjs can restore the switch and clean up
 * even if this process dies. Teardown also runs on SIGINT/SIGTERM and on an
 * uncaught error, not only in `finally`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, collection, addDoc, serverTimestamp,
} from 'firebase/firestore';
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, deleteUser,
} from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';

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

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// ── 0. The shipped shapes, asserted out of the source ─────────────────────
{
  const offer = src('src/features/noticeboard/hooks/usePriceOffer.ts');
  const app = src('src/features/noticeboard/hooks/useProjectApplication.ts');
  const accept = src('src/features/offers/hooks/useAcceptOffer.ts');
  const problems = [];
  if (!/addDocument\('priceOffers', \{\s*projectId,\s*professionalId: user\.id,\s*category: slot\.category,\s*price: slot\.price,\s*status: 'pending' as const,\s*createdAt: serverTimestamp\(\),\s*\}\)/.test(offer)) problems.push('priceOffers payload');
  if (!/addDocument\('bundleOffers', \{\s*projectId,\s*professionalId: user\.id,\s*slots:[\s\S]*?individualTotal:[\s\S]*?bundlePrice,\s*offerIds,\s*status: 'pending' as const,\s*createdAt: \{ seconds/.test(offer)) problems.push('bundleOffers payload');
  if (!/addDocument\('projectApplications', \{\s*projectId,\s*professionalId: user\.id,\s*status: 'pending' as const,\s*createdAt: \{ seconds/.test(app)) problems.push('projectApplications payload');
  if (!/callFunction<\{ offerId: string \}, HireResult>\('hireProfessional'\)/.test(accept)) problems.push('hireProfessional({ offerId })');
  if (problems.length) {
    console.error(`ABORT: the shipped shape changed (${problems.join(', ')}). Update this probe first.`);
    process.exit(1);
  }
  console.log('shipped shapes confirmed: priceOffers, bundleOffers, projectApplications, hireProfessional({offerId})\n');
}

const STAMP = `probe${Date.now()}`;
const runFileArg = process.argv.indexOf('--run-file');
const RUN_FILE = runFileArg > -1 ? process.argv[runFileArg + 1] : null;
const recordRun = () => {
  if (!RUN_FILE) return;
  writeFileSync(RUN_FILE, JSON.stringify({ stamp: STAMP, uids: Object.fromEntries(Object.entries(accounts).map(([t, a]) => [t, a.uid])) }, null, 2));
};
console.log(`STAMP=${STAMP}`);
const app = initializeApp(cfg, STAMP);
const db = getFirestore(app), auth = getAuth(app);
const fns = getFunctions(app);

const { initializeApp: ia } = await import('firebase-admin/app');
const { getFirestore: gdb, Timestamp } = await import('firebase-admin/firestore');
const { getAuth: ga } = await import('firebase-admin/auth');
const adminApp = ia({ projectId: cfg.projectId }, STAMP);
const adminDb = gdb(adminApp);
const adminAuth = ga(adminApp);

const DAY = 86400_000;
const PW = 'Probe-Password-123!';
const accounts = {};
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** true = allowed, false = rules denied. Anything else throws. */
async function allowed(fn) {
  try { await fn(); return true; } catch (e) {
    if (e?.code === 'permission-denied') return false;
    throw e;
  }
}
/** A callable's outcome: 'ok', or the HttpsError message (e.g. 'fee-overdue'), or the code. */
async function call(name, data) {
  try { return { outcome: 'ok', data: (await httpsCallable(fns, name)(data)).data }; } catch (e) {
    if (e?.code === 'functions/not-found' || e?.code === 'functions/internal') {
      throw new Error(`${name}: ${e.code} — not deployed, or it crashed`);
    }
    return { outcome: e?.message || e?.code, code: e?.code };
  }
}

async function mk(tag, claims) {
  const email = `${STAMP}.${tag}@bama-invalid.test`;
  const c = await createUserWithEmailAndPassword(auth, email, PW);
  accounts[tag] = { uid: c.user.uid, email };
  recordRun();
  if (claims) await adminAuth.setCustomUserClaims(c.user.uid, claims);
  await signOut(auth);
  return c.user.uid;
}
async function as(tag) {
  await signOut(auth).catch(() => {});
  await signInWithEmailAndPassword(auth, accounts[tag].email, PW);
  await auth.currentUser.getIdToken(true); // pick up custom claims
}

// The shipped writes, verbatim.
const sendOffer = (projectId, proId, category, price = 1000) => addDoc(collection(db, 'priceOffers'), {
  projectId, professionalId: proId, category, price, status: 'pending', createdAt: serverTimestamp(),
});
const sendBundle = (projectId, proId) => addDoc(collection(db, 'bundleOffers'), {
  projectId, professionalId: proId, slots: [{ category: 'Editor' }, { category: 'Colorist' }],
  individualTotal: 2000, bundlePrice: 1800, offerIds: ['x', 'y'], status: 'pending',
  createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
});
const sendApplication = (projectId, proId) => addDoc(collection(db, 'projectApplications'), {
  projectId, professionalId: proId, status: 'pending',
  createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
});

const configRef = adminDb.doc('config/pricing');
const original = (await configRef.get()).get('feeOverdueBlockEnabled');
if (original === true) {
  console.error('ABORT: feeOverdueBlockEnabled is already ON in production. Not touching a live switch.');
  process.exit(1);
}
console.log(`kill switch before the probe: ${JSON.stringify(original ?? null)} (restored to false at the end)\n`);
recordRun();
const setSwitch = async (on) => { await configRef.set({ feeOverdueBlockEnabled: on }, { merge: true }); };
/** hireProfessional caches config/pricing for 60s per instance. */
const CONFIG_CACHE_MS = 65_000;

const made = { projects: [], chats: new Set() };

let tornDown = false;
/** Restore the switch, then remove everything. Runs once, from `finally` or a signal. */
async function teardown() {
  if (tornDown) return;
  tornDown = true;
  console.log('\nTeardown:');
  // The switch FIRST — the one change that touches everyone.
  try {
    await configRef.set({ feeOverdueBlockEnabled: false }, { merge: true });
    const now = (await configRef.get()).get('feeOverdueBlockEnabled');
    check('kill switch restored to false', now === false, JSON.stringify(now));
  } catch (e) { console.error('  SWITCH RESTORE FAILED — set config/pricing.feeOverdueBlockEnabled by hand', e); failures++; }

  const uids = Object.values(accounts).map((a) => a.uid);
  for (const tag of Object.keys(accounts)) {
    try { await as(tag); await deleteUser(auth.currentUser); }
    catch (e) { console.error('  account delete failed', tag, e?.code ?? e); failures++; }
  }
  await signOut(auth).catch(() => {});

  for (const pid of made.projects) {
    const chatId = (await adminDb.doc(`projects/${pid}`).get()).get('chatId');
    if (chatId) made.chats.add(chatId);
  }
  for (const col of ['priceOffers', 'bundleOffers', 'projectApplications']) {
    for (const pid of made.projects) {
      for (const d of (await adminDb.collection(col).where('projectId', '==', pid).get()).docs) await d.ref.delete();
    }
  }
  for (const id of made.chats) await adminDb.recursiveDelete(adminDb.doc(`chats/${id}`));
  for (const pid of made.projects) await adminDb.recursiveDelete(adminDb.doc(`projects/${pid}`));
  // The fee-delete triggers recompute feeBlocks once more, and the hire triggers
  // write notifications asynchronously; let both land, then sweep.
  await sleep(15_000);
  for (const uid of uids) {
    for (const n of (await adminDb.collection('notifications').where('userId', '==', uid).get()).docs) await n.ref.delete();
    await adminDb.doc(`feeBlocks/${uid}`).delete();
    await adminDb.recursiveDelete(adminDb.doc(`users/${uid}`));
  }

  // ASSERT the teardown.
  let left = 0;
  for (const pid of made.projects) {
    if ((await adminDb.doc(`projects/${pid}`).get()).exists) left++;
    for (const col of ['priceOffers', 'bundleOffers', 'projectApplications']) {
      left += (await adminDb.collection(col).where('projectId', '==', pid).get()).size;
    }
  }
  for (const id of made.chats) if ((await adminDb.doc(`chats/${id}`).get()).exists) left++;
  let leaked = 0;
  for (const uid of uids) {
    try { await adminAuth.getUser(uid); leaked++; } catch { /* gone */ }
    if ((await adminDb.doc(`users/${uid}`).get()).exists) leaked++;
    if ((await adminDb.doc(`feeBlocks/${uid}`).get()).exists) leaked++;
    leaked += (await adminDb.collection('notifications').where('userId', '==', uid).get()).size;
  }
  check('probe docs removed', left === 0, `${left} left`);
  check('probe accounts, user docs, feeBlocks and notifications removed', leaked === 0, `${leaked} leaked`);
}
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    console.error(`\n${sig} — tearing down before exit`);
    failures++;
    await teardown().catch((e) => console.error('teardown failed', e));
    process.exit(1);
  });
}
process.on('uncaughtException', async (e) => {
  console.error('\nuncaught:', e);
  failures++;
  await teardown().catch((err) => console.error('teardown failed', err));
  process.exit(1);
});


const proj = async (id, data) => { made.projects.push(id); await adminDb.doc(`projects/${id}`).set(data); };

try {
  const PRO = await mk('pro');            // will have an overdue fee
  const PRO2 = await mk('pro2');          // clean
  const CLIENT = await mk('client');
  await mk('admin', { role: 'admin' });
  console.log(`pro=${PRO}\npro2=${PRO2}\nclient=${CLIENT}\nadmin=${accounts.admin.uid}\n`);

  const openProject = (title) => ({
    clientId: CLIENT, title, description: 'probe', location: 'TLV', deadline: 'flexible',
    crewSlots: [{ category: 'Editor', quantity: 1 }, { category: 'Colorist', quantity: 1 }],
    filledSlots: [], professionalIds: [], slotHolders: [], status: 'open', createdAt: new Date(),
  });
  const P_OFF = `${STAMP}-off`, P_ON = `${STAMP}-on`, P_DEBT = `${STAMP}-debt`;
  await proj(P_OFF, openProject('Probe overdue — switch off'));
  await proj(P_ON, openProject('Probe overdue — switch on'));

  // The debt: a completed engagement whose fee is past overdueAt and unpaid.
  const overdueAt = Date.now() - 2 * DAY;
  await proj(P_DEBT, {
    ...openProject('Probe overdue — the debt'), status: 'completed', professionalIds: [PRO],
    completion: { state: 'confirmed', source: 'client', confirmedAt: new Date(Date.now() - 9 * DAY) },
  });
  await adminDb.doc(`projects/${P_DEBT}/fees/${PRO}`).set({
    professionalId: PRO, projectId: P_DEBT, feeStatus: 'owed', status: 'pending', feePaid: false,
    feeRate: 0.03, minFeeApplied: 6, baseAmount: 1000, feeDue: 30, slotActive: false,
    engagementStatus: 'completed', chargeDueAt: Timestamp.fromMillis(Date.now() - 5 * DAY),
    overdueAt: Timestamp.fromMillis(overdueAt),
    completion: { state: 'confirmed', source: 'client', confirmedAt: new Date(Date.now() - 9 * DAY) },
    createdAt: new Date(), hiredAt: new Date(),
  });

  // ── the trigger maintains feeBlocks in production ──────────────────────
  console.log('1. The fee-write trigger builds feeBlocks/{pro}:');
  let blockedFrom = null;
  for (let i = 0; i < 30 && blockedFrom === null; i++) {
    await sleep(2000);
    blockedFrom = (await adminDb.doc(`feeBlocks/${PRO}`).get()).get('blockedFrom')?.toMillis?.() ?? null;
  }
  check('feeBlocks/{pro}.blockedFrom = the fee\'s overdueAt', blockedFrom === overdueAt,
    `got ${blockedFrom}, want ${overdueAt}`);

  // ── switch OFF ─────────────────────────────────────────────────────────
  console.log('\n2. Switch OFF — the pro with an overdue fee works normally:');
  await as('pro');
  check('pro sends a price offer'.padEnd(52) + 'ALLOW', await allowed(() => sendOffer(P_OFF, PRO, 'Editor')));
  const proOfferOn = (await sendOffer(P_ON, PRO, 'Editor')).id; // for the switch-ON hire attempt
  check('pro sends a bundle offer'.padEnd(52) + 'ALLOW', await allowed(() => sendBundle(P_OFF, PRO)));
  check('pro sends an application'.padEnd(52) + 'ALLOW', await allowed(() => sendApplication(P_OFF, PRO)));
  const proOfferOff = (await adminDb.collection('priceOffers')
    .where('projectId', '==', P_OFF).where('professionalId', '==', PRO).get()).docs[0].id;
  await as('client');
  const hireOff = await call('hireProfessional', { offerId: proOfferOff });
  check('client hires the pro'.padEnd(52) + 'ok   ', hireOff.outcome === 'ok', hireOff.outcome);

  // ── switch ON ──────────────────────────────────────────────────────────
  console.log('\n3. Switch ON — the pro is refused new work:');
  await setSwitch(true);
  await as('pro');
  check('pro sends a price offer'.padEnd(52) + 'deny ', !(await allowed(() => sendOffer(P_ON, PRO, 'Colorist'))));
  check('pro sends a bundle offer'.padEnd(52) + 'deny ', !(await allowed(() => sendBundle(P_ON, PRO))));
  check('pro sends an application'.padEnd(52) + 'deny ', !(await allowed(() => sendApplication(P_ON, PRO))));
  check('pro edits an EXISTING pending offer (not new)'.padEnd(52) + 'ALLOW',
    await allowed(() => updateDoc(doc(db, 'priceOffers', proOfferOn), { price: 1100 })));
  check('pro reads own feeBlocks'.padEnd(52) + 'ALLOW', await allowed(() => getDoc(doc(db, `feeBlocks/${PRO}`))));
  check('pro clears own feeBlocks'.padEnd(52) + 'deny ',
    !(await allowed(() => setDoc(doc(db, `feeBlocks/${PRO}`), { blockedFrom: null }))));
  const feePath = `projects/${P_DEBT}/fees/${PRO}`;
  check('pro marks own fee paid'.padEnd(52) + 'deny ',
    !(await allowed(() => updateDoc(doc(db, feePath), { status: 'paid', feePaid: true, feeDue: 0 }))));
  check('pro clears own overdueAt'.padEnd(52) + 'deny ',
    !(await allowed(() => updateDoc(doc(db, feePath), { overdueAt: null }))));
  check('pro turns the switch off'.padEnd(52) + 'deny ',
    !(await allowed(() => setDoc(doc(db, 'config/pricing'), { feeOverdueBlockEnabled: false }, { merge: true }))));

  await as('pro2');
  const pro2Offer = await allowed(() => sendOffer(P_ON, PRO2, 'Colorist'));
  check('unblocked pro2 sends a price offer'.padEnd(52) + 'ALLOW', pro2Offer);
  await as('client');
  check('client reads the pro\'s feeBlocks'.padEnd(52) + 'deny ',
    !(await allowed(() => getDoc(doc(db, `feeBlocks/${PRO}`)))));

  console.log(`   (waiting ${CONFIG_CACHE_MS / 1000}s for hireProfessional's config cache)`);
  await sleep(CONFIG_CACHE_MS);
  const hireBlocked = await call('hireProfessional', { offerId: proOfferOn });
  check('client hires the blocked pro'.padEnd(52) + 'fee-overdue', hireBlocked.outcome === 'fee-overdue',
    `${hireBlocked.code} ${hireBlocked.outcome}`);
  const pro2OfferId = (await adminDb.collection('priceOffers')
    .where('projectId', '==', P_ON).where('professionalId', '==', PRO2).get()).docs[0].id;
  const hirePro2 = await call('hireProfessional', { offerId: pro2OfferId });
  check('client hires the unblocked pro2'.padEnd(52) + 'ok   ', hirePro2.outcome === 'ok', hirePro2.outcome);

  // ── the switch lifts every offer block at once ─────────────────────────
  console.log('\n4. Kill switch:');
  await setSwitch(false);
  await as('pro');
  check('switch OFF → pro sends an offer on the next request'.padEnd(52) + 'ALLOW',
    await allowed(() => sendOffer(P_OFF, PRO, 'Colorist')));
  await setSwitch(true);
  check('switch back ON → blocked again'.padEnd(52) + 'deny ',
    !(await allowed(() => sendOffer(P_OFF, PRO, 'Colorist', 1200))));

  // ── payment lifts the block before markFeePaid returns ─────────────────
  console.log('\n5. Payment:');
  await as('pro');
  check('a pro cannot call markFeePaid'.padEnd(52) + 'denied',
    (await call('markFeePaid', { projectId: P_DEBT, professionalId: PRO })).code === 'functions/permission-denied');
  await as('admin');
  const paid = await call('markFeePaid', { projectId: P_DEBT, professionalId: PRO });
  check('admin markFeePaid'.padEnd(52) + 'ok   ', paid.outcome === 'ok', JSON.stringify(paid.data ?? paid.outcome));
  const afterPay = (await adminDb.doc(`feeBlocks/${PRO}`).get()).get('blockedFrom');
  check('feeBlocks cleared by the time markFeePaid returned', afterPay === null, String(afterPay));
  await as('pro');
  check('pro sends an offer right after payment'.padEnd(52) + 'ALLOW',
    await allowed(() => sendOffer(P_OFF, PRO, 'Colorist', 1300)));
  await as('client');
  const hireAfter = await call('hireProfessional', { offerId: proOfferOn });
  check('client hires the pro after payment'.padEnd(52) + 'ok   ', hireAfter.outcome === 'ok', hireAfter.outcome);

  // ── dispute resolution ────────────────────────────────────────────────
  console.log('\n6. resolveFeeDispute:');
  const disputed = async (id, fee) => {
    await proj(id, { ...openProject(`Probe dispute ${id}`), professionalIds: [PRO2], slotHolders: [PRO2], adminReviewPending: true });
    await adminDb.doc(`projects/${id}/fees/${PRO2}`).set({
      professionalId: PRO2, projectId: id, feeStatus: 'owed', feeRate: 0.03, minFeeApplied: 6,
      baseAmount: 1000, slotActive: false, engagementStatus: 'disputed', adminReviewPending: true,
      chargeDueAt: Timestamp.fromMillis(Date.now() - DAY), createdAt: new Date(), ...fee,
    });
  };
  const D1 = `${STAMP}-d1`, D2 = `${STAMP}-d2`, D3 = `${STAMP}-d3`;
  await disputed(D1, { status: 'not_owed', feeDue: 0, preDispute: { feeDue: 30, status: 'pending', baseAmount: 1000 },
    adminReview: { reason: 'didnt_happen' } });
  await disputed(D2, { status: 'pending', feeDue: 30, preDispute: { feeDue: 30, status: 'pending', baseAmount: 1000 },
    adminReview: { reason: 'fee_disputed' } });
  await disputed(D3, { status: 'pending', feeDue: 30, adminReview: { reason: 'fee_disputed' } });

  await as('pro2');
  check('a pro cannot resolve their own dispute'.padEnd(52) + 'denied',
    (await call('resolveFeeDispute', { projectId: D3, proId: PRO2, outcome: 'cancelled' })).code === 'functions/permission-denied');

  await as('admin');
  const t0 = Date.now();
  const r1 = await call('resolveFeeDispute', { projectId: D1, proId: PRO2, outcome: 'completed' });
  const f1 = (await adminDb.doc(`projects/${D1}/fees/${PRO2}`).get()).data();
  const od1 = f1?.overdueAt?.toMillis?.();
  check('didnt_happen → completed restores ₪30', r1.outcome === 'ok' && f1.feeDue === 30 && f1.status === 'pending'
    && f1.engagementStatus === 'completed', `${r1.outcome} feeDue=${f1?.feeDue} status=${f1?.status}`);
  check('… and the clock restarts from the resolution',
    typeof od1 === 'number' && Math.abs(od1 - (t0 + 7 * DAY)) < 5 * 60_000, `overdueAt=${od1}`);
  check('… slot released, review flag cleared',
    f1.adminReviewPending === false
      && !((await adminDb.doc(`projects/${D1}`).get()).get('slotHolders') ?? []).includes(PRO2));

  const r2 = await call('resolveFeeDispute', { projectId: D2, proId: PRO2, outcome: 'completed', agreedAmount: 100 });
  const f2 = (await adminDb.doc(`projects/${D2}/fees/${PRO2}`).get()).data();
  check('amount_disputed → completed at ₪100 owes the ₪6 minimum',
    r2.outcome === 'ok' && f2.feeDue === 6 && f2.baseAmount === 100 && f2.agreedAmount === 100,
    `${r2.outcome} feeDue=${f2?.feeDue} base=${f2?.baseAmount}`);

  const r3 = await call('resolveFeeDispute', { projectId: D3, proId: PRO2, outcome: 'cancelled' });
  const f3 = (await adminDb.doc(`projects/${D3}/fees/${PRO2}`).get()).data();
  check('cancelled voids the fee', r3.outcome === 'ok' && f3.status === 'not_owed' && f3.feeDue === 0
    && f3.engagementStatus === 'cancelled', `${r3.outcome} status=${f3?.status}`);

  const pro2Block = (await adminDb.doc(`feeBlocks/${PRO2}`).get()).get('blockedFrom')?.toMillis?.() ?? null;
  check('pro2\'s block starts at the earliest restarted clock, not now',
    pro2Block !== null && pro2Block > Date.now() + 6 * DAY, String(pro2Block));
  await as('pro2');
  check('so pro2 still sends offers'.padEnd(52) + 'ALLOW', await allowed(() => sendOffer(P_OFF, PRO2, 'Editor', 900)));
} catch (e) {
  console.error('\nprobe threw:', e);
  failures++;
} finally {
  await teardown();
}
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
