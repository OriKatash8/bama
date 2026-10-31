#!/usr/bin/env node
/**
 * Probe for the launch stamp, users/{uid}/private/presence (recordLaunch):
 * lastPlatform, appVersion, lastSeenAt. Emulator only; nothing here touches
 * production.
 *
 *   npx firebase emulators:start --only firestore,auth --project bama-af0a0
 *   node scripts/probe-presence-rules.mjs --emulator
 *   (FS_PORT / AUTH_PORT override the defaults 8080 / 9099)
 *
 * Who may do what:
 *   owner   — create/overwrite with EXACTLY the three keys, validly; read
 *   other   — a different signed-in user: read DENIED, write DENIED
 *   admin   — role=admin claim: read ok, delete ok, write DENIED (owner only)
 * And the public users/{uid} doc carries no special rule for these fields any more.
 */
import { initializeApp as initAdmin } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { initializeApp } from 'firebase/app';
import {
  getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc, deleteDoc, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import {
  getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
} from 'firebase/auth';

// Emulator only, and only on request: this branch has no shared target guard, so the
// probe carries its own. (The Admin SDK is pinned to the emulator by the env vars below.)
if (!process.argv.includes('--emulator')) {
  console.error('This probe runs against the local emulators only. Pass --emulator.');
  process.exit(2);
}

const FS_PORT = process.env.FS_PORT ?? '8080';
const AUTH_PORT = process.env.AUTH_PORT ?? '9099';
process.env.FIRESTORE_EMULATOR_HOST ??= `127.0.0.1:${FS_PORT}`;
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= `127.0.0.1:${AUTH_PORT}`;
const PROJECT = 'bama-af0a0';

const adminApp = initAdmin({ projectId: PROJECT });
const adminDb = getAdminFirestore(adminApp);
const adminAuth = getAdminAuth(adminApp);
const app = initializeApp({ apiKey: 'emulator-key', projectId: PROJECT }, 'probe');
const db = getFirestore(app);
const auth = getAuth(app);
connectFirestoreEmulator(db, '127.0.0.1', Number(FS_PORT));
connectAuthEmulator(auth, `http://127.0.0.1:${AUTH_PORT}`, { disableWarnings: true });

const PW = 'probe-password-123';
const uid = {};
async function ensureUser(label, claims) {
  const email = `${label}@probe.invalid`;
  let u;
  try { u = (await createUserWithEmailAndPassword(auth, email, PW)).user.uid; }
  catch { u = (await signInWithEmailAndPassword(auth, email, PW)).user.uid; }
  await adminAuth.updateUser(u, { emailVerified: true });
  await adminAuth.setCustomUserClaims(u, claims ?? null);
  await signOut(auth);
  uid[label] = u;
}
let current = null;
async function as(label) {
  if (current === label) return;
  await signOut(auth).catch(() => {});
  await signInWithEmailAndPassword(auth, `${label}@probe.invalid`, PW);
  await auth.currentUser.getIdToken(true); // pick up the claims
  current = label;
}
await ensureUser('pr-owner');
await ensureUser('pr-other');
await ensureUser('pr-admin', { role: 'admin' });
const OWNER = uid['pr-owner'];
const PATH = ['users', OWNER, 'private', 'presence'];

const rows = [];
async function attempt(section, name, who, expected, run, seeded = true) {
  // A fresh, valid stamp (or none) before each case, written with the Admin SDK.
  if (seeded) await adminDb.doc(PATH.join('/')).set({ lastPlatform: 'ios', appVersion: '1.0.0 (1)', lastSeenAt: new Date() });
  else await adminDb.doc(PATH.join('/')).delete().catch(() => {});
  await as(who);
  let allowed = true; let error = '';
  try { await run(); } catch (e) { allowed = false; error = e.code ?? String(e.message ?? e); }
  rows.push({ section, name, expected, allowed, error });
}
const write = (data) => () => setDoc(doc(db, ...PATH), data);
const good = () => ({ lastPlatform: 'android', appVersion: '1.0.0 (43)', lastSeenAt: serverTimestamp() });

// ── the owner ───────────────────────────────────────────────────────────────
await attempt('owner', 'first launch: creates the doc as the app sends it', 'pr-owner', true, write(good()), false);
await attempt('owner', 'next launch: overwrites it', 'pr-owner', true, write(good()));
await attempt('owner', 'web, no build number', 'pr-owner', true, write({ ...good(), lastPlatform: 'web', appVersion: 'unknown' }));
await attempt('owner', 'reads it', 'pr-owner', true, () => getDoc(doc(db, ...PATH)));
await attempt('owner', 'cannot delete it', 'pr-owner', false, () => deleteDoc(doc(db, ...PATH)));

// ── malformed writes by the owner ───────────────────────────────────────────
await attempt('malformed', 'a platform that does not exist', 'pr-owner', false, write({ ...good(), lastPlatform: 'windows' }));
await attempt('malformed', 'platform that is not a string', 'pr-owner', false, write({ ...good(), lastPlatform: 7 }));
await attempt('malformed', 'version over 40 characters', 'pr-owner', false, write({ ...good(), appVersion: 'x'.repeat(41) }));
await attempt('malformed', 'version that is not a string', 'pr-owner', false, write({ ...good(), appVersion: 123 }));
await attempt('malformed', 'lastSeenAt a client time (the future)', 'pr-owner', false, write({ ...good(), lastSeenAt: Timestamp.fromMillis(Date.now() + 365 * 86400_000) }));
await attempt('malformed', 'lastSeenAt a client time (now)', 'pr-owner', false, write({ ...good(), lastSeenAt: Timestamp.now() }));
await attempt('malformed', 'lastSeenAt that is not a timestamp', 'pr-owner', false, write({ ...good(), lastSeenAt: 'yesterday' }));
await attempt('malformed', 'a fourth key', 'pr-owner', false, write({ ...good(), note: 'hi' }));
await attempt('malformed', 'a missing key (no lastSeenAt)', 'pr-owner', false, write({ lastPlatform: 'ios', appVersion: '1' }));
await attempt('malformed', 'an empty doc', 'pr-owner', false, write({}));

// ── somebody else ───────────────────────────────────────────────────────────
await attempt('another user', "reads someone else's stamp", 'pr-other', false, () => getDoc(doc(db, ...PATH)));
await attempt('another user', "writes someone else's stamp (valid payload)", 'pr-other', false, write(good()));
await attempt('another user', "deletes someone else's stamp", 'pr-other', false, () => deleteDoc(doc(db, ...PATH)));

// ── an admin ────────────────────────────────────────────────────────────────
await attempt('admin', "reads a user's stamp", 'pr-admin', true, () => getDoc(doc(db, ...PATH)));
await attempt('admin', "deletes a user's stamp", 'pr-admin', true, () => deleteDoc(doc(db, ...PATH)));
await attempt('admin', "cannot write a user's stamp (owner only)", 'pr-admin', false, write(good()));

// ── nothing else about private/ changed ─────────────────────────────────────
await attempt('private/ is otherwise as before', 'owner still writes contact', 'pr-owner', true,
  () => setDoc(doc(db, 'users', OWNER, 'private', 'contact'), { phone: '+972501234567', updatedAt: serverTimestamp() }));
await attempt('private/ is otherwise as before', 'owner cannot delete contact', 'pr-owner', false,
  () => deleteDoc(doc(db, 'users', OWNER, 'private', 'contact')));
await attempt('private/ is otherwise as before', 'admin cannot delete contact', 'pr-admin', false,
  () => deleteDoc(doc(db, 'users', OWNER, 'private', 'contact')));
await attempt('private/ is otherwise as before', 'owner cannot create an arbitrary private doc', 'pr-owner', false,
  () => setDoc(doc(db, 'users', OWNER, 'private', 'other'), { a: 1 }));

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
