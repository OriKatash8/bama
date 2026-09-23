#!/usr/bin/env node
/**
 * Probe for the `replyTo` clause on message create, in BOTH message collections.
 *
 * Runs against the Firestore EMULATOR with whatever firestore.rules currently
 * says, so it can be run before and after the rule change and the two outputs
 * diffed. Nothing here touches production.
 *
 * What it is guarding. `replyTo` is a DENORMALIZED quote — the referenced
 * message is never read back, so everything the reader sees comes from this
 * object. Unvalidated it is a free-form map on every message in the app: extra
 * keys of any size, a `kind` the renderer has no branch for, a snippet long
 * enough to be a payload in its own right, or a half-filled object that renders
 * as a blank strip inside someone's bubble.
 *
 * What it deliberately does NOT check is existence — see replyToOk in
 * firestore.rules for the three reasons. So there is no probe case for "quotes
 * a message that was never written": that is ALLOWED on purpose, and the case
 * below named `dangling messageId` pins it as intended behaviour rather than an
 * oversight.
 *
 * The must-be-ALLOWED half is the point of the exercise: every ordinary send in
 * the app runs through this same rule, so a clause that denies a plain message
 * breaks chat entirely.
 *
 *   npx firebase emulators:start --only firestore,auth --project bama-af0a0
 *   node scripts/probe-reply-rules.mjs [--json out.json]
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
const clientApp = initializeApp({ apiKey: 'emulator-key', projectId: PROJECT }, 'probe-reply');
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

/** One attempt. `path` is the message COLLECTION, so the same runner covers both. */
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

console.log(`\nowner=${OWNER}\nmember=${MEMBER}\nthird=${THIRD}\n`);

// ── Seed: a project group and a community with a channel ─────────────────────
const GROUP = 'probe-reply-group';
const COMMUNITY = 'probe-reply-community';
const CHANNEL = 'general';

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

// A real message to quote, written rules-exempt so the probe does not depend on
// its own earlier cases having passed.
const QUOTED = 'probe-reply-quoted-message';
await adminDb.doc(`chats/${GROUP}/messages/${QUOTED}`).set({
  senderId: THIRD, text: 'the original', timestamp: new Date(), readBy: [THIRD],
});

const root = (chatId) => ['chats', chatId, 'messages'];
const chan = (chatId) => ['chats', chatId, 'channels', CHANNEL, 'messages'];
const base = (uid, extra = {}) => ({
  senderId: uid, text: 'probe', timestamp: serverTimestamp(), readBy: [uid], ...extra,
});
/** The shape the client actually writes. */
const reply = (over = {}) => ({
  messageId: QUOTED, senderId: THIRD, kind: 'text', snippet: 'the original', ...over,
});

const CASES = [
  // ── Regressions: every ordinary send runs through this rule ────────────────
  { group: 'baseline', name: 'plain message, no replyTo at all', identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER), expected: true },
  { group: 'baseline', name: 'plain channel message, no replyTo', identity: 'member',
    path: chan(COMMUNITY), payload: () => base(MEMBER), expected: true },
  { group: 'baseline', name: 'replyTo alongside mentions', identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER, { mentions: [THIRD], replyTo: reply() }), expected: true },

  // ── The happy path, in both collections and for all four kinds ─────────────
  { group: 'valid', name: 'quotes a text message', identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER, { replyTo: reply() }), expected: true },
  { group: 'valid', name: 'quotes in a channel', identity: 'member',
    path: chan(COMMUNITY), payload: () => base(MEMBER, { replyTo: reply() }), expected: true },
  { group: 'valid', name: "kind 'image' with an empty snippet (no caption)", identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER, { replyTo: reply({ kind: 'image', snippet: '' }) }), expected: true },
  { group: 'valid', name: "kind 'video'", identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER, { replyTo: reply({ kind: 'video' }) }), expected: true },
  { group: 'valid', name: "kind 'audio', which always has an empty snippet", identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER, { replyTo: reply({ kind: 'audio', snippet: '' }) }), expected: true },
  { group: 'valid', name: 'quotes YOURSELF', identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER, { replyTo: reply({ senderId: MEMBER }) }), expected: true },
  { group: 'valid', name: 'snippet of exactly 100 characters', identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER, { replyTo: reply({ snippet: 'x'.repeat(100) }) }), expected: true },
  // 100 Hebrew characters. size() on a rules string counts UTF-8 BYTES, not
  // characters, so a cap that passes in Latin can reject a legitimate Hebrew
  // quote at a third of the length. This case is the one that would catch it.
  { group: 'valid', name: '100 HEBREW characters — size() counts bytes, not characters', identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER, { replyTo: reply({ snippet: 'א'.repeat(100) }) }), expected: true },

  // ── Deliberately allowed: existence is not checked. See replyToOk. ─────────
  { group: 'by-design', name: 'dangling messageId (NOT checked, on purpose)', identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER, { replyTo: reply({ messageId: 'no-such-message' }) }), expected: true },
  { group: 'by-design', name: 'quotes someone who has left the chat', identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER, { replyTo: reply({ senderId: 'departed-member' }) }), expected: true },

  // ── Shape ──────────────────────────────────────────────────────────────────
  { group: 'shape', name: 'extra key smuggled into the map', identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER, { replyTo: reply({ payload: 'x'.repeat(500) }) }), expected: false },
  { group: 'shape', name: 'missing senderId (would render a blank quote)', identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER, { replyTo: { messageId: QUOTED, kind: 'text', snippet: 'hi' } }), expected: false },
  { group: 'shape', name: 'missing snippet', identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER, { replyTo: { messageId: QUOTED, senderId: THIRD, kind: 'text' } }), expected: false },
  { group: 'shape', name: 'empty map', identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER, { replyTo: {} }), expected: false },
  { group: 'shape', name: 'replyTo is a string, not a map (fails closed)', identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER, { replyTo: QUOTED }), expected: false },
  { group: 'shape', name: 'replyTo is a list', identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER, { replyTo: [QUOTED] }), expected: false },
  { group: 'shape', name: 'extra key in a CHANNEL message too', identity: 'member',
    path: chan(COMMUNITY), payload: () => base(MEMBER, { replyTo: reply({ evil: true }) }), expected: false },

  // ── Types and values ───────────────────────────────────────────────────────
  { group: 'values', name: "kind the renderer has no branch for ('system')", identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER, { replyTo: reply({ kind: 'system' }) }), expected: false },
  { group: 'values', name: "kind 'listing' — the card is not repliable", identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER, { replyTo: reply({ kind: 'listing' }) }), expected: false },
  { group: 'values', name: 'kind is a number', identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER, { replyTo: reply({ kind: 1 }) }), expected: false },
  { group: 'values', name: 'empty messageId', identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER, { replyTo: reply({ messageId: '' }) }), expected: false },
  { group: 'values', name: 'empty senderId', identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER, { replyTo: reply({ senderId: '' }) }), expected: false },
  { group: 'values', name: 'messageId is a number', identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER, { replyTo: reply({ messageId: 42 }) }), expected: false },
  { group: 'values', name: 'snippet is a map', identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER, { replyTo: reply({ snippet: { a: 1 } }) }), expected: false },
  // A MAP is the type that gets past a size check when a number does not:
  // `{a:1}.size()` is the key count, 1, which sails under every cap here, while
  // `42.size()` errors and denies on its own. So these three cases are the only
  // thing standing behind the `is string` clauses — without them, deleting those
  // clauses changes no result and they look like decoration.
  { group: 'values', name: 'messageId is a map (slips every size cap)', identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER, { replyTo: reply({ messageId: { a: 1 } }) }), expected: false },
  { group: 'values', name: 'senderId is a map', identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER, { replyTo: reply({ senderId: { a: 1 } }) }), expected: false },
  { group: 'values', name: 'messageId is a list', identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER, { replyTo: reply({ messageId: ['a'] }) }), expected: false },

  // ── Size ───────────────────────────────────────────────────────────────────
  { group: 'size', name: 'snippet of 101 characters', identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER, { replyTo: reply({ snippet: 'x'.repeat(101) }) }), expected: false },
  { group: 'size', name: 'snippet of 5000 characters', identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER, { replyTo: reply({ snippet: 'x'.repeat(5000) }) }), expected: false },
  { group: 'size', name: 'messageId of 65 characters', identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER, { replyTo: reply({ messageId: 'x'.repeat(65) }) }), expected: false },
  { group: 'size', name: 'senderId of 129 characters', identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER, { replyTo: reply({ senderId: 'x'.repeat(129) }) }), expected: false },

  // ── The other clauses still bite with replyTo present ──────────────────────
  { group: 'combined', name: 'forged senderId with a valid replyTo', identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER, { senderId: OWNER, replyTo: reply() }), expected: false },
  { group: 'combined', name: 'system: true with a valid replyTo', identity: 'member',
    path: root(GROUP), payload: () => base(MEMBER, { system: true, replyTo: reply() }), expected: false },
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
