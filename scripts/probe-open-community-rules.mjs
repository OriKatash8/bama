#!/usr/bin/env node
/**
 * Probe for OPEN communities: `chats/{id}.joinMode`, owner rename, and a
 * non-member adding THEMSELVES to `members`.
 *
 * Runs against the Firestore EMULATOR with whatever firestore.rules says. Nothing
 * here touches production.
 *
 *   npx firebase emulators:start --only firestore,auth --project bama-af0a0
 *   node scripts/probe-open-community-rules.mjs --emulator
 */

import './lib/requireEmulator.mjs';
import { initializeApp as initAdmin } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { initializeApp } from 'firebase/app';
import {
  getFirestore, connectFirestoreEmulator, doc, updateDoc, writeBatch, arrayUnion, collection, serverTimestamp,
} from 'firebase/firestore';
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

async function ensureUser(label, verified = true) {
  const email = `${label}@probe.invalid`;
  let uid;
  try {
    uid = (await createUserWithEmailAndPassword(auth, email, PW)).user.uid;
  } catch {
    uid = (await signInWithEmailAndPassword(auth, email, PW)).user.uid;
  }
  await adminAuth.updateUser(uid, { emailVerified: verified });
  await signOut(auth);
  return uid;
}
async function as(label) {
  await signOut(auth).catch(() => {});
  await signInWithEmailAndPassword(auth, `${label}@probe.invalid`, PW);
}

const OWNER = await ensureUser('oc-owner');
const MEMBER = await ensureUser('oc-member');
const JOINER = await ensureUser('oc-joiner');
const OTHER = await ensureUser('oc-other');
const UNVERIFIED = await ensureUser('oc-unverified', false);

const CHAT = 'probe-oc-community';
const chatRef = doc(db, 'chats', CHAT);

async function reseed(extra = {}) {
  await adminDb.collection('chats').doc(CHAT).set({
    type: 'community', name: 'OC Probe', ownerId: OWNER,
    members: [OWNER, MEMBER], lastMessage: null, createdAt: new Date(), ...extra,
  });
  const ev = await adminDb.collection('chats').doc(CHAT).collection('communityEvents').get();
  await Promise.all(ev.docs.map((d) => d.ref.delete()));
}

async function attempt(section, name, identity, expected, seed, run) {
  await reseed(seed);
  await as(identity);
  let allowed = true;
  let error = '';
  try { await run(); } catch (e) { allowed = false; error = e.code ?? String(e.message ?? e); }
  rows.push({ section, name, expected, allowed, error });
}

const OPEN = { joinMode: 'open' };
/** What the app does: members + a join event in one batch (joinOpenCommunity). */
const joinBatch = (uid, { event = true, members } = {}) => async () => {
  const b = writeBatch(db);
  b.update(chatRef, { members: members ?? arrayUnion(uid) });
  if (event) b.set(doc(collection(db, 'chats', CHAT, 'communityEvents')), { type: 'join', userId: uid, at: serverTimestamp() });
  await b.commit();
};

// ── Joining ─────────────────────────────────────────────────────────────────
await attempt('join', 'a. non-member joins an OPEN community (members + event)', 'oc-joiner', true, OPEN, joinBatch(JOINER));
await attempt('join', 'b. same, members only (older client, no event)', 'oc-joiner', true, OPEN, joinBatch(JOINER, { event: false }));
await attempt('join', 'c. joins a community with NO joinMode', 'oc-joiner', false, {}, joinBatch(JOINER));
await attempt('join', 'd. joins an explicit approval community', 'oc-joiner', false, { joinMode: 'approval' }, joinBatch(JOINER));
await attempt('join', 'e. adds SOMEONE ELSE to an open community', 'oc-joiner', false, OPEN, joinBatch(OTHER));
await attempt('join', 'f. adds self AND another uid at once', 'oc-joiner', false, OPEN,
  joinBatch(JOINER, { members: [OWNER, MEMBER, JOINER, OTHER], event: false }));
await attempt('join', 'g. replaces the whole members list', 'oc-joiner', false, OPEN,
  joinBatch(JOINER, { members: [JOINER], event: false }));
await attempt('join', 'h. joins while also touching ownerId', 'oc-joiner', false, OPEN,
  async () => updateDoc(chatRef, { members: arrayUnion(JOINER), ownerId: JOINER }));
await attempt('join', 'i. joins a SUSPENDED open community', 'oc-joiner', false, { ...OPEN, status: 'suspended' }, joinBatch(JOINER));
await attempt('join', 'j. unverified-email user joins open community', 'oc-unverified', false, OPEN, joinBatch(UNVERIFIED));
await attempt('join', 'k. forged join event for another user', 'oc-joiner', false, OPEN, async () => {
  const b = writeBatch(db);
  b.update(chatRef, { members: arrayUnion(JOINER) });
  b.set(doc(collection(db, 'chats', CHAT, 'communityEvents')), { type: 'join', userId: OTHER, at: serverTimestamp() });
  await b.commit();
});
await attempt('join', 'l. join event on a PRIVATE community by the joiner', 'oc-joiner', false, {}, async () => {
  const b = writeBatch(db);
  b.set(doc(collection(db, 'chats', CHAT, 'communityEvents')), { type: 'join', userId: JOINER, at: serverTimestamp() });
  await b.commit();
});

// ── Owner controls ──────────────────────────────────────────────────────────
await attempt('owner', 'm. owner renames', 'oc-owner', true, {}, () => updateDoc(chatRef, { name: 'New Name' }));
await attempt('owner', 'n. owner renames to empty', 'oc-owner', false, {}, () => updateDoc(chatRef, { name: '   ' }));
await attempt('owner', 'o. owner renames to 61 chars', 'oc-owner', false, {}, () => updateDoc(chatRef, { name: 'x'.repeat(61) }));
await attempt('owner', 'p. owner sets joinMode open', 'oc-owner', true, {}, () => updateDoc(chatRef, { joinMode: 'open' }));
await attempt('owner', 'q. owner sets joinMode approval', 'oc-owner', true, OPEN, () => updateDoc(chatRef, { joinMode: 'approval' }));
await attempt('owner', 'r. owner sets joinMode to junk', 'oc-owner', false, {}, () => updateDoc(chatRef, { joinMode: 'sure' }));
await attempt('owner', 's. member renames', 'oc-member', false, {}, () => updateDoc(chatRef, { name: 'Mine' }));
await attempt('owner', 't. member opens the community', 'oc-member', false, {}, () => updateDoc(chatRef, { joinMode: 'open' }));
await attempt('owner', 'u. stranger opens the community', 'oc-other', false, {}, () => updateDoc(chatRef, { joinMode: 'open' }));
await attempt('owner', 'v. owner still approves a member (members add)', 'oc-owner', true, {}, () => updateDoc(chatRef, { members: arrayUnion(OTHER) }));

let mismatches = 0;
for (const section of [...new Set(rows.map((r) => r.section))]) {
  console.log(`\n${section.toUpperCase()}`);
  for (const r of rows.filter((x) => x.section === section)) {
    const ok = r.allowed === r.expected;
    if (!ok) mismatches++;
    console.log(`  ${ok ? '  ' : '✗ '}${r.name.padEnd(58)} ${(r.allowed ? 'ALLOW' : 'deny ').padEnd(6)} expected ${r.expected ? 'ALLOW' : 'deny'}` + (r.error && r.expected ? `  (${r.error})` : ''));
  }
}
console.log(`\n${rows.length} cases, ${mismatches} not as expected`);
await adminDb.collection('chats').doc(CHAT).delete();
process.exit(mismatches === 0 ? 0 : 1);
