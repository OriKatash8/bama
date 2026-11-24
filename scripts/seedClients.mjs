#!/usr/bin/env node
/**
 * PRODUCTION: seed 5 test CLIENT accounts (Auth + users/{uid}), flagged isSeed:true
 * so scripts/removeSeedUsers.mjs can delete them. Writes NO professional profile.
 *
 *   node scripts/seedClients.mjs --prod            dry run: prints what it would do
 *   SEED_PASSWORD=... node scripts/seedClients.mjs --prod --commit   creates them
 *   SEED_PASSWORD=... node scripts/seedClients.mjs --prod --reset-password --commit
 *       sets SEED_PASSWORD on the existing seed accounts (only users flagged isSeed)
 *
 * Credentials: Application Default Credentials (gcloud auth application-default
 * login). No service-account key is read or needed; never put one in the repo.
 * An email that already exists in Auth is skipped and reported, never overwritten.
 */
import './lib/requireProd.mjs';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const PROJECT = 'bama-af0a0';
const COMMIT = process.argv.includes('--commit');
// Never hardcoded: SEED_PASSWORD from the environment, never printed or written anywhere.
const RESET = process.argv.includes('--reset-password');
const PASSWORD = process.env.SEED_PASSWORD;
if ((COMMIT || RESET) && (!PASSWORD || PASSWORD.length < 8)) {
  console.error('Set SEED_PASSWORD (min 8 chars) in the environment before using --commit / --reset-password.');
  process.exit(2);
}
// src/core/constants/legal.ts CURRENT_TERMS_VERSION. needsConsent compares this only.
const TERMS_VERSION = '1.6';

export const SEED_CLIENTS = [
  { name: 'עומר שני', email: 'bama.test1@gmail.com' },
  { name: 'מאי אדלשטיין', email: 'bama.test2@gmail.com' },
  { name: 'אורנה ויתקין', email: 'bama.test3@gmail.com' },
  { name: 'אייל דן', email: 'bama.test4@gmail.com' },
  { name: 'איתי גולדברג', email: 'bama.test5@gmail.com' },
];

initializeApp({ projectId: PROJECT });
const auth = getAuth();
const db = getFirestore();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForTriggerDoc(uid) {
  // Auth's onUserCreate trigger merge-writes users/{uid}; let it land first so our
  // fields are written after it. If it never shows, we write anyway (merge).
  for (let i = 0; i < 20; i++) {
    if ((await db.doc(`users/${uid}`).get()).exists) return true;
    await sleep(1000);
  }
  return false;
}

const rows = [];
for (const c of SEED_CLIENTS) {
  let existing = null;
  try { existing = await auth.getUserByEmail(c.email); } catch (e) { if (e.code !== 'auth/user-not-found') throw e; }
  if (existing && RESET) {
    const isSeed = (await db.doc(`users/${existing.uid}`).get()).data()?.isSeed === true;
    if (!isSeed) { console.log(`REFUSE ${c.email}: not flagged isSeed; password untouched.`); rows.push({ ...c, uid: existing.uid, result: 'refused (not seed)' }); continue; }
    if (COMMIT) await auth.updateUser(existing.uid, { password: PASSWORD });
    console.log(`${COMMIT ? 'RESET ' : 'WOULD reset'} password for ${c.email}`);
    rows.push({ ...c, uid: existing.uid, result: COMMIT ? 'password reset' : 'dry run (reset)' });
    continue;
  }
  if (existing) {
    console.log(`SKIP   ${c.email} already exists in Auth (uid ${existing.uid}); untouched.`);
    rows.push({ ...c, uid: existing.uid, result: 'skipped (exists)' });
    continue;
  }
  if (!COMMIT) {
    console.log(`WOULD  create ${c.email} "${c.name}"`);
    rows.push({ ...c, uid: '-', result: 'dry run' });
    continue;
  }
  const u = await auth.createUser({ email: c.email, password: PASSWORD, displayName: c.name, emailVerified: true });
  const trigger = await waitForTriggerDoc(u.uid);
  const now = Date.now();
  await db.doc(`users/${u.uid}`).set(
    {
      id: u.uid,
      displayName: c.name,
      photoURL: null,
      createdAt: FieldValue.serverTimestamp(),
      // consent gate (needsConsent): termsVersion must equal the current version
      termsVersion: TERMS_VERSION,
      termsAcceptedAt: now,
      ageConfirmed: true,
      ageConfirmedAt: now,
      // client onboarding + first-time setup page
      clientOnboarded: true,
      needsProfileSetup: false,
      // cleanup marker only; nothing in the app reads it
      isSeed: true,
    },
    { merge: true },
  );
  console.log(`CREATED ${c.email} uid=${u.uid} (onUserCreate doc seen first: ${trigger})`);
  rows.push({ ...c, uid: u.uid, result: 'created' });
}

console.log('\nname | email | uid | result');
for (const r of rows) console.log(`${r.name} | ${r.email} | ${r.uid} | ${r.result}`);
if (!COMMIT) console.log('\n(dry run: nothing written; pass --commit)');
