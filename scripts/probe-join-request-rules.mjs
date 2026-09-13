#!/usr/bin/env node
/**
 * Probe for `chats/{chatId}/joinRequests/{requestId}`.
 *
 * Runs against the Firestore EMULATOR with whatever firestore.rules currently
 * says, so it can be run before and after a rule change and the outputs diffed.
 * Nothing here touches production.
 *
 * The bug under test: a request doc that is already `approved` or `rejected`
 * could never be re-sent. `setDoc` on an existing doc is an UPDATE, and update
 * was owner/app-admin only — so someone who left a community, or was rejected
 * once, got a silent permission error from Discover forever.
 *
 * Every row that writes a request uses the exact shape the app writes
 * (useCommunityDiscovery.requestToJoin): { userId, displayName, requestedAt:
 * serverTimestamp(), status: 'pending' }, varied one field at a time.
 *
 *   npx firebase emulators:start --only firestore,auth --project bama-af0a0
 *   node scripts/probe-join-request-rules.mjs [--json out.json]
 */

import { initializeApp as initAdmin } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import {
  getFirestore, connectFirestoreEmulator, doc, setDoc, updateDoc, deleteDoc, getDoc,
  getDocs, collection, query, where, serverTimestamp,
} from 'firebase/firestore';
import {
  getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
} from 'firebase/auth';
import { writeFileSync } from 'node:fs';

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
const ids = {};
const rows = [];

async function ensureUser(label) {
  const email = `${label}@probe.invalid`;
  try {
    ids[label] = (await createUserWithEmailAndPassword(auth, email, PW)).user.uid;
  } catch {
    ids[label] = (await signInWithEmailAndPassword(auth, email, PW)).user.uid;
  }
  await signOut(auth);
  return ids[label];
}

async function as(label) {
  await signOut(auth).catch(() => {});
  await signInWithEmailAndPassword(auth, `${label}@probe.invalid`, PW);
}

const OWNER = await ensureUser('jr-owner');
const MEMBER = await ensureUser('jr-member');          // in members, request doc 'approved'
const REJECTED = await ensureUser('jr-rejected');      // not in members, doc 'rejected'
const LEFT = await ensureUser('jr-left');              // not in members, doc 'approved' (left later)
const PENDING = await ensureUser('jr-pending');        // not in members, doc 'pending'
const STRANGER = await ensureUser('jr-stranger');      // not in members, no doc

const CHAT = 'probe-jr-community';
const REQS = adminDb.collection('chats').doc(CHAT).collection('joinRequests');

/** Known state before EVERY attempt, rules-exempt. */
async function reseed() {
  await adminDb.collection('chats').doc(CHAT).set({
    type: 'community', name: 'JR Probe', ownerId: OWNER,
    members: [OWNER, MEMBER], lastMessage: null, createdAt: new Date(),
  });
  const existing = await REQS.get();
  await Promise.all(existing.docs.map((d) => d.ref.delete()));
  const seed = (uid, status) => REQS.doc(uid).set({ userId: uid, displayName: uid, requestedAt: new Date(), status });
  await Promise.all([
    seed(MEMBER, 'approved'),
    seed(REJECTED, 'rejected'),
    seed(LEFT, 'approved'),
    seed(PENDING, 'pending'),
  ]);
}

const appShape = (uid, over = {}) => ({
  userId: uid, displayName: 'Probe Person', requestedAt: serverTimestamp(), status: 'pending', ...over,
});

async function attempt(section, name, identity, expected, run) {
  await reseed();
  await as(identity);
  let allowed = true;
  let error = '';
  try {
    await run();
  } catch (e) {
    allowed = false;
    error = e.code ?? String(e.message ?? e);
  }
  rows.push({ section, name, identity, expected, allowed, error });
}

const ref = (uid) => doc(db, 'chats', CHAT, 'joinRequests', uid);

// ── Sending a request (setDoc, exactly as the app does) ─────────────────────
await attempt('send', 'a. stranger sends a first request', 'jr-stranger', true,
  () => setDoc(ref(STRANGER), appShape(STRANGER)));
await attempt('send', 'b. REJECTED user asks again', 'jr-rejected', true,
  () => setDoc(ref(REJECTED), appShape(REJECTED)));
await attempt('send', 'c. user who LEFT (doc still approved) asks again', 'jr-left', true,
  () => setDoc(ref(LEFT), appShape(LEFT)));
await attempt('send', 'd. current MEMBER re-sends (doc approved)', 'jr-member', false,
  () => setDoc(ref(MEMBER), appShape(MEMBER)));
await attempt('send', 'e. PENDING user re-sends over pending', 'jr-pending', false,
  () => setDoc(ref(PENDING), appShape(PENDING)));

// ── Shape: forged or malformed request docs ─────────────────────────────────
await attempt('shape', 'f. stranger self-approves on create', 'jr-stranger', false,
  () => setDoc(ref(STRANGER), appShape(STRANGER, { status: 'approved' })));
await attempt('shape', 'g. rejected user resets straight to approved', 'jr-rejected', false,
  () => setDoc(ref(REJECTED), appShape(REJECTED, { status: 'approved' })));
await attempt('shape', 'h. extra field on create', 'jr-stranger', false,
  () => setDoc(ref(STRANGER), appShape(STRANGER, { injected: 'x' })));
await attempt('shape', 'i. userId not the caller', 'jr-stranger', false,
  () => setDoc(ref(STRANGER), appShape(STRANGER, { userId: OWNER })));
await attempt('shape', 'j. doc id is someone else', 'jr-stranger', false,
  () => setDoc(ref(REJECTED), appShape(REJECTED)));
await attempt('shape', 'k. client-chosen requestedAt (not server time)', 'jr-stranger', false,
  () => setDoc(ref(STRANGER), appShape(STRANGER, { requestedAt: new Date('2020-01-01') })));
await attempt('shape', 'l. missing displayName', 'jr-stranger', false,
  () => setDoc(ref(STRANGER), { userId: STRANGER, requestedAt: serverTimestamp(), status: 'pending' }));

// ── Owner / others acting on requests ───────────────────────────────────────
await attempt('owner', 'm. owner approves a pending request', 'jr-owner', true,
  () => updateDoc(ref(PENDING), { status: 'approved' }));
await attempt('owner', 'n. owner rejects a pending request', 'jr-owner', true,
  () => updateDoc(ref(PENDING), { status: 'rejected' }));
await attempt('owner', 'o. stranger approves someone else', 'jr-stranger', false,
  () => updateDoc(ref(PENDING), { status: 'approved' }));
await attempt('owner', 'p. owner lists pending (Manage modal query)', 'jr-owner', true,
  () => getDocs(query(collection(db, 'chats', CHAT, 'joinRequests'), where('status', '==', 'pending'))));

// ── Reading and withdrawing ─────────────────────────────────────────────────
await attempt('read', 'q. requester reads own status', 'jr-rejected', true, () => getDoc(ref(REJECTED)));
await attempt('read', "r. stranger reads another's request", 'jr-stranger', false, () => getDoc(ref(PENDING)));
await attempt('read', 's. requester withdraws own pending', 'jr-pending', true, () => deleteDoc(ref(PENDING)));
await attempt('read', 't. requester deletes own rejected', 'jr-rejected', false, () => deleteDoc(ref(REJECTED)));

// ── Report ──────────────────────────────────────────────────────────────────
let mismatches = 0;
for (const section of [...new Set(rows.map((r) => r.section))]) {
  console.log(`\n${section.toUpperCase()}`);
  for (const r of rows.filter((x) => x.section === section)) {
    const ok = r.allowed === r.expected;
    if (!ok) mismatches++;
    console.log(
      `  ${ok ? '  ' : '✗ '}${r.name.padEnd(52)} ${(r.allowed ? 'ALLOW' : 'deny ').padEnd(6)} expected ${r.expected ? 'ALLOW' : 'deny'}` +
      (r.error && r.expected ? `  (${r.error})` : ''),
    );
  }
}
console.log(`\n${rows.length} cases, ${mismatches} not as expected`);

const jsonArg = process.argv.indexOf('--json');
if (jsonArg !== -1 && process.argv[jsonArg + 1]) {
  writeFileSync(process.argv[jsonArg + 1], JSON.stringify(rows, null, 2));
  console.log(`wrote ${process.argv[jsonArg + 1]}`);
}

await REQS.get().then((s) => Promise.all(s.docs.map((d) => d.ref.delete())));
await adminDb.collection('chats').doc(CHAT).delete();
process.exit(mismatches === 0 ? 0 : 1);
