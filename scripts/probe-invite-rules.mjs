#!/usr/bin/env node
/**
 * Probe for the community invite rules.
 *
 *   - communityInvites / communityInviteCodes are function-only: no client can
 *     read, list or write them, including the community owner.
 *   - A join request may carry `via: 'invite'` + `inviteToken`, but only both
 *     together, and only naming a live (non-revoked) invite for THIS community.
 *   - A plain request (no invite fields), exactly as Discover sends it, is
 *     unaffected. That row is the one that would catch a rule that errors on a
 *     missing token.
 *
 * Runs against the Firestore EMULATOR only. Run probe-join-request-rules.mjs too:
 * this file covers the invite additions, that one the base request behaviour.
 *
 *   npx firebase emulators:start --only firestore,auth --project bama-af0a0
 *   node scripts/probe-invite-rules.mjs [--json out.json]
 */

import { initializeApp as initAdmin } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import {
  getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc, getDocs, collection,
  query, where, serverTimestamp,
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
const rows = [];

async function ensureUser(label) {
  const email = `${label}@probe.invalid`;
  let uid;
  try { uid = (await createUserWithEmailAndPassword(auth, email, PW)).user.uid; }
  catch { uid = (await signInWithEmailAndPassword(auth, email, PW)).user.uid; }
  await signOut(auth);
  return uid;
}
async function as(label) {
  await signOut(auth).catch(() => {});
  await signInWithEmailAndPassword(auth, `${label}@probe.invalid`, PW);
}

const OWNER = await ensureUser('inv-owner');
const STRANGER = await ensureUser('inv-stranger');
const REJECTED = await ensureUser('inv-rejected');

const CHAT = 'probe-inv-community';
const OTHER_CHAT = 'probe-inv-other';
const LIVE = 'LiveToken_ForThisComm1';      // 22 chars
const OTHER = 'LiveToken_OtherCommun1';     // 22 chars, invite for OTHER_CHAT
const REVOKED = 'RevokedToken_ThisComm1';   // 22 chars, revoked
const MISSING = 'NoSuchToken_Anywhere12';   // 22 chars, no doc
for (const t of [LIVE, OTHER, REVOKED, MISSING]) if (t.length !== 22) throw new Error(`fixture ${t} is not 22 chars`);

async function reseed() {
  const chat = (id) => ({ type: 'community', name: id, ownerId: OWNER, members: [OWNER], lastMessage: null, createdAt: new Date() });
  await adminDb.collection('chats').doc(CHAT).set(chat(CHAT));
  await adminDb.collection('chats').doc(OTHER_CHAT).set(chat(OTHER_CHAT));
  const reqs = adminDb.collection('chats').doc(CHAT).collection('joinRequests');
  await Promise.all((await reqs.get()).docs.map((d) => d.ref.delete()));
  await reqs.doc(REJECTED).set({ userId: REJECTED, displayName: 'r', requestedAt: new Date(), status: 'rejected' });
  const invite = (communityId, revoked, shortCode) => ({
    shortCode, communityId, createdBy: OWNER, createdAt: new Date(), revoked, expiresAt: null, useCount: 0,
  });
  await adminDb.collection('communityInvites').doc(LIVE).set(invite(CHAT, false, 'K7MX9P'));
  await adminDb.collection('communityInvites').doc(OTHER).set(invite(OTHER_CHAT, false, 'H3QW4Z'));
  await adminDb.collection('communityInvites').doc(REVOKED).set(invite(CHAT, true, 'R2TY8N'));
  await adminDb.collection('communityInviteCodes').doc('K7MX9P').set({ token: LIVE });
}

async function attempt(section, name, identity, expected, run) {
  await reseed();
  await as(identity);
  let allowed = true, error = '';
  try { await run(); } catch (e) { allowed = false; error = e.code ?? String(e.message ?? e); }
  rows.push({ section, name, identity, expected, allowed, error });
}

const req = (uid) => doc(db, 'chats', CHAT, 'joinRequests', uid);
const base = (uid, extra = {}) => ({ userId: uid, displayName: 'Probe', requestedAt: serverTimestamp(), status: 'pending', ...extra });

// ── Function-only collections ────────────────────────────────────────────────
await attempt('collections', 'a. owner reads an invite doc', 'inv-owner', false, () => getDoc(doc(db, 'communityInvites', LIVE)));
await attempt('collections', 'b. owner lists invites for their community', 'inv-owner', false,
  () => getDocs(query(collection(db, 'communityInvites'), where('communityId', '==', CHAT))));
await attempt('collections', 'c. owner writes an invite doc', 'inv-owner', false,
  () => setDoc(doc(db, 'communityInvites', 'ForgedToken_ByClient12'), { communityId: CHAT, createdBy: OWNER, revoked: false, shortCode: 'AAAAAA', useCount: 0, expiresAt: null, createdAt: new Date() }));
await attempt('collections', 'd. stranger reads a code lookup doc', 'inv-stranger', false, () => getDoc(doc(db, 'communityInviteCodes', 'K7MX9P')));
await attempt('collections', 'e. stranger writes a code lookup doc', 'inv-stranger', false,
  () => setDoc(doc(db, 'communityInviteCodes', 'ZZZZZZ'), { token: LIVE }));

// ── Join requests with and without invite origin ─────────────────────────────
await attempt('requests', 'f. plain request, exactly as Discover sends it', 'inv-stranger', true, () => setDoc(req(STRANGER), base(STRANGER)));
await attempt('requests', 'g. via invite, live token for this community', 'inv-stranger', true,
  () => setDoc(req(STRANGER), base(STRANGER, { via: 'invite', inviteToken: LIVE })));
await attempt('requests', "h. via invite, another community's token", 'inv-stranger', false,
  () => setDoc(req(STRANGER), base(STRANGER, { via: 'invite', inviteToken: OTHER })));
await attempt('requests', 'i. via invite, revoked token', 'inv-stranger', false,
  () => setDoc(req(STRANGER), base(STRANGER, { via: 'invite', inviteToken: REVOKED })));
await attempt('requests', 'j. via invite, token with no invite doc', 'inv-stranger', false,
  () => setDoc(req(STRANGER), base(STRANGER, { via: 'invite', inviteToken: MISSING })));
await attempt('requests', 'k. via invite without a token', 'inv-stranger', false,
  () => setDoc(req(STRANGER), base(STRANGER, { via: 'invite' })));
await attempt('requests', 'l. token without via', 'inv-stranger', false,
  () => setDoc(req(STRANGER), base(STRANGER, { inviteToken: LIVE })));
await attempt('requests', "m. via 'other' with a live token", 'inv-stranger', false,
  () => setDoc(req(STRANGER), base(STRANGER, { via: 'other', inviteToken: LIVE })));
await attempt('requests', 'n. a short code instead of the token', 'inv-stranger', false,
  () => setDoc(req(STRANGER), base(STRANGER, { via: 'invite', inviteToken: 'K7MX9P' })));
await attempt('requests', 'o. path-shaped token', 'inv-stranger', false,
  () => setDoc(req(STRANGER), base(STRANGER, { via: 'invite', inviteToken: `x/../communityInvites/${LIVE}` })));
await attempt('requests', 'p. non-string token', 'inv-stranger', false,
  () => setDoc(req(STRANGER), base(STRANGER, { via: 'invite', inviteToken: 12345 })));
await attempt('requests', 'q. rejected user re-requests via a live invite', 'inv-rejected', true,
  () => setDoc(req(REJECTED), base(REJECTED, { via: 'invite', inviteToken: LIVE })));
await attempt('requests', 'r. rejected user re-requests via a revoked invite', 'inv-rejected', false,
  () => setDoc(req(REJECTED), base(REJECTED, { via: 'invite', inviteToken: REVOKED })));

// ── Report ───────────────────────────────────────────────────────────────────
let mismatches = 0;
for (const section of [...new Set(rows.map((r) => r.section))]) {
  console.log(`\n${section.toUpperCase()}`);
  for (const r of rows.filter((x) => x.section === section)) {
    const ok = r.allowed === r.expected;
    if (!ok) mismatches++;
    console.log(`  ${ok ? '  ' : '✗ '}${r.name.padEnd(52)} ${(r.allowed ? 'ALLOW' : 'deny ').padEnd(6)} expected ${r.expected ? 'ALLOW' : 'deny'}` +
      (r.error && r.expected ? `  (${r.error})` : ''));
  }
}
console.log(`\n${rows.length} cases, ${mismatches} not as expected`);

const jsonArg = process.argv.indexOf('--json');
if (jsonArg !== -1 && process.argv[jsonArg + 1]) writeFileSync(process.argv[jsonArg + 1], JSON.stringify(rows, null, 2));

for (const t of [LIVE, OTHER, REVOKED]) await adminDb.collection('communityInvites').doc(t).delete();
await adminDb.collection('communityInviteCodes').doc('K7MX9P').delete();
const reqs = await adminDb.collection('chats').doc(CHAT).collection('joinRequests').get();
await Promise.all(reqs.docs.map((d) => d.ref.delete()));
await adminDb.collection('chats').doc(CHAT).delete();
await adminDb.collection('chats').doc(OTHER_CHAT).delete();
process.exit(mismatches === 0 ? 0 : 1);
