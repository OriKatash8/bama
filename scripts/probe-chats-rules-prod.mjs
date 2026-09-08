#!/usr/bin/env node
/**
 * PRODUCTION verification of the deployed chats/{chatId} update rule.
 *
 * The emulator proved the rule logic. This proves the DEPLOYED rule against the
 * real project, using throwaway auth accounts and a throwaway chat — because the
 * failure mode that matters (sendMessage denied => nobody can send a message)
 * would not be visible until a user hit it.
 *
 * Real client SDK, real auth, real rules. Teardown is asserted: auth accounts are
 * deleted first (so a leaked account cannot outlive the run), then the docs, then
 * everything is re-read to confirm it is gone.
 *
 *   node scripts/probe-chats-rules-prod.mjs
 */
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';

// Minimal .env reader — dotenv is not a dependency of this repo and this probe
// must not add one.
for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '');
}
import {
  getFirestore, doc, updateDoc,
  arrayUnion, arrayRemove, increment, serverTimestamp,
} from 'firebase/firestore';
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, deleteUser,
} from 'firebase/auth';

const cfg = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};
if (!cfg.apiKey || !cfg.projectId) { console.error('missing EXPO_PUBLIC_FIREBASE_* in .env'); process.exit(1); }
console.log(`\nproject: ${cfg.projectId}  (LIVE)\n`);

const app = initializeApp(cfg, 'chats-prod-probe');
const db = getFirestore(app);
const auth = getAuth(app);

const STAMP = `probe${Date.now()}`;
const PW = 'Probe-Password-123!';
const CHAT = `${STAMP}-chat`;
let failures = 0;
const accounts = {};

function check(label, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function mkUser(tag) {
  const email = `${STAMP}.${tag}@probe.invalid`;
  const cred = await createUserWithEmailAndPassword(auth, email, PW);
  accounts[tag] = { uid: cred.user.uid, email };
  await signOut(auth);
  return cred.user.uid;
}
async function as(tag) {
  await signOut(auth).catch(() => {});
  await signInWithEmailAndPassword(auth, accounts[tag].email, PW);
}

const OWNER = await mkUser('owner');
const MEMBER = await mkUser('member');
console.log(`owner=${OWNER}\nmember=${MEMBER}\n`);

const seed = () => ({
  type: 'community',
  name: 'Probe Community',
  description: 'throwaway',
  ownerId: OWNER,
  members: [OWNER, MEMBER],
  category: 'photography',
  lastMessage: { text: 'seed', senderId: OWNER, timestamp: serverTimestamp() },
  unreadCount: { [OWNER]: 0, [MEMBER]: 0 },
  createdAt: serverTimestamp(),
});

// Reseeding goes through the ADMIN SDK, not the client.
//
// The first version of this probe reseeded with client setDoc() as the owner and
// died on the second call — correctly: setDoc over an EXISTING doc is an update,
// and a full-document overwrite touches type/createdAt/ownerId, which the new
// rule denies. That is the rule working, not failing. Seeding is test setup and
// has to bypass rules, exactly as the emulator probe does.
const { initializeApp: initAdminApp } = await import('firebase-admin/app');
const { getFirestore: getAdminDb } = await import('firebase-admin/firestore');
const { getAuth: getAdminAuth } = await import('firebase-admin/auth');
const adminApp = initAdminApp({ projectId: cfg.projectId }, `probe-${STAMP}`);
const adminDb = getAdminDb(adminApp);

async function reseed(type) {
  const d = seed();
  d.type = type;
  d.lastMessage = { text: 'seed', senderId: OWNER, timestamp: new Date() };
  d.createdAt = new Date();
  await adminDb.collection('chats').doc(CHAT).set(d);
}

async function attempt(label, tag, payload, expectAllow) {
  await as(tag);
  let allowed = true, code = '';
  try { await updateDoc(doc(db, 'chats', CHAT), payload()); }
  catch (e) { allowed = false; code = e.code ?? String(e); }
  check(`${label.padEnd(52)} as ${tag}`, allowed === expectAllow,
        `${allowed ? 'ALLOW' : 'deny'} (wanted ${expectAllow ? 'ALLOW' : 'deny'})${allowed ? '' : ` ${code}`}`);
  return allowed;
}

try {
  await reseed('group');

  console.log('MUST STILL WORK — these fire in the live app:');
  await attempt('sendMessage shape: lastMessage + unreadCount', 'member',
    () => ({ lastMessage: { text: 'hi', senderId: MEMBER, timestamp: serverTimestamp() }, [`unreadCount.${OWNER}`]: increment(1) }), true);
  await attempt('clear own unread on chat open', 'member',
    () => ({ [`unreadCount.${MEMBER}`]: 0 }), true);
  await attempt('hideChatForUser (hiddenFor)', 'member',
    () => ({ hiddenFor: arrayUnion(MEMBER) }), true);
  await attempt('purchase handshake (sellerAgreed/buyerAgreed)', 'member',
    () => ({ sellerAgreed: true, buyerAgreed: true }), true);
  await attempt('marketplace archive', 'member',
    () => ({ archived: true, archiveReason: 'cancelled', archivedAt: serverTimestamp() }), true);
  await attempt('group photo change (changeGroupChatPhoto)', 'member',
    () => ({ photoURL: 'https://example.invalid/p.jpg' }), true);
  await reseed('group');
  await attempt('leave: remove SELF from members', 'member',
    () => ({ members: arrayRemove(MEMBER) }), true);

  console.log('\nMUST NOW BE BLOCKED:');
  await reseed('community');
  await attempt('rename a community', 'member', () => ({ name: 'HIJACKED' }), false);
  await attempt('replace community photo', 'member', () => ({ photoURL: 'https://evil.invalid/x.jpg' }), false);
  await attempt('TAKEOVER: reassign ownerId to self', 'member', () => ({ ownerId: MEMBER }), false);
  await attempt('kick another member', 'member', () => ({ members: arrayRemove(OWNER) }), false);
  await attempt('forge readOnly/completed', 'member', () => ({ readOnly: true, readOnlyReason: 'completed' }), false);
  await attempt('forge readOnly/completed', 'owner', () => ({ readOnly: true, readOnlyReason: 'completed' }), false);
  await attempt('inject an arbitrary new field', 'member', () => ({ injected: 'x' }), false);
  await attempt('rename riding along with a legal lastMessage', 'member',
    () => ({ lastMessage: { text: 'hi', senderId: MEMBER, timestamp: serverTimestamp() }, name: 'SNUCK' }), false);

  console.log('\nOWNER STILL IN CONTROL:');
  await attempt('owner renames the community', 'owner', () => ({ name: 'Renamed By Owner' }), true);
  await attempt('owner approves a join (arrayUnion)', 'owner', () => ({ members: arrayUnion('some-approved-uid') }), true);

} catch (e) {
  console.error('\nprobe threw:', e);
  failures++;
} finally {
  console.log('\nTeardown:');
  // Accounts first: a leaked auth account is worse than a leaked doc.
  for (const tag of ['owner', 'member']) {
    try { await as(tag); await deleteUser(auth.currentUser); }
    catch (e) { console.error('  account delete failed', tag, e.code ?? e); failures++; }
  }
  // Client delete is forbidden by rules, so the doc goes through the Admin SDK.
  await adminDb.collection('chats').doc(CHAT).delete();
  const still = await adminDb.collection('chats').doc(CHAT).get();
  check('probe chat doc removed', !still.exists);
  let leaked = 0;
  for (const tag of ['owner', 'member']) {
    try { await getAdminAuth(adminApp).getUser(accounts[tag].uid); leaked++; console.error('  LEAKED account:', accounts[tag].email); }
    catch { /* gone, as intended */ }
  }
  check('probe auth accounts removed', leaked === 0, `${leaked} leaked`);
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED — deployed rule behaves as designed' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
