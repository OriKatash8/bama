#!/usr/bin/env node
/**
 * DEV FIXTURE for the rental companies admin screen. Seeds the LOCAL emulators
 * so the app (run with EXPO_PUBLIC_USE_EMULATORS=1) has an admin to sign in as.
 * Refuses to run against anything but a `demo-` project on local emulators.
 * Unlike dev-invite-fixture it wipes nothing: accounts are upserted.
 *
 *   # emulators up (auth, firestore, storage, functions), then:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *     node scripts/dev-rental-fixture.mjs [--with-company]
 *
 * Creates two emulator-only accounts: an admin (custom claim role: admin) and a
 * regular user. With --with-company it also adds the test WooCommerce store as
 * a company THROUGH THE REAL CALLABLES (adminSaveRentalCompany,
 * adminSetRentalCategoryMap, adminSyncRentalCompany) — so it is a smoke test of
 * the backend too, and the sync reads the real store. The company stays hidden
 * from users, exactly as a new one would.
 */
import { readFileSync } from 'fs';
import { initializeApp as adminInit } from 'firebase-admin/app';
import { getFirestore as adminFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';

const args = process.argv.slice(2);
const valueOf = (f, d) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : d; };
const PROJECT = valueOf('--project', 'demo-bama');
const WITH_COMPANY = args.includes('--with-company');
const FS = process.env.FIRESTORE_EMULATOR_HOST;
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST;

if (!PROJECT.startsWith('demo-') || !FS || !AUTH) {
  console.error(
    'REFUSING TO RUN: emulators and a demo- project only:\n' +
      '  FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node scripts/dev-rental-fixture.mjs',
  );
  process.exit(2);
}
if (![FS, AUTH].every((h) => /^(127\.0\.0\.1|localhost|0\.0\.0\.0)(:\d+)?$/.test(h))) {
  console.error(`REFUSING TO RUN: emulator hosts must be local (got ${FS}, ${AUTH}).`);
  process.exit(2);
}

// Not a secret: these accounts exist only in the local Auth emulator.
const PASSWORD = process.env.FIXTURE_PASSWORD ?? 'emulator-only-not-a-secret';
// Kept in step with the app, so the accounts are never sent back to accept the Terms.
const TERMS_VERSION = readFileSync('src/core/constants/legal.ts', 'utf8').match(/CURRENT_TERMS_VERSION = '([^']+)'/)[1];
const TEST_STORE = 'https://xn--6dbfboov3a.xn--4dbrk0ce/';
// The approved mapping for the test store (see the feature plan).
const TEST_MAP = {
  'ציוד תאורה להשכרה': 'lighting',
  'ציוד סאונד להשכרה': 'audio',
  'ציוד היקפי וגריפ להשכרה': 'grip',
  'ציוד הפקה / מחנה להשכרה': 'production',
  'אביזרי חשמל וסוללות להשכרה': 'production',
  'ציוד אפקטים להשכרה': 'production',
  'חומרי גלם': 'hidden',
};

adminInit({ projectId: PROJECT });
const db = adminFirestore();
const now = Timestamp.now();

const PEOPLE = [
  { uid: 'fx-rental-admin', name: 'Rina Admin', email: 'admin@rental.test', admin: true },
  { uid: 'fx-rental-user', name: 'Uri User', email: 'user@rental.test', admin: false },
];
for (const p of PEOPLE) {
  await adminAuth().deleteUser(p.uid).catch(() => {});
  await adminAuth().createUser({ uid: p.uid, email: p.email, password: PASSWORD, emailVerified: true, displayName: p.name });
  if (p.admin) await adminAuth().setCustomUserClaims(p.uid, { role: 'admin' });
  await db.doc(`users/${p.uid}`).set({
    id: p.uid, email: p.email, displayName: p.name, photoURL: null, createdAt: now,
    termsVersion: TERMS_VERSION, needsProfileSetup: false, clientOnboarded: true,
  });
}

let companyLine = '';
if (WITH_COMPANY) {
  const app = initializeApp({ projectId: PROJECT, apiKey: 'fake' }, 'fixture-admin');
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH}`, { disableWarnings: true });
  const fns = getFunctions(app, 'europe-west1');
  const [fHost, fPort] = (process.env.FUNCTIONS_EMULATOR_HOST ?? '127.0.0.1:5001').split(':');
  connectFunctionsEmulator(fns, fHost, Number(fPort));
  await signInWithEmailAndPassword(auth, 'admin@rental.test', PASSWORD);
  const call = (name, data) => httpsCallable(fns, name, { timeout: 540_000 })(data).then((r) => r.data);

  const { companyId } = await call('adminSaveRentalCompany', {
    name: 'השכרת ציוד צילום (בדיקה)', city: 'תל אביב', sourceType: 'woocommerce', sourceUrl: TEST_STORE, website: TEST_STORE,
  });
  await call('adminSetRentalCategoryMap', { companyId, categoryMap: TEST_MAP });
  const stats = await call('adminSyncRentalCompany', { companyId });
  companyLine = `\nCompany ${companyId} (hidden from users) synced from ${TEST_STORE}:\n  ${JSON.stringify(stats)}\n`;
}

console.log(`
FIXTURE READY (emulator project ${PROJECT})

Sign in at http://localhost:8081 (app started with EXPO_PUBLIC_USE_EMULATORS=1), password: ${PASSWORD}
  admin@rental.test   admin  → Mode select → Admin → Operations → Rental companies
  user@rental.test    regular user (for the rental tab)
${companyLine}`);
process.exit(0);
