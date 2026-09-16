#!/usr/bin/env node
/**
 * R8 — slot-cap RACE probe, against the emulators.
 *
 * Two parts, because they prove different things:
 *
 *  TX   Two Admin-SDK transactions of the hire's shape, released at the same
 *       moment against the Firestore emulator. Run in both shapes:
 *         OLD  count query outside the transaction (what hire.ts did)
 *         NEW  count query via tx.get(query) before any write (the fix)
 *       OLD must over-commit at least once, or this probe cannot see the bug and
 *       its NEW result means nothing. NEW must never over-commit.
 *
 *  CALL Two hireProfessional calls fired together through the FUNCTIONS emulator,
 *       for the same professional onto two different projects while they hold
 *       one slot of two. Exactly one may land.
 *
 *   firebase emulators:start --only firestore,auth,functions
 *   node scripts/probe-slot-cap-race.mjs            # both parts
 *   PART=tx node scripts/probe-slot-cap-race.mjs    # transactions only
 */
import { initializeApp as initAdmin } from 'firebase-admin/app';
import { getFirestore as getAdminDb, FieldValue } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import {
  getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
} from 'firebase/auth';

const FS = process.env.FS_PORT ?? '8080';
const AU = process.env.AUTH_PORT ?? '9099';
const FN = process.env.FN_PORT ?? '5001';
const PART = process.env.PART ?? 'all';
const ROUNDS = Number(process.env.ROUNDS ?? 20);
process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${FS}`;
process.env.FIREBASE_AUTH_EMULATOR_HOST = `127.0.0.1:${AU}`;
const P = 'bama-af0a0';
const CAP = 2; // no config/pricing doc in the emulator → server default

const adminDb = getAdminDb(initAdmin({ projectId: P }));
let failures = 0;
const check = (l, ok, d = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}${d ? `  — ${d}` : ''}`); if (!ok) failures++; };

const heldBy = async (pro) =>
  (await adminDb.collection('projects').where('slotHolders', 'array-contains', pro).get()).size;

async function wipe(prefix) {
  for (const c of ['projects', 'priceOffers', 'chats']) {
    const snap = await adminDb.collection(c).get();
    for (const d of snap.docs.filter((x) => x.id.startsWith(prefix) || (d0(x)?.projectId ?? '').startsWith(prefix))) {
      const fees = await d.ref.collection('fees').get();
      for (const f of fees.docs) await f.ref.delete();
      await d.ref.delete();
    }
  }
}
function d0(doc) { return doc.data(); }

// ── TX part ───────────────────────────────────────────────────────────────────
async function txRound(shape, round) {
  const pro = `race-pro-${shape}-${round}`;
  const A = `race-${shape}-${round}-A`, B = `race-${shape}-${round}-B`, C = `race-${shape}-${round}-C`;
  await adminDb.doc(`projects/${A}`).set({ slotHolders: [pro] });
  await adminDb.doc(`projects/${B}`).set({ slotHolders: [] });
  await adminDb.doc(`projects/${C}`).set({ slotHolders: [] });

  const capQuery = adminDb.collection('projects').where('slotHolders', 'array-contains', pro).limit(CAP + 1);

  const hireOnto = async (projectId) => {
    const ref = adminDb.doc(`projects/${projectId}`);
    // OLD: the count is taken before the transaction starts.
    const preCount = shape === 'old' ? (await capQuery.get()).size : null;
    try {
      await adminDb.runTransaction(async (tx) => {
        const fresh = (await tx.get(ref)).data() ?? {};
        if (!(fresh.slotHolders ?? []).includes(pro)) {
          const count = shape === 'old' ? preCount : (await tx.get(capQuery)).size;
          if (count >= CAP) throw new Error('slot-cap-reached');
        }
        tx.update(ref, { slotHolders: FieldValue.arrayUnion(pro) });
      });
      return 'ok';
    } catch (e) {
      return String(e.message).includes('slot-cap-reached') ? 'capped' : `error:${e.message}`;
    }
  };

  const results = await Promise.all([hireOnto(B), hireOnto(C)]);
  const held = await heldBy(pro);
  for (const id of [A, B, C]) await adminDb.doc(`projects/${id}`).delete();
  return { results, held };
}

async function txPart() {
  for (const shape of ['old', 'new']) {
    console.log(`\n=== TX ${shape.toUpperCase()} shape — ${ROUNDS} rounds, pro holds 1 of ${CAP} ===`);
    let over = 0, errors = 0;
    const tally = {};
    for (let i = 0; i < ROUNDS; i++) {
      const { results, held } = await txRound(shape, i);
      const key = results.slice().sort().join('+');
      tally[key] = (tally[key] ?? 0) + 1;
      if (held > CAP) over++;
      errors += results.filter((r) => r.startsWith('error')).length;
    }
    console.log(`  outcomes: ${JSON.stringify(tally)}`);
    if (shape === 'old') {
      check('OLD shape over-commits (the probe can see the bug)', over > 0, `${over}/${ROUNDS} rounds over cap`);
    } else {
      check('NEW shape never over-commits', over === 0, `${over}/${ROUNDS} rounds over cap`);
      check('NEW shape: every round is exactly one ok + one capped', tally['capped+ok'] === ROUNDS, JSON.stringify(tally));
      check('no unexpected errors', errors === 0, `${errors}`);
    }
  }
}

// ── CALL part ─────────────────────────────────────────────────────────────────
async function callPart() {
  const app = initializeApp({ apiKey: 'k', projectId: P }, 'race');
  const auth = getAuth(app), fns = getFunctions(app);
  connectAuthEmulator(auth, `http://127.0.0.1:${AU}`, { disableWarnings: true });
  connectFunctionsEmulator(fns, '127.0.0.1', Number(FN));
  const hire = httpsCallable(fns, 'hireProfessional');
  const PW = 'pw123456';
  const uid = async (email) => {
    try { return (await createUserWithEmailAndPassword(auth, email, PW)).user.uid; }
    catch { return (await signInWithEmailAndPassword(auth, email, PW)).user.uid; }
  };
  const PRO = await uid('race-pro@probe.invalid'); await signOut(auth);
  const CLIENT = await uid('race-client@probe.invalid');

  const rounds = Math.min(ROUNDS, 10);
  console.log(`\n=== CALL — ${rounds} rounds of two concurrent hireProfessional calls ===`);
  let over = 0;
  const tally = {};
  for (let i = 0; i < rounds; i++) {
    await wipe('racecall-');
    const A = `racecall-${i}-A`, B = `racecall-${i}-B`, C = `racecall-${i}-C`;
    const base = {
      clientId: CLIENT, title: 'race', description: 'x', location: 'TLV', deadline: 'flexible',
      status: 'open', createdAt: new Date(), crewSlots: [{ category: 'Editor', quantity: 1 }], filledSlots: [],
    };
    await adminDb.doc(`projects/${A}`).set({ ...base, slotHolders: [PRO], professionalIds: [PRO], slotActive: true });
    await adminDb.doc(`projects/${B}`).set(base);
    await adminDb.doc(`projects/${C}`).set(base);
    for (const p of [B, C]) {
      await adminDb.doc(`priceOffers/${p}-o`).set({
        projectId: p, professionalId: PRO, category: 'Editor', price: 500, status: 'pending', createdAt: new Date(),
      });
    }
    const call = (offerId) => hire({ offerId }).then(() => 'ok').catch((e) =>
      String(e.message).includes('slot-cap-reached') ? 'capped' : `error:${e.code} ${e.message}`);
    const results = await Promise.all([call(`${B}-o`), call(`${C}-o`)]);
    const key = results.slice().sort().join('+');
    tally[key] = (tally[key] ?? 0) + 1;
    if ((await heldBy(PRO)) > CAP) over++;
  }
  console.log(`  outcomes: ${JSON.stringify(tally)}`);
  check('callable never over-commits', over === 0, `${over}/${rounds} rounds over cap`);
  check('every round is exactly one ok + one capped', tally['capped+ok'] === rounds, JSON.stringify(tally));
  await wipe('racecall-');
}

try {
  if (PART === 'all' || PART === 'tx') await txPart();
  if (PART === 'all' || PART === 'call') await callPart();
} catch (e) {
  console.error('\nprobe threw:', e); failures++;
}
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
