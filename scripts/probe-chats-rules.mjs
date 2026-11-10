#!/usr/bin/env node
/**
 * Probe for the `chats/{chatId}` update rule.
 *
 * Runs against the Firestore EMULATOR with whatever firestore.rules currently
 * says, so it can be run before and after a rule change and the two outputs
 * diffed. Nothing here touches production.
 *
 * Three identities per case — the community owner, a plain member, and a
 * non-member — and one row per field group that any code path actually writes.
 * The point of the must-be-ALLOWED half is that `lastMessage` and `unreadCount`
 * fire on EVERY message send: a rule that denies those breaks all chat.
 *
 * No new dependency: the firebase client SDK talks to the emulator via
 * connectFirestoreEmulator, and firebase-admin seeds through it rules-exempt.
 *
 *   npx firebase emulators:start --only firestore,auth --project bama-af0a0
 *   node scripts/probe-chats-rules.mjs --emulator [--json out.json]
 */

import './lib/requireEmulator.mjs'; // explicit --emulator required, no default target
import { initializeApp as initAdmin } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import {
  getFirestore, connectFirestoreEmulator, doc, updateDoc, getDoc, deleteDoc,
  arrayUnion, arrayRemove, increment, serverTimestamp, setDoc,
} from 'firebase/firestore';
import {
  getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
} from 'firebase/auth';
import { writeFileSync } from 'node:fs';

// Ports are overridable so this can run against an isolated emulator instead of
// a long-running shared one: FS_PORT=8380 AUTH_PORT=9399 node scripts/...
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
const ids = {};           // label -> uid
const rows = [];          // { chatType, case, identity, expected, allowed, error }

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

/** Reset the chat doc to a known state, rules-exempt, between every attempt. */
async function reseed(chatId, data) {
  await adminDb.collection('chats').doc(chatId).set(data);
}

async function attempt({ chatId, seed, chatType, name, identity, payload }) {
  await reseed(chatId, seed);
  await as(identity);
  let allowed = true;
  let error = '';
  try {
    await updateDoc(doc(db, 'chats', chatId), payload());
  } catch (e) {
    allowed = false;
    error = e.code ?? String(e.message ?? e);
  }
  rows.push({ chatType, name, identity, allowed, error });
  return allowed;
}

// ── Identities ───────────────────────────────────────────────────────────────
const OWNER = await ensureUser('owner');
const MEMBER = await ensureUser('member');
const OUTSIDER = await ensureUser('outsider');
const THIRD = await ensureUser('third');

console.log(`\nowner=${OWNER}\nmember=${MEMBER}\noutsider=${OUTSIDER}\nthird=${THIRD}\n`);

// ── The doc under test ───────────────────────────────────────────────────────
const COMMUNITY = 'probe-community';
const communitySeed = {
  type: 'community',
  name: 'Probe Community',
  description: 'seed description',
  ownerId: OWNER,
  members: [OWNER, MEMBER, THIRD],
  category: 'photography',
  photoURL: null,
  lastMessage: { text: 'seed', senderId: OWNER, timestamp: new Date() },
  unreadCount: { [OWNER]: 0, [MEMBER]: 0, [THIRD]: 0 },
  createdAt: new Date(),
};

// Cases mirror the real write surface; see the report for file:line of each.
const CASES = [
  ['a. update name',                 () => ({ name: 'HIJACKED' })],
  ['b. update photoURL',             () => ({ photoURL: 'https://evil.invalid/x.jpg' })],
  ['c. update ownerId (to self)',    function () { return { ownerId: this.uid }; }],
  ['d. update description',          () => ({ description: 'rewritten' })],
  ['d2. update category',            () => ({ category: 'drone' })],
  ['e. lastMessage + unreadCount',   function () { return { lastMessage: { text: 'hi', senderId: this.uid, timestamp: serverTimestamp() }, [`unreadCount.${OWNER}`]: increment(1) }; }],
  ['f. clear own unread counter',    function () { return { [`unreadCount.${this.uid}`]: 0 }; }],
  ['g. typing indicator (no such field in the codebase — probes an UNKNOWN field)',
                                     function () { return { [`typing.${this.uid}`]: true }; }],
  ['h. remove SELF from members',    function () { return { members: arrayRemove(this.uid) }; }],
  ['i. add another uid to members',  () => ({ members: arrayUnion('some-new-uid') })],
  ['j. remove a DIFFERENT uid (kick)', () => ({ members: arrayRemove(THIRD) })],
  ['k. hiddenFor (soft-delete self)', function () { return { hiddenFor: arrayUnion(this.uid) }; }],
  ['l. archived + archiveReason',    () => ({ archived: true, archiveReason: 'cancelled', archivedAt: serverTimestamp() })],
  ['m. readOnly (completion flag)',  () => ({ readOnly: true, readOnlyReason: 'completed' })],
  ['n. status (admin suspend)',      () => ({ status: 'suspended' })],
  ['o. inject a brand-new field',    () => ({ arbitraryInjected: 'anything' })],
  ['p. name RIDING ALONG with a legal lastMessage write',
                                     function () { return { lastMessage: { text: 'hi', senderId: this.uid, timestamp: serverTimestamp() }, name: 'SNUCK IN' }; }],
];

for (const [name, payloadFn] of CASES) {
  for (const [identity, uid] of [['owner', OWNER], ['member', MEMBER], ['outsider', OUTSIDER]]) {
    await attempt({
      chatId: COMMUNITY, seed: communitySeed, chatType: 'community',
      name, identity, payload: payloadFn.bind({ uid }),
    });
  }
}

// ── Do DM / group / purchase share the same rule? Spot-check the takeover. ───
const SHARED = [
  ['dm', { type: 'dm', members: [OWNER, MEMBER], lastMessage: { text: 's', senderId: OWNER, timestamp: new Date() }, unreadCount: { [OWNER]: 0, [MEMBER]: 0 }, createdAt: new Date() }],
  ['group', { type: 'group', name: 'Proj', projectId: 'p1', ownerId: OWNER, roles: { [OWNER]: 'admin' }, members: [OWNER, MEMBER], lastMessage: { text: 's', senderId: OWNER, timestamp: new Date() }, unreadCount: { [OWNER]: 0, [MEMBER]: 0 }, createdAt: new Date() }],
  ['purchase', { type: 'purchase', name: 'Item', purchaseListingId: 'l1', members: [OWNER, MEMBER], lastMessage: { text: 's', senderId: OWNER, timestamp: new Date() }, unreadCount: { [OWNER]: 0, [MEMBER]: 0 }, createdAt: new Date() }],
];
for (const [type, seed] of SHARED) {
  const id = `probe-${type}`;
  for (const [name, payloadFn] of [
    ['a. update name', () => ({ name: 'RENAMED' })],
    ['b. update photoURL (changeGroupChatPhoto path)', () => ({ photoURL: 'https://x.invalid/p.jpg' })],
    ['b2. description', () => ({ description: 'rewritten' })],
    ['b3. category', () => ({ category: 'drone' })],
    ['c. update ownerId (to self)', function () { return { ownerId: this.uid }; }],
    ['e. lastMessage + unreadCount', function () { return { lastMessage: { text: 'hi', senderId: this.uid, timestamp: serverTimestamp() }, [`unreadCount.${OWNER}`]: increment(1) }; }],
    ['f. clear own unread counter', function () { return { [`unreadCount.${this.uid}`]: 0 }; }],
    ['h. remove SELF from members', function () { return { members: arrayRemove(this.uid) }; }],
    ['j. remove a DIFFERENT uid (kick)', () => ({ members: arrayRemove(OWNER) })],
    ['k. hiddenFor (soft-delete self)', function () { return { hiddenFor: arrayUnion(this.uid) }; }],
    ['q. sellerAgreed / buyerAgreed', () => ({ sellerAgreed: true, buyerAgreed: true })],
    ['l. archived + archiveReason + archivedAt', () => ({ archived: true, archiveReason: 'cancelled', archivedAt: serverTimestamp() })],
  ]) {
    await attempt({ chatId: id, seed, chatType: type, name, identity: 'member', payload: payloadFn.bind({ uid: MEMBER }) });
  }
}

// ── Multi-category communities ───────────────────────────────────────────────
// Each row states the EXPECTED verdict, so a regression reads as MISMATCH. The legacy
// seed above (category only, no `categories`) is what every pre-change community
// looks like; the multi seed is one written since.
const MULTI = 'probe-community-multi';
const multiSeed = { ...communitySeed, category: 'Editor', categories: ['Editor', 'Video Photographer'] };
const CAT_CASES = [
  // [label, seed, payload, { owner: bool, member: bool }]
  ['1.0.x owner: rename (no category touched)',           communitySeed, () => ({ name: 'New name' }),                    { owner: true,  member: false }],
  ['1.0.x owner: photoURL',                               communitySeed, () => ({ photoURL: 'https://x.invalid/p.jpg' }), { owner: true,  member: false }],
  ['1.0.x owner: joinMode',                               communitySeed, () => ({ joinMode: 'open' }),                    { owner: true,  member: false }],
  ['1.0.x owner: category only, legacy doc',              communitySeed, () => ({ category: 'Editor' }),                  { owner: true,  member: false }],
  ['1.0.x owner: category non-string, legacy doc',        communitySeed, () => ({ category: 7 }),                         { owner: false, member: false }],
  ['new: categories + category[0]',                       communitySeed, () => ({ categories: ['Editor', 'Video Photographer'], category: 'Editor' }), { owner: true, member: false }],
  ['new: all 8 roles',                                    communitySeed, () => ({ categories: ['Video Photographer','Still Photographer','Editor','Graphic Designer','Social Media','Studio & Audio','Sound Recordist','Lighting Tech'], category: 'Video Photographer' }), { owner: true, member: false }],
  ['new: empty list',                                     communitySeed, () => ({ categories: [], category: 'Editor' }),   { owner: false, member: false }],
  ['new: unknown role string',                            communitySeed, () => ({ categories: ['Editor', 'Wizard'], category: 'Editor' }), { owner: false, member: false }],
  ['new: duplicate item',                                 communitySeed, () => ({ categories: ['Editor', 'Editor'], category: 'Editor' }), { owner: false, member: false }],
  ['new: not a list',                                     communitySeed, () => ({ categories: 'Editor', category: 'Editor' }), { owner: false, member: false }],
  ['new: category != categories[0]',                      communitySeed, () => ({ categories: ['Editor', 'Video Photographer'], category: 'Video Photographer' }), { owner: false, member: false }],
  ['new: categories without category (legacy has one)',   communitySeed, () => ({ categories: ['Editor'] }),               { owner: false, member: false }],
  ['multi doc: rename only',                              multiSeed,     () => ({ name: 'New name' }),                     { owner: true,  member: false }],
  // Same value as stored: nothing is touched, so it is a no-op the rules rightly pass.
  ['multi doc: category rewritten to its own value (no-op)', multiSeed,   () => ({ category: 'Editor' }),                   { owner: true,  member: true }],
  ['multi doc: category only, new value (drift)',         multiSeed,     () => ({ category: 'Lighting Tech' }),            { owner: false, member: false }],
  ['multi doc: both, reordered',                          multiSeed,     () => ({ categories: ['Video Photographer', 'Editor'], category: 'Video Photographer' }), { owner: true, member: false }],
  ['multi doc: lastMessage write by a member (hot path)', multiSeed,     function () { return { lastMessage: { text: 'hi', senderId: this.uid, timestamp: serverTimestamp() } }; }, { owner: true, member: true }],
];
const catRows = [];
for (const [label, seed, payloadFn, expect] of CAT_CASES) {
  for (const identity of ['owner', 'member']) {
    const uid = identity === 'owner' ? OWNER : MEMBER;
    const allowed = await attempt({ chatId: MULTI, seed, chatType: 'community-multi', name: label, identity, payload: payloadFn.bind({ uid }) });
    catRows.push({ label, identity, expected: expect[identity], allowed });
  }
}

// communityRequests create: any signed-in user. `categories` is shape-checked only when present.
const REQ_CASES = [
  ['request: categories + category[0]',          { name: 'n', categories: ['Editor', 'Still Photographer'], category: 'Editor' }, true],
  ['request: categories only',                   { name: 'n', categories: ['Editor'] }, true],
  ['request: 1.0.x, category only',              { name: 'n', category: 'Editor' }, true],
  ['request: 1.0.x, no category at all',         { name: 'n' }, true],
  ['request: empty categories',                  { name: 'n', categories: [], category: 'Editor' }, false],
  ['request: unknown role string',               { name: 'n', categories: ['Wizard'], category: 'Wizard' }, false],
  ['request: duplicate item',                    { name: 'n', categories: ['Editor', 'Editor'] }, false],
  ['request: not a list',                        { name: 'n', categories: 'Editor' }, false],
  ['request: category != categories[0]',         { name: 'n', categories: ['Editor', 'Still Photographer'], category: 'Still Photographer' }, false],
];
await as('member');
for (const [label, data, expected] of REQ_CASES) {
  let allowed = true;
  try { await setDoc(doc(db, 'communityRequests', `probe-${Math.random().toString(36).slice(2)}`), data); } catch { allowed = false; }
  catRows.push({ label, identity: 'member', expected, allowed });
}
console.log('\nMULTI-CATEGORY (expected vs actual)');
let mismatches = 0;
for (const r of catRows) {
  const ok = r.expected === r.allowed;
  if (!ok) mismatches++;
  console.log(`  ${ok ? 'ok      ' : 'MISMATCH'} ${r.label.padEnd(58)} ${r.identity.padEnd(7)} expect ${r.expected ? 'ALLOW' : 'deny '}  got ${r.allowed ? 'ALLOW' : 'deny '}`);
}
console.log(`\n${mismatches === 0 ? 'ALL AS EXPECTED' : mismatches + ' MISMATCH(ES)'} (${catRows.length} checks)`);

// ── Read receipts: chats/{chatId}/readState/{uid} ────────────────────────────
// Expected verdicts, so a regression reads as MISMATCH. The doc-ID wildcard is the
// uid, so "someone else's doc" is just a different path.
const RS_SEEDS = {
  group:     { type: 'group', name: 'Proj', projectId: 'p1', ownerId: OWNER, members: [OWNER, MEMBER, THIRD], lastMessage: null, createdAt: new Date() },
  purchase:  { type: 'purchase', name: 'Item', purchaseListingId: 'l1', members: [OWNER, MEMBER], lastMessage: null, createdAt: new Date() },
  dm:        { type: 'dm', members: [OWNER, MEMBER], lastMessage: null, createdAt: new Date() },
  community: { type: 'community', name: 'Comm', ownerId: OWNER, members: [OWNER, MEMBER, THIRD], lastMessage: null, createdAt: new Date() },
};
async function rsAttempt({ type, as: who, uid, existing = false, op }) {
  const chatId = `probe-rs-${type}`;
  await adminDb.collection('chats').doc(chatId).set(RS_SEEDS[type]);
  const ref = adminDb.collection('chats').doc(chatId).collection('readState').doc(uid);
  await ref.delete();
  if (existing) await ref.set({ lastReadAt: new Date(Date.now() - 60_000) });
  await as(who);
  try { await op(doc(db, 'chats', chatId, 'readState', uid)); return true; } catch { return false; }
}
const WRITE = (data) => (d) => setDoc(d, data);
const RS_CASES = [
  // [label, params, expected]
  ['first-ever CREATE by a member, own doc, group',        { type: 'group', as: 'member', uid: MEMBER, op: WRITE({ lastReadAt: serverTimestamp() }) }, true],
  ['first-ever CREATE by the owner, own doc, group',       { type: 'group', as: 'owner', uid: OWNER, op: WRITE({ lastReadAt: serverTimestamp() }) }, true],
  ['UPDATE by a member, own doc, group',                   { type: 'group', as: 'member', uid: MEMBER, existing: true, op: WRITE({ lastReadAt: serverTimestamp() }) }, true],
  ['first-ever CREATE by a member, purchase chat',         { type: 'purchase', as: 'member', uid: MEMBER, op: WRITE({ lastReadAt: serverTimestamp() }) }, true],
  ['CREATE in a DM',                                       { type: 'dm', as: 'member', uid: MEMBER, op: WRITE({ lastReadAt: serverTimestamp() }) }, false],
  ['CREATE in a community',                                { type: 'community', as: 'member', uid: MEMBER, op: WRITE({ lastReadAt: serverTimestamp() }) }, false],
  ['CREATE by a NON-member, group',                        { type: 'group', as: 'outsider', uid: OUTSIDER, op: WRITE({ lastReadAt: serverTimestamp() }) }, false],
  ['CREATE by a NON-member, purchase',                     { type: 'purchase', as: 'outsider', uid: OUTSIDER, op: WRITE({ lastReadAt: serverTimestamp() }) }, false],
  ["CREATE into SOMEONE ELSE'S doc",                       { type: 'group', as: 'member', uid: THIRD, op: WRITE({ lastReadAt: serverTimestamp() }) }, false],
  ["UPDATE of SOMEONE ELSE'S doc",                         { type: 'group', as: 'member', uid: THIRD, existing: true, op: WRITE({ lastReadAt: serverTimestamp() }) }, false],
  ['CREATE with an extra field',                           { type: 'group', as: 'member', uid: MEMBER, op: WRITE({ lastReadAt: serverTimestamp(), note: 'x' }) }, false],
  ['UPDATE with an extra field',                           { type: 'group', as: 'member', uid: MEMBER, existing: true, op: WRITE({ lastReadAt: serverTimestamp(), note: 'x' }) }, false],
  ['CREATE with no lastReadAt',                            { type: 'group', as: 'member', uid: MEMBER, op: WRITE({}) }, false],
  ['CREATE backdated (client clock)',                      { type: 'group', as: 'member', uid: MEMBER, op: WRITE({ lastReadAt: new Date(Date.now() - 3_600_000) }) }, false],
  ['CREATE future-dated (client clock)',                   { type: 'group', as: 'member', uid: MEMBER, op: WRITE({ lastReadAt: new Date(Date.now() + 3_600_000) }) }, false],
  ['UPDATE to a non-timestamp',                            { type: 'group', as: 'member', uid: MEMBER, existing: true, op: WRITE({ lastReadAt: 'now' }) }, false],
  ['DELETE own doc',                                       { type: 'group', as: 'member', uid: MEMBER, existing: true, op: (d) => deleteDoc(d) }, false],
  ['READ by a member (own)',                               { type: 'group', as: 'member', uid: MEMBER, existing: true, op: (d) => getDoc(d) }, true],
  ["READ by a member (someone else's)",                    { type: 'group', as: 'member', uid: THIRD, existing: true, op: (d) => getDoc(d) }, true],
  ['READ by a NON-member',                                 { type: 'group', as: 'outsider', uid: MEMBER, existing: true, op: (d) => getDoc(d) }, false],
];
const rsRows = [];
for (const [label, params, expected] of RS_CASES) {
  rsRows.push({ label, expected, allowed: await rsAttempt(params) });
}
console.log('\nREAD RECEIPTS readState (expected vs actual)');
let rsMismatch = 0;
for (const r of rsRows) {
  const ok = r.expected === r.allowed;
  if (!ok) rsMismatch++;
  console.log(`  ${ok ? 'ok      ' : 'MISMATCH'} ${r.label.padEnd(54)} expect ${r.expected ? 'ALLOW' : 'deny '}  got ${r.allowed ? 'ALLOW' : 'deny '}`);
}
console.log(`\n${rsMismatch === 0 ? 'ALL AS EXPECTED' : rsMismatch + ' MISMATCH(ES)'} (${rsRows.length} checks)`);

// ── Report ───────────────────────────────────────────────────────────────────
function table(filter, title) {
  console.log(`\n${title}`);
  console.log('  ' + 'case'.padEnd(62) + 'owner    member   outsider');
  const names = [...new Set(rows.filter(filter).map((r) => r.name))];
  for (const n of names) {
    const cell = (idn) => {
      const r = rows.find((x) => filter(x) && x.name === n && x.identity === idn);
      return r ? (r.allowed ? 'ALLOW' : 'deny ') : '  -  ';
    };
    console.log('  ' + n.slice(0, 61).padEnd(62) + cell('owner').padEnd(9) + cell('member').padEnd(9) + cell('outsider'));
  }
}
table((r) => r.chatType === 'community', 'COMMUNITY (chats/{chatId}, type=community)');

console.log('\nOTHER CHAT TYPES — acting as a plain MEMBER');
console.log('  ' + 'case'.padEnd(62) + 'dm       group    purchase');
for (const n of [...new Set(rows.filter((r) => ['dm', 'group', 'purchase'].includes(r.chatType)).map((r) => r.name))]) {
  const cell = (t) => {
    const r = rows.find((x) => x.chatType === t && x.name === n);
    return r ? (r.allowed ? 'ALLOW' : 'deny ') : '  -  ';
  };
  console.log('  ' + n.slice(0, 61).padEnd(62) + cell('dm').padEnd(9) + cell('group').padEnd(9) + cell('purchase'));
}

const jsonArg = process.argv.indexOf('--json');
if (jsonArg !== -1 && process.argv[jsonArg + 1]) {
  writeFileSync(process.argv[jsonArg + 1], JSON.stringify(rows, null, 2));
  console.log(`\nwrote ${process.argv[jsonArg + 1]}`);
}

// Teardown — emulator data is ephemeral, but assert anyway.
for (const id of [COMMUNITY, 'probe-dm', 'probe-group', 'probe-purchase']) {
  await adminDb.collection('chats').doc(id).delete();
}
console.log('\ndone\n');
process.exit(0);
