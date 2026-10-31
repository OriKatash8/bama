#!/usr/bin/env node
/**
 * Production probe: the rental admin callables refuse non-admins.
 *
 * Signs up ONE throwaway non-admin account (never an admin — production gets no
 * admin account from a script), calls every admin callable signed in and signed
 * out, and expects permission-denied / unauthenticated. Every payload is
 * harmless even if a check were missing: invalid fields or ids that do not exist,
 * so no company or item can be created or changed. Teardown deletes the account
 * and the users/{uid} doc onUserCreate writes, and verifies both are gone.
 *
 * Run: node scripts/probe-rental-callables.mjs --prod
 */
import './lib/requireProd.mjs'; // explicit --prod required, no default target
import { readFileSync } from 'fs';
import { join } from 'path';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { initializeApp as adminInit } from 'firebase-admin/app';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { getFirestore as adminFs } from 'firebase-admin/firestore';

const env = Object.fromEntries(readFileSync(join(process.cwd(), '.env'), 'utf8').split('\n')
  .map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('='))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
const app = initializeApp({
  apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY, authDomain: env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID, appId: env.EXPO_PUBLIC_FIREBASE_APP_ID,
});
const auth = getAuth(app);
const fns = getFunctions(app, 'europe-west1');
adminInit({ projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID });

const STAMP = Date.now();
const NONE = `zzz-probe-none-${STAMP}`;
const CALLS = [
  ['adminSaveRentalCompany', { name: '', sourceType: 'nope' }],
  ['adminSetRentalCompanyActive', { companyId: NONE, active: true }],
  ['adminSetRentalCategoryMap', { companyId: NONE, categoryMap: {} }],
  ['adminSetRentalItemCategories', { assignments: [{ itemId: `${NONE}_1`, category: 'lens' }] }],
  ['adminSyncRentalCompany', { companyId: NONE }],
  ['adminRemoveRentalCompany', { companyId: NONE }],
];
const results = [];
async function code(name, data) {
  try { await httpsCallable(fns, name)(data); return 'ok'; } catch (e) { return String(e?.code ?? e).replace(/^functions\//, ''); }
}

let uid;
try {
  const cred = await createUserWithEmailAndPassword(auth, `probe-rental-fn-${STAMP}@bama-invalid.test`, `Pw!${STAMP}aA`);
  uid = cred.user.uid;
  console.log(`\nsigned in as a NON-admin (${uid.slice(0, 8)}):`);
  for (const [name, data] of CALLS) {
    const got = await code(name, data);
    results.push(got === 'permission-denied');
    console.log(`  ${got === 'permission-denied' ? 'PASS' : 'FAIL'}  ${name}  — expected permission-denied, got ${got}`);
  }
  await signOut(auth);
  console.log('\nsigned out:');
  for (const [name, data] of CALLS) {
    const got = await code(name, data);
    const ok = got === 'permission-denied' || got === 'unauthenticated';
    results.push(ok);
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}  — expected denied, got ${got}`);
  }
  const got = await code('trackRentalClick', { itemId: `${NONE}_1` });
  results.push(got === 'unauthenticated');
  console.log(`  ${got === 'unauthenticated' ? 'PASS' : 'FAIL'}  trackRentalClick  — expected unauthenticated, got ${got}`);
} finally {
  const problems = [];
  if (uid) {
    await adminAuth().deleteUser(uid).catch((e) => problems.push(`auth: ${e.code}`));
    await new Promise((r) => setTimeout(r, 4000)); // onUserCreate can land after the delete
    await adminFs().doc(`users/${uid}`).delete();
    if ((await adminFs().doc(`users/${uid}`).get()).exists) problems.push('users doc SURVIVED');
    try { await adminAuth().getUser(uid); problems.push('auth account SURVIVED'); } catch { /* gone */ }
  }
  console.log(problems.length ? `\nCLEANUP INCOMPLETE: ${problems.join(', ')}` : '\ncleanup verified: throwaway account and its user doc are gone');
  console.log(`=== ${results.filter(Boolean).length}/${results.length} as expected ===`);
  process.exit(results.every(Boolean) && !problems.length ? 0 : 1);
}
