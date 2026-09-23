#!/usr/bin/env node
/**
 * Probe for the message-create rules in BOTH message collections.
 *
 * Runs against the Firestore EMULATOR with whatever firestore.rules currently
 * says, so it can be run before and after a rule change and the two outputs
 * diffed. Nothing here touches production.
 *
 * Covers three things at once, because they share one rule:
 *
 *  1. The hardening. `senderId` was free text and `system: true` was writable,
 *     so a member could post as another member or fake a server notice about
 *     payment. Both are denied now.
 *  2. The mentions guard. `mentions` drives a push that deliberately overrides
 *     mute, so every id in it must belong to the chat — otherwise a crafted
 *     message is an unsolicited-notification channel aimed at anyone.
 *  3. `mentionsEveryone`, which is the community OWNER's alone and never valid
 *     on a root-collection message.
 *
 * The must-be-ALLOWED half is the point of the exercise: an ordinary send, a
 * mention of a real member, and the marketplace listing-share payload all run
 * through this rule on every use. A rule that denies any of them breaks chat.
 *
 * No new dependency: the firebase client SDK talks to the emulator via
 * connectFirestoreEmulator, and firebase-admin seeds through it rules-exempt.
 *
 *   npx firebase emulators:start --only firestore,auth --project bama-af0a0
 *   node scripts/probe-mentions-rules.mjs [--json out.json]
 */

import { initializeApp as initAdmin } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import {
  getFirestore, connectFirestoreEmulator, collection, addDoc, serverTimestamp,
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
const clientApp = initializeApp({ apiKey: 'emulator-key', projectId: PROJECT }, 'probe-mentions');
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
    const cred = await createUserWithEmailAndPassword(auth, email, PW);
    ids[label] = cred.user.uid;
  } catch {
    const cred = await signInWithEmailAndPassword(auth, email, PW);
    ids[label] = cred.user.uid;
  }
  await signOut(auth);
  return ids[label];
}

async function as(label) {
  await signOut(auth).catch(() => {});
  await signInWithEmailAndPassword(auth, `${label}@probe.invalid`, PW);
}

/**
 * One attempt. `path` is the message COLLECTION, so the same runner covers
 * chats/{id}/messages and chats/{id}/channels/{cid}/messages — the two rules are
 * meant to agree on everything but @everyone, and running them through one
 * function is what makes a divergence visible.
 */
async function attempt({ group, name, identity, path, payload, expected }) {
  await as(identity);
  let allowed = true;
  let error = '';
  try {
    await addDoc(collection(db, ...path), payload());
  } catch (e) {
    allowed = false;
    error = e.code ?? String(e.message ?? e);
  }
  const ok = allowed === expected;
  rows.push({ group, name, identity, expected, allowed, ok, error });
  const mark = ok ? '  ok ' : 'FAIL';
  console.log(`${mark}  ${group} · ${name} · as ${identity} → ${allowed ? 'ALLOWED' : 'denied'} (expected ${expected ? 'ALLOWED' : 'denied'})`);
  return ok;
}

// ── Identities ───────────────────────────────────────────────────────────────
const OWNER = await ensureUser('owner');
const MEMBER = await ensureUser('member');
const THIRD = await ensureUser('third');
const OUTSIDER = await ensureUser('outsider');

console.log(`\nowner=${OWNER}\nmember=${MEMBER}\nthird=${THIRD}\noutsider=${OUTSIDER}\n`);

// ── Seed: a project group, a community with a channel, and a read-only pair ──
const GROUP = 'probe-msg-group';
const COMMUNITY = 'probe-msg-community';
const CHANNEL = 'general';
const RO_GROUP = 'probe-msg-readonly-group';
const RO_COMMUNITY = 'probe-msg-readonly-community';

await adminDb.collection('chats').doc(GROUP).set({
  type: 'group', name: 'Probe Group', members: [OWNER, MEMBER, THIRD], createdAt: new Date(),
});
await adminDb.collection('chats').doc(COMMUNITY).set({
  type: 'community', name: 'Probe Community', ownerId: OWNER,
  members: [OWNER, MEMBER, THIRD], createdAt: new Date(),
});
await adminDb.doc(`chats/${COMMUNITY}/channels/${CHANNEL}`).set({
  name: 'General', kind: 'general', createdBy: OWNER, createdAt: new Date(), lastMessage: null,
});
await adminDb.collection('chats').doc(RO_GROUP).set({
  type: 'group', name: 'Completed', members: [OWNER, MEMBER], readOnly: true, createdAt: new Date(),
});
// The gap this change closes: the channel block never checked readOnly.
await adminDb.collection('chats').doc(RO_COMMUNITY).set({
  type: 'community', name: 'Closed Community', ownerId: OWNER,
  members: [OWNER, MEMBER], readOnly: true, createdAt: new Date(),
});
await adminDb.doc(`chats/${RO_COMMUNITY}/channels/${CHANNEL}`).set({
  name: 'General', kind: 'general', createdBy: OWNER, createdAt: new Date(), lastMessage: null,
});

const root = (chatId) => ['chats', chatId, 'messages'];
const chan = (chatId) => ['chats', chatId, 'channels', CHANNEL, 'messages'];
/** The shape every client send actually writes. */
const base = (uid, extra = {}) => ({
  senderId: uid, text: 'probe', timestamp: serverTimestamp(), readBy: [uid], ...extra,
});

const CASES = [
  // ── Regressions: the hot path must still work ──────────────────────────────
  { group: 'baseline', name: 'member sends a plain message', identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER), expected: true },
  { group: 'baseline', name: 'member sends into a channel', identity: 'member',
    path: chan(COMMUNITY), payload: () => base(MEMBER), expected: true },
  { group: 'baseline', name: 'non-member is refused', identity: 'outsider',
    path: root(GROUP), payload: () => base(OUTSIDER), expected: false },
  { group: 'baseline', name: 'read-only chat refuses a member', identity: 'member',
    path: root(RO_GROUP), payload: () => base(MEMBER), expected: false },
  // Newly closed: the channel block never had a readOnly clause.
  { group: 'baseline', name: 'read-only COMMUNITY refuses a channel message', identity: 'member',
    path: chan(RO_COMMUNITY), payload: () => base(MEMBER), expected: false },
  // 9 extra fields on one message; shares must not break.
  { group: 'baseline', name: 'marketplace listing-share payload', identity: 'member',
    path: chan(COMMUNITY), payload: () => base(MEMBER, {
      type: 'listing', listingId: 'l1', listingType: 'secondhand', title: 'Tripod',
      price: 200, imageUrl: null, posterId: MEMBER, posterName: 'Member', createdAt: serverTimestamp(),
    }), expected: true },

  // ── Hardening ──────────────────────────────────────────────────────────────
  { group: 'forgery', name: 'senderId forged as another member', identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER, { senderId: OWNER }), expected: false },
  { group: 'forgery', name: 'senderId forged as "system"', identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER, { senderId: 'system' }), expected: false },
  { group: 'forgery', name: 'client sets system: true', identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER, { system: true }), expected: false },
  { group: 'forgery', name: 'client sets system: false (still denied — the KEY is denied)', identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER, { system: false }), expected: false },
  { group: 'forgery', name: 'senderId forged in a channel', identity: 'member',
    path: chan(COMMUNITY), payload: () => base(MEMBER, { senderId: OWNER }), expected: false },

  // ── mentions ───────────────────────────────────────────────────────────────
  { group: 'mentions', name: 'mentions a fellow member', identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER, { mentions: [THIRD] }), expected: true },
  { group: 'mentions', name: 'mentions two fellow members', identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER, { mentions: [THIRD, OWNER] }), expected: true },
  { group: 'mentions', name: 'empty mentions list', identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER, { mentions: [] }), expected: true },
  { group: 'mentions', name: 'mentions a NON-member', identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER, { mentions: [OUTSIDER] }), expected: false },
  { group: 'mentions', name: 'smuggles a non-member among members', identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER, { mentions: [THIRD, OUTSIDER] }), expected: false },
  { group: 'mentions', name: 'mentions is not a list (fails closed)', identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER, { mentions: OUTSIDER }), expected: false },
  { group: 'mentions', name: 'mentions a non-member in a channel', identity: 'member',
    path: chan(COMMUNITY), payload: () => base(MEMBER, { mentions: [OUTSIDER] }), expected: false },
  { group: 'mentions', name: 'mentions a fellow member in a channel', identity: 'member',
    path: chan(COMMUNITY), payload: () => base(MEMBER, { mentions: [THIRD] }), expected: true },

  // ── @everyone ──────────────────────────────────────────────────────────────
  { group: 'everyone', name: 'community OWNER sends @everyone', identity: 'owner',
    path: chan(COMMUNITY), payload: () => base(OWNER, { mentionsEveryone: true }), expected: true },
  { group: 'everyone', name: 'plain member sends @everyone', identity: 'member',
    path: chan(COMMUNITY), payload: () => base(MEMBER, { mentionsEveryone: true }), expected: false },
  { group: 'everyone', name: 'member sets it false (the KEY is owner-only)', identity: 'member',
    path: chan(COMMUNITY), payload: () => base(MEMBER, { mentionsEveryone: false }), expected: false },
  { group: 'everyone', name: '@everyone on a ROOT message, even by the owner', identity: 'owner',
    path: root(GROUP), payload: () => base(OWNER, { mentionsEveryone: true }), expected: false },
];

for (const c of CASES) await attempt(c);

// ── Report ───────────────────────────────────────────────────────────────────
const failed = rows.filter((r) => !r.ok);
console.log(`\n${rows.length - failed.length}/${rows.length} cases behaved as expected.`);
if (failed.length > 0) {
  console.log('\nMISMATCHES:');
  for (const r of failed) {
    console.log(`  ${r.group} · ${r.name} · as ${r.identity}: got ${r.allowed ? 'ALLOWED' : 'denied'}, wanted ${r.expected ? 'ALLOWED' : 'denied'} ${r.error}`);
  }
}

const jsonFlag = process.argv.indexOf('--json');
if (jsonFlag !== -1 && process.argv[jsonFlag + 1]) {
  writeFileSync(process.argv[jsonFlag + 1], JSON.stringify(rows, null, 2));
  console.log(`\nwrote ${process.argv[jsonFlag + 1]}`);
}

await signOut(auth).catch(() => {});
process.exit(failed.length === 0 ? 0 : 1);
