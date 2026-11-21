#!/usr/bin/env node
/**
 * Production probe: adminListUsers is admin-only.
 *
 * The admin panel shows people by full name from ONE call to this callable (names + emails of every
 * account), so it must not be callable by anyone else. Probes, against PRODUCTION:
 *
 *   admin       a throwaway email/password user given the `role: admin` custom claim (what requireAdmin
 *               reads). The claim exists only on that throwaway uid, which is deleted at the end. It is
 *               never added to ADMIN_UIDS.
 *   client, pro, stranger   three plain throwaway accounts: no admin claim, so each must get
 *               `permission-denied` (the callable has no other role distinction).
 *
 * Checks: the admin gets the list (including their own account, with their email); each of the other
 * three is refused for THE RIGHT REASON (permission-denied, not some other failure).
 *
 * Creates only throwaway users, then DELETES every one (and their users/<uid> doc) and VERIFIES they are
 * gone, exiting non-zero if anything is left.
 *
 *   node scripts/probe-admin-list-users-prod.mjs --prod
 */
import './lib/requireProd.mjs'; // explicit --prod required, no default target
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';

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

const { initializeApp: ia } = await import('firebase-admin/app');
const { getFirestore: gdb } = await import('firebase-admin/firestore');
const { getAuth: gAdminAuth } = await import('firebase-admin/auth');
const STAMP = `probelistusers${Date.now()}`;
const adminApp = ia({ projectId: cfg.projectId }, STAMP);
const adminDb = gdb(adminApp);
const adminAuth = gAdminAuth(adminApp);

let failures = 0;
const check = (l, ok, d = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}${d ? `  - ${d}` : ''}`); if (!ok) failures++; };

const created = [];
async function principal(name) {
  const app = initializeApp(cfg, `${STAMP}-${name}`);
  const auth = getAuth(app);
  const cred = await createUserWithEmailAndPassword(auth, `${STAMP}-${name}@probe.invalid`, 'Probe-Password-123!');
  created.push(cred.user.uid);
  return { name, uid: cred.user.uid, email: cred.user.email, auth, fns: getFunctions(app) };
}
const list = (who) => httpsCallable(who.fns, 'adminListUsers')({}).then((r) => r.data);

let exitCode = 0;
try {
  const client = await principal('client');
  const pro = await principal('pro');
  const stranger = await principal('stranger');
  const admin = await principal('admin');
  await adminAuth.setCustomUserClaims(admin.uid, { role: 'admin' });
  // The claim rides in the ID token: refresh it so the callable sees role=admin.
  const idToken = await admin.auth.currentUser.getIdToken(true);
  const claims = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString());
  console.log(`admin token: uid=${claims.user_id} role=${claims.role}\n`);

  console.log('1. The admin gets the list:');
  try {
    const out = await list(admin);
    check('admin: adminListUsers succeeds', Array.isArray(out.users) && out.users.length > 0, `${out.users?.length} account(s)`);
    const me = out.users.find((u) => u.uid === admin.uid);
    check('admin: the list has their own account, with the email (from Auth)', me?.email === admin.email, me?.email);
    check('admin: each entry carries uid, displayName, email', out.users.every((u) => typeof u.uid === 'string' && 'displayName' in u && 'email' in u));
  } catch (e) { check('admin: adminListUsers', false, `${e.code}: ${e.message}`); }

  console.log('\n2. Everyone else is refused, for the right reason:');
  for (const who of [client, pro, stranger]) {
    try {
      await list(who);
      check(`${who.name}: adminListUsers`, false, 'was ALLOWED');
    } catch (e) {
      check(`${who.name}: adminListUsers is permission-denied`, String(e.code ?? '').includes('permission-denied'), e.code);
    }
  }
} catch (e) {
  console.error('\nPROBE ERROR:', e);
  exitCode = 1;
} finally {
  console.log('\n3. Cleanup, then VERIFY it is gone:');
  for (const uid of created) await adminAuth.deleteUser(uid).catch(() => {});
  let leftovers = 0;
  for (const uid of created) {
    const gone = await adminAuth.getUser(uid).then(() => false, (e) => e.code === 'auth/user-not-found');
    // onUserCreate also writes users/<uid>: remove and verify that too.
    await adminDb.doc(`users/${uid}`).delete().catch(() => {});
    const docGone = !(await adminDb.doc(`users/${uid}`).get()).exists;
    console.log(`  ${gone ? 'gone  ' : 'STILL THERE'}  user ${uid}   users/${uid} doc: ${docGone ? 'gone' : 'STILL THERE'}`);
    if (!gone || !docGone) leftovers++;
  }
  console.log(`\n${failures === 0 && leftovers === 0 && exitCode === 0 ? 'ALL PASS, nothing left behind' : `FAILED: ${failures} check(s), ${leftovers} leftover(s)`}`);
  process.exit(failures === 0 && leftovers === 0 && exitCode === 0 ? 0 : 1);
}
