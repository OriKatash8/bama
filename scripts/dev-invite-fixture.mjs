#!/usr/bin/env node
/**
 * DEV FIXTURE for the community invite links. Seeds the LOCAL emulators so the app
 * (run with EXPO_PUBLIC_USE_EMULATORS=1) and the landing page have something real
 * to open. It refuses to run against anything but a `demo-` project on the local
 * emulators, and it WIPES that emulator's data first.
 *
 *   # emulators up (auth, firestore, functions), then:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *     node scripts/dev-invite-fixture.mjs
 *
 * Creates five test accounts (emulator only, password printed at the end), a
 * community, and mints the invite links through the REAL createCommunityInvite
 * callable, so it is also a smoke test of the backend. Prints the URLs to paste.
 */
import { initializeApp as adminInit } from 'firebase-admin/app';
import { getFirestore as adminFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { APP_LINKS_DEV, validateAppLinks } from './lib/appLinks.mjs';

const args = process.argv.slice(2);
const valueOf = (f, d) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : d; };
const PROJECT = valueOf('--project', 'demo-bama');
const APP_URL = valueOf('--app-url', 'http://localhost:8081');
const FS = process.env.FIRESTORE_EMULATOR_HOST;
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST;

if (!PROJECT.startsWith('demo-') || !FS || !AUTH) {
  console.error(
    'REFUSING TO RUN: this wipes data. It only runs against the local emulators and a demo- project:\n' +
      '  FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node scripts/dev-invite-fixture.mjs',
  );
  process.exit(2);
}
if (![FS, AUTH].every((h) => /^(127\.0\.0\.1|localhost|0\.0\.0\.0)(:\d+)?$/.test(h))) {
  console.error(`REFUSING TO RUN: emulator hosts must be local (got ${FS}, ${AUTH}).`);
  process.exit(2);
}

const PASSWORD = 'Invite-test-1';
const TERMS_VERSION = '1.4'; // CURRENT_TERMS_VERSION (src/core/constants/legal.ts)
const COMMUNITY_ID = 'fx-community';

// 1. Clean slate, through the emulators' own reset endpoints.
for (const url of [
  `http://${FS}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`,
  `http://${AUTH}/emulator/v1/projects/${PROJECT}/accounts`,
]) {
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) throw new Error(`could not reset ${url}: ${res.status}`);
}

adminInit({ projectId: PROJECT });
const db = adminFirestore();
const now = Timestamp.now();

// 2. config/appLinks, validated by the same rule createCommunityInvite enforces.
const problems = validateAppLinks(APP_LINKS_DEV);
if (problems.length) throw new Error(`appLinks invalid: ${problems.join('; ')}`);
await db.doc('config/appLinks').set({ ...APP_LINKS_DEV });

// 3. Accounts. Every one verified, consented, set up, with a phone unless noted.
const PEOPLE = [
  { uid: 'fx-owner', name: 'Olive Owner', email: 'owner@invite.test', pro: ['editor'], phone: true, note: 'owns the community (use professional mode)' },
  { uid: 'fx-member', name: 'Maya Member', email: 'member@invite.test', pro: null, phone: true, note: 'already a member of it' },
  { uid: 'fx-client', name: 'Noa Client', email: 'client@invite.test', pro: null, phone: true, note: 'no professional profile (a plain requester)' },
  { uid: 'fx-pro', name: 'Pavel Pro', email: 'pro@invite.test', pro: ['editor', 'videographer'], phone: true, note: 'has a professional profile with two roles' },
  { uid: 'fx-nophone', name: 'Nadav NoPhone', email: 'nophone@invite.test', pro: null, phone: false, note: 'no phone number on file (phone rung comes after the invite)' },
];
for (const p of PEOPLE) {
  await adminAuth().createUser({ uid: p.uid, email: p.email, password: PASSWORD, emailVerified: true, displayName: p.name });
  await db.doc(`users/${p.uid}`).set({
    id: p.uid, email: p.email, displayName: p.name, photoURL: null, createdAt: now,
    termsVersion: TERMS_VERSION, needsProfileSetup: false, clientOnboarded: true,
  });
  if (p.phone) await db.doc(`users/${p.uid}/private/contact`).set({ phone: '+972501234567', updatedAt: now });
  if (p.pro) {
    await db.doc(`users/${p.uid}/profile/data`).set({
      userId: p.uid, roles: p.pro, roleSkills: p.pro.map((role) => ({ role, specializations: [] })),
      bio: '', availability: 'available', rating: 0, reviewCount: 0, equipment: [], priceList: [], proProfileCompleted: true,
    });
  }
}

// 4. The community.
await db.doc(`chats/${COMMUNITY_ID}`).set({
  type: 'community', name: 'Gaffers Guild', description: 'Lighting crews trading tips, gear and gigs.',
  ownerId: 'fx-owner', members: ['fx-owner', 'fx-member'], lastMessage: null, createdAt: now,
});

// 5. Invites, through the real callables, as the owner.
const app = initializeApp({ projectId: PROJECT, apiKey: 'fake' }, 'fixture-owner');
const auth = getAuth(app);
connectAuthEmulator(auth, `http://${AUTH}`, { disableWarnings: true });
const fns = getFunctions(app, 'europe-west1');
const [fHost, fPort] = (process.env.FUNCTIONS_EMULATOR_HOST ?? '127.0.0.1:5001').split(':');
connectFunctionsEmulator(fns, fHost, Number(fPort));
await signInWithEmailAndPassword(auth, 'owner@invite.test', PASSWORD);
const call = (name, data) => httpsCallable(fns, name)(data).then((r) => r.data);

const revoked = await call('createCommunityInvite', { communityId: COMMUNITY_ID });
await call('revokeCommunityInvite', { token: revoked.token });
const live = await call('createCommunityInvite', { communityId: COMMUNITY_ID });
if (live.token === revoked.token) throw new Error('create after revoke returned the revoked token');

// 6. What to paste.
const rows = PEOPLE.map((p) => `  ${p.email.padEnd(22)} ${p.note}`).join('\n');
console.log(`
FIXTURE READY (emulator project ${PROJECT})

Log in with any of these, password: ${PASSWORD}
${rows}

Invite links (open in the app running with EXPO_PUBLIC_USE_EMULATORS=1):
  live token      ${APP_URL}/c/${live.token}
  live short code ${APP_URL}/c/${live.shortCode}
  REVOKED token   ${APP_URL}/c/${revoked.token}
  unknown code    ${APP_URL}/c/ZZZZZZ
  malformed       ${APP_URL}/c/not-a-token

Deep-link form (device/simulator):  bama://c/${live.token}
Community id: ${COMMUNITY_ID}   (owner dashboard: ${APP_URL}/chat/community-admin?chatId=${COMMUNITY_ID} in the owner's mode)
`);
process.exit(0);
