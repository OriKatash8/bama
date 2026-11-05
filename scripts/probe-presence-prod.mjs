#!/usr/bin/env node
/**
 * PRODUCTION verification of the launch stamp, users/{uid}/private/presence.
 * The emulator proved the rule logic (probe-presence-rules.mjs); this proves the
 * DEPLOYED rules, with two throwaway accounts that are removed at the end.
 *
 * The write is exactly what src/core/services/recordLaunch.ts makes: the same path,
 * `setDoc(doc(db, path), data)` (the body of setDocument in core/firebase/firestore.ts),
 * and the same three fields. This script READS those two source files first and
 * refuses to run if they no longer say that, so the probe cannot quietly drift
 * from the shipped code.
 *
 * Teardown is the app's own path, not a shortcut: each account calls the
 * `deleteMyAccount` callable (which removes users/{uid}/private/* with the Admin
 * SDK). The probe asserts presence existed BEFORE and is gone AFTER, which proves
 * account deletion removes it. Only then does it remove the anonymous tombstone
 * user docs deleteMyAccount deliberately keeps (they are throwaway).
 *
 *   node scripts/probe-presence-prod.mjs --prod
 *
 * Admin SDK access uses gcloud Application Default Credentials.
 */
import './lib/requireProd.mjs'; // explicit --prod required, no default target
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { initializeApp as initAdmin } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { getFirestore, doc, setDoc, getDoc, deleteDoc, serverTimestamp, Timestamp, setLogLevel } from 'firebase/firestore';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';

for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '');
}

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
};

// ── 0. The probe must make the write the app makes ───────────────────────────
const launchSrc = readFileSync(new URL('../src/core/services/recordLaunch.ts', import.meta.url), 'utf8');
const fsSrc = readFileSync(new URL('../src/core/firebase/firestore.ts', import.meta.url), 'utf8');
const sameAsApp =
  /export const presencePath = \(uid: string\) => `users\/\$\{uid\}\/private\/presence`;/.test(launchSrc)
  && /await setDocument\(presencePath\(uid\), \{\s*lastPlatform: Platform\.OS,\s*appVersion: appVersionString\(\),\s*lastSeenAt: serverTimestamp\(\),\s*\}\);/.test(launchSrc)
  && /export async function setDocument<[^>]*>\(path: string, data: T\): Promise<void> \{\s*await setDoc\(doc\(db, path\), data\);/.test(fsSrc);
if (!sameAsApp) {
  console.error('recordLaunch.ts / setDocument no longer match what this probe sends. Update the probe to the shipped call first.');
  process.exit(2);
}
console.log('\nrecordLaunch.ts and setDocument match the call this probe makes: OK');

const cfg = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};
if (!cfg.apiKey || !cfg.projectId) { console.error('missing EXPO_PUBLIC_FIREBASE_* in .env'); process.exit(1); }
console.log(`project: ${cfg.projectId}  (LIVE)\n`);
setLogLevel('silent');

const app = initializeApp(cfg, 'presence-prod-probe');
const db = getFirestore(app);
const auth = getAuth(app);
const fns = getFunctions(app); // us-central1, like callFunction() without a region
const admin = initAdmin({ projectId: cfg.projectId });
const adminAuth = getAdminAuth(admin);
const adminDb = getAdminFirestore(admin);

const stamp = Date.now();
const PW = 'Probe-Password-123!';
const accounts = { A: { email: `probe${stamp}.presence-a@probe.invalid` }, B: { email: `probe${stamp}.presence-b@probe.invalid` } };

// ── the write recordLaunch makes (path + call + fields) ──────────────────────
const presenceRef = (uid) => doc(db, `users/${uid}/private/presence`);
const appWrite = (uid, over = {}) => setDoc(presenceRef(uid), {
  lastPlatform: 'android',
  appVersion: '1.0.0 (43)',
  lastSeenAt: serverTimestamp(),
  ...over,
});
const result = async (fn) => { try { const v = await fn(); return { ok: true, v }; } catch (e) { return { ok: false, code: e.code ?? e.message }; } };
const denied = (r) => !r.ok && /permission-denied/.test(r.code);

async function teardown(label) {
  const a = accounts[label];
  if (!a.uid) return;
  const before = (await adminDb.doc(`users/${a.uid}/private/presence`).get()).exists;
  let called = false; let callErr = '';
  try {
    await signOut(auth).catch(() => {});
    await signInWithEmailAndPassword(auth, a.email, PW);
    const res = await httpsCallable(fns, 'deleteMyAccount')({});
    called = res.data?.ok === true;
  } catch (e) { callErr = e.code ?? e.message; }
  const presenceGone = !(await adminDb.doc(`users/${a.uid}/private/presence`).get()).exists;
  const privateEmpty = (await adminDb.collection(`users/${a.uid}/private`).get()).empty;
  let authGone = false;
  try { await adminAuth.getUser(a.uid); } catch { authGone = true; }
  check(`teardown ${label}: deleteMyAccount ran`, called, callErr);
  if (a.hadPresence) check(`teardown ${label}: presence existed before, gone after deleteMyAccount`, before && presenceGone, `before=${before} after-gone=${presenceGone}`);
  check(`teardown ${label}: the whole users/{uid}/private collection is empty`, privateEmpty);
  check(`teardown ${label}: Auth account removed`, authGone);
  // Belt and braces for a failed callable, so nothing is left behind in production.
  if (!authGone) await adminAuth.deleteUser(a.uid).catch(() => {});
  // deleteMyAccount keeps an anonymous tombstone users/{uid}; these are throwaway.
  await adminDb.recursiveDelete(adminDb.doc(`users/${a.uid}`)).catch(() => {});
  const tombstoneGone = !(await adminDb.doc(`users/${a.uid}`).get()).exists;
  check(`teardown ${label}: tombstone user doc removed`, tombstoneGone);
}

try {
  accounts.A.uid = (await createUserWithEmailAndPassword(auth, accounts.A.email, PW)).user.uid;
  console.log(`throwaway A (owner) = ${accounts.A.uid}\n`);
  const uidA = accounts.A.uid;

  console.log('OWNER');
  let r = await result(() => appWrite(uidA));
  check('1. first launch: the app\'s exact write is allowed', r.ok, r.ok ? '' : r.code);
  accounts.A.hadPresence = r.ok;
  r = await result(() => appWrite(uidA, { appVersion: '1.0.1 (44)' }));
  check('2. next launch: overwrite is allowed', r.ok, r.ok ? '' : r.code);
  r = await result(() => getDoc(presenceRef(uidA)));
  const d = r.ok && r.v.exists() ? r.v.data() : null;
  check('3. owner reads it back: three keys, version updated, server time set',
    !!d && Object.keys(d).sort().join() === 'appVersion,lastPlatform,lastSeenAt' && d.appVersion === '1.0.1 (44)'
      && d.lastSeenAt instanceof Timestamp && Math.abs(d.lastSeenAt.toMillis() - Date.now()) < 5 * 60_000,
    d ? JSON.stringify({ ...d, lastSeenAt: d.lastSeenAt?.toDate?.().toISOString() }) : (r.code ?? 'missing'));
  r = await result(() => deleteDoc(presenceRef(uidA)));
  check('4. owner cannot delete it (admin only)', denied(r), r.ok ? 'ALLOWED' : r.code);

  console.log('\nMALFORMED (as the owner, straight through the SDK)');
  const bad = [
    ['5. a platform that does not exist', { lastPlatform: 'windows' }],
    ['6. version over 40 characters', { appVersion: 'x'.repeat(41) }],
    ['7. version that is not a string', { appVersion: 143 }],
    ['8. lastSeenAt as a client time', { lastSeenAt: Timestamp.now() }],
    ['9. an extra key', { note: 'hi' }],
  ];
  for (const [label, over] of bad) {
    r = await result(() => appWrite(uidA, over));
    check(`${label} is denied`, denied(r), r.ok ? 'ALLOWED' : r.code);
  }
  r = await result(() => setDoc(presenceRef(uidA), { lastPlatform: 'ios', appVersion: '1' }));
  check('10. a missing key (no lastSeenAt) is denied', denied(r), r.ok ? 'ALLOWED' : r.code);

  // A second account: somebody else.
  await signOut(auth);
  accounts.B.uid = (await createUserWithEmailAndPassword(auth, accounts.B.email, PW)).user.uid;
  console.log(`\nthrowaway B (another user) = ${accounts.B.uid}\n\nANOTHER USER`);
  r = await result(() => getDoc(presenceRef(uidA)));
  check('11. B cannot read A\'s presence', denied(r), r.ok ? 'ALLOWED' : r.code);
  r = await result(() => appWrite(uidA));
  check('12. B cannot write A\'s presence (valid payload)', denied(r), r.ok ? 'ALLOWED' : r.code);
  r = await result(() => deleteDoc(presenceRef(uidA)));
  check('13. B cannot delete A\'s presence', denied(r), r.ok ? 'ALLOWED' : r.code);
  r = await result(() => appWrite(accounts.B.uid));
  check('14. B can write its OWN presence (control: rules are not just denying everything)', r.ok, r.ok ? '' : r.code);
  accounts.B.hadPresence = r.ok;
  const stillThere = (await adminDb.doc(`users/${uidA}/private/presence`).get()).data();
  check('15. A\'s stamp was not altered by any of B\'s attempts', stillThere?.appVersion === '1.0.1 (44)', stillThere?.appVersion);
} finally {
  console.log('\nTEARDOWN (the app\'s own deleteMyAccount)');
  await teardown('A');
  await teardown('B');
}
console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
