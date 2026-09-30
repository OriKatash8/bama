#!/usr/bin/env node
/**
 * Probe for the no-contact-details rule (phone numbers, email addresses) on
 * users/{uid}/profile/data (Terms §6.8).
 *
 * Runs against the Firestore EMULATOR with whatever firestore.rules currently
 * says. Nothing here touches production.
 *
 * Writes use the exact call the app makes — setDoc(profile/data, {...}, { merge: true })
 * with { roleSkills, bio, equipment, priceList, proProfileCompleted }, or
 * { availability } alone (useProfile.ts) — varied one field at a time, plus
 * writes that skip the app's own check (a direct SDK write).
 *
 *   npx firebase emulators:start --only firestore,auth --project bama-af0a0
 *   node scripts/probe-contact-rules.mjs
 */

import { initializeApp as initAdmin } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, doc, setDoc } from 'firebase/firestore';
import {
  getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
} from 'firebase/auth';

const FS_PORT = process.env.FS_PORT ?? '8080';
const AUTH_PORT = process.env.AUTH_PORT ?? '9099';
process.env.FIRESTORE_EMULATOR_HOST ??= `127.0.0.1:${FS_PORT}`;
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= `127.0.0.1:${AUTH_PORT}`;
const PROJECT = 'bama-af0a0';

const adminApp = initAdmin({ projectId: PROJECT });
const adminDb = getAdminFirestore(adminApp);
const adminAuth = getAdminAuth(adminApp);
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
  // profile/data requires a verified email; a fresh sign-in picks this up.
  await adminAuth.updateUser(uid, { emailVerified: true });
  await signOut(auth);
  return uid;
}
async function as(label) {
  await signOut(auth).catch(() => {});
  await signInWithEmailAndPassword(auth, `${label}@probe.invalid`, PW);
}

const PRO = await ensureUser('ct-pro');
await ensureUser('ct-other');

const CLEAN = {
  roleSkills: [{ role: 'videographer', specializations: ['general'] }],
  bio: 'צלם וידאו, Sony 24-70mm f/2.8, מחיר ₪1,500 ליום, ניסיון מ-2015',
  equipment: [{ name: 'A7S III + 3 סוללות', category: 'camera' }, 'DJI RS3'],
  priceList: [{ service: 'צילום 4K 120fps', price: 1500 }],
  proProfileCompleted: true,
};

/** Known state before EVERY attempt, rules-exempt. */
async function reseed(existing) {
  const ref = adminDb.doc(`users/${PRO}/profile/data`);
  if (existing === null) await ref.delete();
  else await ref.set(existing);
}

async function attempt(section, name, identity, expected, existing, data) {
  await reseed(existing);
  await as(identity);
  let allowed = true;
  let error = '';
  try { await setDoc(doc(db, 'users', PRO, 'profile', 'data'), data, { merge: true }); }
  catch (e) { allowed = false; error = e.code ?? String(e.message ?? e); }
  rows.push({ section, name, identity, expected, allowed, error });
}

const items = (n, name = (i) => `item ${i}`) => Array.from({ length: n }, (_, i) => ({ name: name(i), category: 'other' }));
const DIRTY_BIO = { ...CLEAN, bio: 'צלמו אלי 054-7654321' };

// ── The app's own save ──────────────────────────────────────────────────────
// A new pro has no priceList yet: the app sends [] (profile.priceList ?? []).
await attempt('app', '1. clean bio + equipment, first save (create)', 'ct-pro', true, null, { ...CLEAN, priceList: [] });
await attempt('app', '2. clean bio + equipment, re-save (update)', 'ct-pro', true, CLEAN, { ...CLEAN, bio: 'עדכון' });
await attempt('app', '3. availability alone, clean profile', 'ct-pro', true, CLEAN, { availability: 'busy' });
await attempt('app', '4. availability alone, OLD bio already has a phone', 'ct-pro', true, DIRTY_BIO, { availability: 'busy' });
await attempt('app', '5. full save that leaves an OLD phone bio unchanged', 'ct-pro', true, DIRTY_BIO, { ...DIRTY_BIO, roleSkills: [] });
await attempt('app', '6. 15 clean equipment items (the cap)', 'ct-pro', true, CLEAN, { ...CLEAN, equipment: items(15) });
await attempt('app', '6b. worst case: bio + 15 equipment changed together', 'ct-pro', true, CLEAN, {
  ...CLEAN,
  bio: 'צלם וידאו עם ניסיון, Sony 24-70mm f/2.8, מחיר ₪1,500 ליום',
  equipment: items(15, (i) => `Sony 24-70mm f/2.8 lens number ${i} with a long description`),
});
await attempt('app', '6e. an @handle and "@" are not emails', 'ct-pro', true, CLEAN,
  { ...CLEAN, bio: 'עקבו אחרי @roi.films, 1,500 ש"ח @ יום' });
await attempt('app', '6d. priceList emptied', 'ct-pro', true, CLEAN, { ...CLEAN, priceList: [] });

// ── Direct SDK writes, skipping the app's check ─────────────────────────────
await attempt('bypass', '7. bio "052-123-4567"', 'ct-pro', false, CLEAN, { ...CLEAN, bio: 'call 052-123-4567' });
await attempt('bypass', '8. bio "+972-52-123-4567"', 'ct-pro', false, CLEAN, { ...CLEAN, bio: 'WhatsApp +972-52-123-4567' });
await attempt('bypass', '9. bio "05 2 1 2 3 4 5 6 7"', 'ct-pro', false, CLEAN, { ...CLEAN, bio: '05 2 1 2 3 4 5 6 7' });
await attempt('bypass', '10. bio "1-700-123-456"', 'ct-pro', false, CLEAN, { ...CLEAN, bio: '1-700-123-456' });
await attempt('bypass', '11. bio with a phone on first save (create)', 'ct-pro', false, null, { ...CLEAN, bio: '03-1234567' });
await attempt('bypass', '12. equipment item {name} with a phone', 'ct-pro', false, CLEAN,
  { ...CLEAN, equipment: [{ name: 'FX3', category: 'camera' }, { name: '052-123-4567', category: 'other' }] });
await attempt('bypass', '13. equipment legacy string with a phone', 'ct-pro', false, CLEAN, { ...CLEAN, equipment: ['0521234567'] });
await attempt('bypass', '14. phone in the LAST checked position (#15)', 'ct-pro', false, CLEAN,
  { ...CLEAN, equipment: items(15, (i) => (i === 14 ? '052-123-4567' : `item ${i}`)) });
await attempt('bypass', '15. 16 equipment items (over the cap)', 'ct-pro', false, CLEAN, { ...CLEAN, equipment: items(16) });
await attempt('bypass', '15b. priceList changed to new clean text (no editor exists)', 'ct-pro', false, CLEAN,
  { ...CLEAN, priceList: [{ service: 'עריכה', price: 500 }] });
await attempt('bypass', '12b. bio with an email address', 'ct-pro', false, CLEAN, { ...CLEAN, bio: 'mail me: roi.cohen@gmail.com' });
await attempt('bypass', '12c. equipment item with an email address', 'ct-pro', false, CLEAN,
  { ...CLEAN, equipment: [{ name: 'FX3', category: 'camera' }, { name: 'roi@walla.co.il', category: 'other' }] });
await attempt('bypass', '12d. email in the LAST checked position (#15)', 'ct-pro', false, CLEAN,
  { ...CLEAN, equipment: items(15, (i) => (i === 14 ? 'roi@gmail.com' : `item ${i}`)) });
await attempt('bypass', '16. priceList service with a phone', 'ct-pro', false, CLEAN,
  { ...CLEAN, priceList: [{ service: 'call 054-7654321', price: 100 }] });
await attempt('bypass', '17. a new field (headline) carrying the number', 'ct-pro', false, CLEAN, { headline: '052-123-4567' });
await attempt('bypass', '18. a new field even without a number', 'ct-pro', false, CLEAN, { rating: 5 });
await attempt('bypass', '19. another user writes the profile', 'ct-other', false, CLEAN, { ...CLEAN, bio: 'hi' });

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
