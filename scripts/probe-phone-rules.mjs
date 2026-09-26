#!/usr/bin/env node
/**
 * Probe for `users/{uid}/private/contact` — the phone number.
 *
 * Runs against the Firestore EMULATOR with whatever firestore.rules currently
 * says. Nothing here touches production.
 *
 * The number is private: users/{uid} is readable by every signed-in user, so it
 * lives in its own doc that only the owner can read or write. The other side of
 * a project gets it from the getContactPhone callable (Admin SDK, not rules).
 * Writes use the exact shape the app writes: { phone: <E.164>, updatedAt:
 * serverTimestamp() }, varied one field at a time.
 *
 *   npx firebase emulators:start --only firestore,auth --project bama-af0a0
 *   node scripts/probe-phone-rules.mjs
 */

import { initializeApp as initAdmin } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import {
  getFirestore, connectFirestoreEmulator, doc, setDoc, updateDoc, deleteDoc, getDoc, serverTimestamp,
} from 'firebase/firestore';
import {
  getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
} from 'firebase/auth';

const FS_PORT = process.env.FS_PORT ?? '8080';
const AUTH_PORT = process.env.AUTH_PORT ?? '9099';
process.env.FIRESTORE_EMULATOR_HOST ??= `127.0.0.1:${FS_PORT}`;
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= `127.0.0.1:${AUTH_PORT}`;
const PROJECT = 'bama-af0a0';

const adminDb = getAdminFirestore(initAdmin({ projectId: PROJECT }));
const clientApp = initializeApp({ apiKey: 'emulator-key', projectId: PROJECT }, 'probe');
const db = getFirestore(clientApp);
const auth = getAuth(clientApp);
connectFirestoreEmulator(db, '127.0.0.1', Number(FS_PORT));
connectAuthEmulator(auth, `http://127.0.0.1:${AUTH_PORT}`, { disableWarnings: true });

const PW = 'probe-password-123';
const rows = [];

async function ensureUser(label) {
  const email = `${label}@probe.invalid`;
  let uid;
  try {
    uid = (await createUserWithEmailAndPassword(auth, email, PW)).user.uid;
  } catch {
    uid = (await signInWithEmailAndPassword(auth, email, PW)).user.uid;
  }
  await signOut(auth);
  return uid;
}
async function as(label) {
  await signOut(auth).catch(() => {});
  await signInWithEmailAndPassword(auth, `${label}@probe.invalid`, PW);
}

const OWNER = await ensureUser('ph-owner');
await ensureUser('ph-other');

/** Known state before EVERY attempt, rules-exempt: the owner has a number. */
async function reseed() {
  await adminDb.doc(`users/${OWNER}/private/contact`).set({ phone: '+972501234567', updatedAt: new Date() });
  await adminDb.doc(`users/${OWNER}/private/other`).delete();
}

async function attempt(section, name, identity, expected, run) {
  await reseed();
  await as(identity);
  let allowed = true;
  let error = '';
  try { await run(); } catch (e) { allowed = false; error = e.code ?? String(e.message ?? e); }
  rows.push({ section, name, identity, expected, allowed, error });
}

const contact = () => doc(db, 'users', OWNER, 'private', 'contact');
const shape = (over = {}) => ({ phone: '+972541112222', updatedAt: serverTimestamp(), ...over });

// ── Reading ─────────────────────────────────────────────────────────────────
await attempt('read', 'a. owner reads their number', 'ph-owner', true, () => getDoc(contact()));
await attempt('read', 'b. another user CANNOT read it', 'ph-other', false, () => getDoc(contact()));

// ── Writing ─────────────────────────────────────────────────────────────────
await attempt('write', 'c. owner sets a valid number (app shape)', 'ph-owner', true, () => setDoc(contact(), shape()));
await attempt('write', 'd. owner updates it', 'ph-owner', true, () => updateDoc(contact(), shape({ phone: '+14155552671' })));
await attempt('write', 'e. another user CANNOT write it', 'ph-other', false, () => setDoc(contact(), shape()));
await attempt('write', 'f. local format (not E.164) is rejected', 'ph-owner', false, () => setDoc(contact(), shape({ phone: '0501234567' })));
await attempt('write', 'g. leading-zero E.164 is rejected', 'ph-owner', false, () => setDoc(contact(), shape({ phone: '+0501234567' })));
await attempt('write', 'h. too short is rejected', 'ph-owner', false, () => setDoc(contact(), shape({ phone: '+1234567' })));
await attempt('write', 'i. a non-string is rejected', 'ph-owner', false, () => setDoc(contact(), shape({ phone: 972501234567 })));
await attempt('write', 'j. an extra field is rejected', 'ph-owner', false, () => setDoc(contact(), shape({ email: 'x@y.z' })));
await attempt('write', 'k. any other doc name is rejected', 'ph-owner', false,
  () => setDoc(doc(db, 'users', OWNER, 'private', 'other'), shape()));
await attempt('write', 'l. owner cannot delete it', 'ph-owner', false, () => deleteDoc(contact()));

// ── Report ──────────────────────────────────────────────────────────────────
let mismatches = 0;
for (const section of [...new Set(rows.map((r) => r.section))]) {
  console.log(`\n${section.toUpperCase()}`);
  for (const r of rows.filter((x) => x.section === section)) {
    const ok = r.allowed === r.expected;
    if (!ok) mismatches++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${r.name} — ${r.allowed ? 'allowed' : `denied (${r.error})`}`);
  }
}
console.log(`\n${rows.length} cases, ${mismatches} not as expected`);
await signOut(auth).catch(() => {});
process.exit(mismatches === 0 ? 0 : 1);
