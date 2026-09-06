#!/usr/bin/env node
/**
 * Production probe for the marketplace_listings update rule.
 *
 * Runs the SAME assertions twice:
 *   --baseline   against the CURRENT rules. The DENIED set is expected to SUCCEED
 *                (that is the hole), and the ALLOWED set must already pass — which
 *                is what makes any post-deploy failure attributable to the change.
 *   (default)    after deploying. DENIED must fail, ALLOWED must still pass.
 *
 * The ALLOWED half carries more weight: the hole has never been exploited, while
 * the sale flow is used by 25 live listings. A false denial is the worse outcome.
 *
 * Uses the CLIENT SDK signed in as throwaway accounts, so security rules actually
 * apply — the Admin SDK bypasses them and would prove nothing. Emulator runs have
 * given false passes on rules shape before (see docs/known-issues-silent-failures.md).
 *
 * Touches ONLY its own scratch listing. Never a real one.
 *
 * Run: node scripts/probe-marketplace-rules.mjs [--baseline]
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { initializeApp } from 'firebase/app';
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, deleteUser,
} from 'firebase/auth';
import {
  getFirestore, doc, setDoc, updateDoc, getDoc, deleteDoc, deleteField, serverTimestamp,
} from 'firebase/firestore';
import { initializeApp as adminInit } from 'firebase-admin/app';
import { getFirestore as adminFs } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';

const BASELINE = process.argv.includes('--baseline');

function parseEnv() {
  const text = readFileSync(join(process.cwd(), '.env'), 'utf8');
  const env = {};
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return env;
}
const env = parseEnv();

for (const v of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) {
  if (process.env[v]) {
    console.error(`ERROR: ${v} is set. This probe must run against production.`);
    process.exit(1);
  }
}

const app = initializeApp({
  apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.EXPO_PUBLIC_FIREBASE_APP_ID,
});
const auth = getAuth(app);
const db = getFirestore(app);

adminInit({ projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID });
const adb = adminFs();
const aauth = adminAuth();

const STAMP = Date.now();
const OWNER = { email: `probe-owner-${STAMP}@bama-invalid.test`, password: `Pw!${STAMP}aA` };
const OTHER = { email: `probe-other-${STAMP}@bama-invalid.test`, password: `Pw!${STAMP}bB` };
const LISTING_ID = `zzz-probe-listing-${STAMP}`;
const ref = doc(db, 'marketplace_listings', LISTING_ID);

const results = [];
function record(kind, name, ok, detail) {
  results.push({ kind, name, ok, detail });
  const tag = ok ? 'PASS' : 'FAIL';
  console.log(`  ${tag}  [${kind}] ${name}${detail ? '  — ' + detail : ''}`);
}

/** Attempt a write; returns 'ok' | 'denied' | 'error:<code>'. */
async function attempt(fields) {
  try {
    await updateDoc(ref, fields);
    return 'ok';
  } catch (e) {
    if (e?.code === 'permission-denied') return 'denied';
    return 'error:' + (e?.code ?? e?.message ?? 'unknown');
  }
}

/** Put the scratch listing into a known state, bypassing rules. */
async function reset(state) {
  await adb.collection('marketplace_listings').doc(LISTING_ID).set(state);
}

async function signInAs(who) {
  await signOut(auth).catch(() => {});
  await signInWithEmailAndPassword(auth, who.email, who.password);
  return auth.currentUser.uid;
}

let ownerUid, otherUid;

async function main() {
  console.log(`\n=== marketplace_listings rules probe — ${BASELINE ? 'BASELINE (current rules)' : 'VERIFICATION (new rules)'} ===`);
  console.log(`project: ${env.EXPO_PUBLIC_FIREBASE_PROJECT_ID}   scratch listing: ${LISTING_ID}\n`);

  const o = await createUserWithEmailAndPassword(auth, OWNER.email, OWNER.password);
  ownerUid = o.user.uid;
  const t = await createUserWithEmailAndPassword(auth, OTHER.email, OTHER.password);
  otherUid = t.user.uid;
  console.log(`owner=${ownerUid.slice(0, 8)}  other=${otherUid.slice(0, 8)}\n`);

  const AVAILABLE = {
    type: 'secondhand', posterId: ownerUid, posterName: 'Probe Owner',
    productName: 'Probe Item', location: 'Nowhere', price: 100,
    imageUrl: null, status: 'available', createdAt: new Date(),
  };
  const RESERVED = { ...AVAILABLE, status: 'reserved', buyerId: otherUid, purchaseChatId: 'probe-chat' };

  // ── DENIED SET — a non-owner acting on someone else's available listing ──
  console.log('DENIED set (non-owner, on an available listing):');
  const expectDenied = BASELINE ? 'ok' : 'denied';
  const deniedCases = [
    ['steal listing (posterId: self)', { buyerId: otherUid, posterId: otherUid }],
    ['DoS (status: sold)', { buyerId: otherUid, status: 'sold' }],
    ['rewrite price', { buyerId: otherUid, price: 1 }],
    ['rewrite productName', { buyerId: otherUid, productName: 'HIJACKED' }],
    ['forge sellerConfirmed', { buyerId: otherUid, sellerConfirmed: true }],
    ['accept-shaped write + extra field', { buyerId: otherUid, status: 'reserved', purchaseChatId: 'c', price: 1 }],
    ['dead status value (negotiating)', { buyerId: otherUid, status: 'negotiating' }],
  ];
  await signInAs(OTHER);
  for (const [name, fields] of deniedCases) {
    await reset(AVAILABLE);
    const got = await attempt(fields);
    record('deny', name, got === expectDenied, `expected ${expectDenied}, got ${got}`);
  }

  // ── ALLOWED SET — the legitimate flows. These matter most. ──
  console.log('\nALLOWED set (legitimate flows — a failure here blocks the deploy):');

  await reset(AVAILABLE);
  await signInAs(OTHER);
  record('allow', 'acceptDeal (buyer, 3 fields)',
    (await attempt({ status: 'reserved', buyerId: otherUid, purchaseChatId: 'probe-chat' })) === 'ok');

  await reset(RESERVED);
  await signInAs(OTHER);
  record('allow', 'confirmReceived — pending branch (buyerConfirmed)',
    (await attempt({ buyerConfirmed: true, buyerConfirmedAt: serverTimestamp() })) === 'ok');

  await reset({ ...RESERVED, sellerConfirmed: true });
  await signInAs(OTHER);
  record('allow', 'confirmReceived — sold branch (status: sold)',
    (await attempt({ status: 'sold' })) === 'ok');

  await reset(RESERVED);
  await signInAs(OWNER);
  record('allow', 'markHandedOver (seller, pending branch)',
    (await attempt({ sellerConfirmed: true, sellerConfirmedAt: serverTimestamp() })) === 'ok');

  await reset({ ...RESERVED, buyerConfirmed: true });
  await signInAs(OWNER);
  record('allow', 'markHandedOver — sold branch',
    (await attempt({ sellerConfirmed: true, sellerConfirmedAt: serverTimestamp(), status: 'sold' })) === 'ok');

  const CANCEL = {
    status: 'available', buyerId: deleteField(), purchaseChatId: deleteField(),
    sellerConfirmed: deleteField(), buyerConfirmed: deleteField(), platformFee: deleteField(),
  };
  await reset(RESERVED);
  await signInAs(OTHER);
  record('allow', 'cancelPurchase (buyer)', (await attempt(CANCEL)) === 'ok');

  await reset(RESERVED);
  await signInAs(OWNER);
  record('allow', 'cancelPurchase (seller)', (await attempt(CANCEL)) === 'ok');

  await reset(AVAILABLE);
  await signInAs(OWNER);
  record('allow', 'owner edits own listing (price + title)',
    (await attempt({ price: 250, productName: 'Renamed' })) === 'ok');

  // ── CLAUSE-B COHORT — the 20 live buyers. Can they still act, and ONLY act? ──
  console.log('\nCLAUSE-B cohort (an existing buyer on their own reserved listing):');
  const bExpect = BASELINE ? 'ok' : 'denied';
  for (const [name, fields] of [
    ['buyer cannot rewrite price', { price: 1 }],
    ['buyer cannot steal (posterId)', { posterId: otherUid }],
    ['buyer cannot forge sellerConfirmed', { sellerConfirmed: true }],
    ['buyer cannot install another buyer', { buyerId: 'someone-else' }],
  ]) {
    await reset(RESERVED);
    await signInAs(OTHER);
    const got = await attempt(fields);
    record('deny', name, got === bExpect, `expected ${bExpect}, got ${got}`);
  }

  return results;
}

/** Asserting teardown: auth accounts first, then documents, then re-read. */
async function teardown() {
  console.log('\n=== teardown ===');
  const problems = [];

  for (const who of [OWNER, OTHER]) {
    try {
      await signOut(auth).catch(() => {});
      await signInWithEmailAndPassword(auth, who.email, who.password);
      await deleteUser(auth.currentUser);
    } catch {
      try {
        const u = await aauth.getUserByEmail(who.email);
        await aauth.deleteUser(u.uid);
      } catch (e) {
        if (e?.code !== 'auth/user-not-found') problems.push(`auth ${who.email}: ${e?.code}`);
      }
    }
  }
  // onUserCreate writes users/{uid} asynchronously; it can land after the auth
  // delete, so sweep afterwards and re-read.
  await new Promise((r) => setTimeout(r, 4000));

  for (const uid of [ownerUid, otherUid].filter(Boolean)) {
    await adb.collection('users').doc(uid).delete();
    for (const sub of ['profile', 'portfolio']) {
      const s = await adb.collection('users').doc(uid).collection(sub).get();
      for (const d of s.docs) await d.ref.delete();
    }
  }
  await adb.collection('marketplace_listings').doc(LISTING_ID).delete();

  for (const uid of [ownerUid, otherUid].filter(Boolean)) {
    if ((await adb.collection('users').doc(uid).get()).exists) problems.push(`users/${uid} SURVIVED`);
    try { await aauth.getUser(uid); problems.push(`auth ${uid} SURVIVED`); }
    catch (e) { if (e?.code !== 'auth/user-not-found') problems.push(`auth check ${uid}: ${e?.code}`); }
  }
  if ((await adb.collection('marketplace_listings').doc(LISTING_ID).get()).exists) {
    problems.push(`listing ${LISTING_ID} SURVIVED`);
  }

  if (problems.length) {
    console.log('  CLEANUP INCOMPLETE:');
    problems.forEach((p) => console.log('    ' + p));
  } else {
    console.log('  cleanup verified: both auth accounts, both user docs and the scratch listing are gone');
  }
  return problems;
}

let exitCode = 0;
try {
  await main();
} catch (e) {
  console.error('\nPROBE ABORTED:', e?.code ?? '', e?.message ?? e);
  exitCode = 2;
} finally {
  const problems = await teardown();
  const failed = results.filter((r) => !r.ok);
  const allowFailed = failed.filter((r) => r.kind === 'allow');
  console.log(`\n=== summary: ${results.length - failed.length}/${results.length} as expected ===`);
  if (allowFailed.length) {
    console.log(`\n!! ${allowFailed.length} LEGITIMATE write(s) failed — DO NOT DEPLOY / REVERT:`);
    allowFailed.forEach((r) => console.log('   ' + r.name + '  (' + r.detail + ')'));
  }
  if (failed.length) exitCode = exitCode || 1;
  if (problems.length) exitCode = 3;
  process.exit(exitCode);
}
