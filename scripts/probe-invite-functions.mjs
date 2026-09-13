#!/usr/bin/env node
/**
 * End-to-end probe of the community invite functions on the EMULATORS.
 * Calls the real compiled functions: callables through the client SDK, the public
 * resolver over HTTP, and the two Firestore triggers by writing/deleting docs.
 *
 * What this CANNOT verify (check on the deployed endpoint instead): which
 * X-Forwarded-For entry Cloud Run appends, real CORS preflight, cross-instance
 * limiting, maxInstances behaviour, cold starts, the public invoker binding, and
 * the TTL policy. See the invite spec's "Unverified" list.
 *
 *   npm --prefix functions run build
 *   npx firebase emulators:start --only functions,firestore,auth --project bama-af0a0
 *   node scripts/probe-invite-functions.mjs
 */
import { initializeApp as initAdmin } from 'firebase-admin/app';
import { getFirestore as adminFs, Timestamp } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { initializeApp } from 'firebase/app';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { getFirestore, connectFirestoreEmulator, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { createHash } from 'node:crypto';

const PROJECT = 'bama-af0a0';
const REGION = 'europe-west1';
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
const FN_BASE = `http://127.0.0.1:5001/${PROJECT}/${REGION}`;

const admin = initAdmin({ projectId: PROJECT });
const adb = adminFs(admin);
const aauth = adminAuth(admin);
const app = initializeApp({ apiKey: 'emulator-key', projectId: PROJECT }, 'probe');
const fns = getFunctions(app, REGION);
connectFunctionsEmulator(fns, '127.0.0.1', 5001);
const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8080);
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });

const PW = 'probe-password-123';
const uids = {};
async function user(label, claims) {
  const email = `fn-${label}@probe.invalid`;
  let u;
  try { u = await aauth.getUserByEmail(email); } catch { u = await aauth.createUser({ email, password: PW }); }
  await aauth.setCustomUserClaims(u.uid, claims ?? null);
  uids[label] = u.uid;
}
async function as(label) {
  await signOut(auth).catch(() => {});
  await signInWithEmailAndPassword(auth, `fn-${label}@probe.invalid`, PW);
  await auth.currentUser.getIdToken(true);
}
const call = (name, data) => httpsCallable(fns, name)(data).then((r) => r.data);

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}
async function expectError(name, fn, code) {
  try { await fn(); check(name, false, 'no error thrown'); }
  catch (e) { check(name, e.code === `functions/${code}`, `got ${e.code}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(pred, ms = 15000) {
  const until = Date.now() + ms;
  while (Date.now() < until) { if (await pred()) return true; await sleep(300); }
  return false;
}

await user('owner'); await user('member'); await user('stranger'); await user('admin', { role: 'admin' });
await user('pending'); await user('open-member');
const C = 'fn-probe-community';
const OPEN = 'fn-probe-open-community';
const seedCommunity = (id, extra = {}) => adb.collection('chats').doc(id).set({
  type: 'community', name: 'Probe Guild', description: 'lights and stands', photoURL: 'https://example.invalid/a.jpg',
  ownerId: uids.owner, members: [uids.owner, uids.member, uids['open-member']], lastMessage: null, createdAt: new Date(), ...extra,
});
await seedCommunity(C);
await seedCommunity(OPEN, { allowMemberInvites: true });
await adb.collection('config').doc('appLinks').set({ baseUrl: 'https://bama-af0a0.web.app', iosUrl: '', androidUrl: '' });
await adb.collection('chats').doc(C).collection('joinRequests').doc(uids.pending)
  .set({ userId: uids.pending, displayName: 'p', requestedAt: new Date(), status: 'pending' });

// ── create / reuse / permissions ─────────────────────────────────────────────
console.log('\nCREATE');
await as('owner');
const first = await call('createCommunityInvite', { communityId: C });
check('owner creates: 22-char token, 6-char code, url from config',
  /^[A-Za-z0-9_-]{22}$/.test(first.token) && /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/.test(first.shortCode)
  && first.url === `https://bama-af0a0.web.app/c/${first.token}`, JSON.stringify(first));
const again = await call('createCommunityInvite', { communityId: C });
check('second tap reuses the same invite', again.token === first.token && again.shortCode === first.shortCode);
const stored = (await adb.collection('communityInvites').doc(first.token).get()).data();
check('invite doc has the spec fields', stored && stored.communityId === C && stored.createdBy === uids.owner
  && stored.revoked === false && stored.expiresAt === null && stored.useCount === 0 && stored.shortCode === first.shortCode
  && stored.createdAt instanceof Timestamp);
const codeDoc = (await adb.collection('communityInviteCodes').doc(first.shortCode).get()).data();
check('code lookup doc points at the token', codeDoc?.token === first.token);

await as('member');
await expectError('plain member (no allowMemberInvites) is refused', () => call('createCommunityInvite', { communityId: C }), 'permission-denied');
await as('stranger');
await expectError('non-member is refused', () => call('createCommunityInvite', { communityId: C }), 'permission-denied');
await as('open-member');
const memberInvite = await call('createCommunityInvite', { communityId: OPEN });
check('member of a community with allowMemberInvites === true may invite', !!memberInvite.token);
await as('admin');
const adminInvite = await call('createCommunityInvite', { communityId: C });
check('app admin (not a member) may invite, gets their own invite', !!adminInvite.token && adminInvite.token !== first.token);

await as('stranger');
await expectError('a community that does not exist is refused, not revealed', () => call('createCommunityInvite', { communityId: `${C}-nope` }), 'permission-denied');
// Config checks: revoke open-member's invite first so the call can't just reuse it.
await adb.collection('config').doc('appLinks').set({ baseUrl: 'http://insecure.example' });
await as('open-member');
await adb.collection('communityInvites').doc(memberInvite.token).update({ revoked: true });
await expectError('non-https baseUrl -> failed-precondition (checked before minting)', () => call('createCommunityInvite', { communityId: OPEN }), 'failed-precondition');
await adb.collection('config').doc('appLinks').delete();
await expectError('missing baseUrl -> failed-precondition', () => call('createCommunityInvite', { communityId: OPEN }), 'failed-precondition');
await adb.collection('config').doc('appLinks').set({ baseUrl: 'https://bama-af0a0.web.app', iosUrl: '', androidUrl: '' });

// ── getCommunityInvite ───────────────────────────────────────────────────────
console.log('\nGET (signed in)');
await as('stranger');
const byToken = await call('getCommunityInvite', { tokenOrCode: first.token });
check('stranger by token: live preview, membership none',
  byToken.exists === true && byToken.revoked === false && byToken.communityId === C && byToken.token === first.token
  && byToken.communityName === 'Probe Guild' && byToken.membership === 'none' && !('members' in byToken), JSON.stringify(byToken));
const byCode = await call('getCommunityInvite', { tokenOrCode: first.shortCode.toLowerCase() });
check('by code (case-insensitive) resolves to the same token', byCode.token === first.token);
await as('member');
check('member sees membership member', (await call('getCommunityInvite', { tokenOrCode: first.token })).membership === 'member');
await as('pending');
check('pending requester sees membership pending', (await call('getCommunityInvite', { tokenOrCode: first.token })).membership === 'pending');
await as('stranger');
const unknown = await call('getCommunityInvite', { tokenOrCode: 'NoSuchToken_Anywhere12' });
check('unknown token -> { exists: false }', JSON.stringify(unknown) === '{"exists":false}', JSON.stringify(unknown));

// ── revoke ───────────────────────────────────────────────────────────────────
console.log('\nREVOKE');
await as('member');
await expectError("member revoking the owner's invite is refused", () => call('revokeCommunityInvite', { token: first.token }), 'permission-denied');
await as('open-member');
const own = await adb.collection('communityInvites').doc(memberInvite.token).update({ revoked: false }).then(() =>
  call('revokeCommunityInvite', { token: memberInvite.token }));
check('member revokes their own invite', own.revoked === true);
await as('owner');
check("owner revokes the admin's invite", (await call('revokeCommunityInvite', { token: adminInvite.token })).revoked === true);
check('revoke is idempotent', (await call('revokeCommunityInvite', { token: adminInvite.token })).revoked === true);
await as('stranger');
const revokedView = await call('getCommunityInvite', { tokenOrCode: adminInvite.token });
check('revoked via get: { exists: true, revoked: true } and NOTHING else', JSON.stringify(revokedView) === '{"exists":true,"revoked":true}', JSON.stringify(revokedView));
await as('owner');
const fresh = await call('createCommunityInvite', { communityId: C });
check('owner still reuses their own live invite (admin revocation did not touch it)', fresh.token === first.token);

// ── public resolver ──────────────────────────────────────────────────────────
console.log('\nRESOLVE (public, over HTTP)');
let ipSeq = 10;
const nextIp = () => `203.0.113.${ipSeq++}`;
const get = (qs, ip = nextIp(), method = 'GET') =>
  fetch(`${FN_BASE}/resolveCommunityInvite?${qs}`, { method, headers: { 'x-forwarded-for': ip } });
const hitRes = await get(`token=${first.token}`);
const hit = await hitRes.json();
check('hit: exactly exists/revoked/communityName/description/avatarUrl',
  JSON.stringify(Object.keys(hit).sort()) === JSON.stringify(['avatarUrl', 'communityName', 'description', 'exists', 'revoked'])
  && hit.communityName === 'Probe Guild', JSON.stringify(hit));
check('hit: Cache-Control no-store', hitRes.headers.get('cache-control') === 'no-store');
const byCodeHit = await (await get(`code=${first.shortCode}`)).json();
check('hit by code is the same body', JSON.stringify(byCodeHit) === JSON.stringify(hit));
const misses = await Promise.all([
  get(`token=${adminInvite.token}`), // revoked
  get('token=NoSuchToken_Anywhere12'), // unknown
  get('code=ZZZZZZ'), // unknown code
  get('token=../../etc'), // malformed
  get(''), // nothing
].map(async (p) => { const r = await p; return `${r.status} ${await r.text()}`; }));
check('revoked, unknown token, unknown code, malformed, empty: byte-identical', new Set(misses).size === 1 && misses[0] === '200 {"exists":false}', JSON.stringify(misses));
check('non-GET -> 405', (await get(`token=${first.token}`, nextIp(), 'POST')).status === 405);

// Firestore window is authoritative: a key whose window doc is already full is
// refused on its FIRST request, with the in-memory pass still empty for it.
const fullIp = nextIp();
const windowId = `${createHash('sha256').update(`ip:${fullIp}`).digest('hex').slice(0, 32)}_${Math.floor(Date.now() / 60000)}`;
await adb.collection('rateLimits').doc(windowId).set({ count: 30, expireAt: Timestamp.fromMillis(Date.now() + 120000) });
const fullRes = await get(`token=${first.token}`, fullIp);
check('Firestore window full -> 429 on the first request (authoritative, not in-memory)',
  fullRes.status === 429 && (await fullRes.json()).rateLimited === true && Number(fullRes.headers.get('retry-after')) >= 1);

const burstIp = nextIp();
const statuses = [];
for (let i = 0; i < 31; i++) statuses.push((await get(`token=${first.token}`, burstIp)).status);
check('burst from one key: 30 x 200 then 429', statuses.slice(0, 30).every((s) => s === 200) && statuses[30] === 429, statuses.join(','));
check('a different key is not limited', (await get(`token=${first.token}`, nextIp())).status === 200);
check('a spoofed left-side X-Forwarded-For does not escape the limit',
  (await get(`token=${first.token}`, `9.9.9.9, ${burstIp}`)).status === 429);
const windowDocs = await adb.collection('rateLimits').get();
check('rateLimits docs carry expireAt and no raw IP in the id',
  windowDocs.docs.length > 0 && windowDocs.docs.every((d) => d.get('expireAt') instanceof Timestamp && !d.id.includes('203.0.113')));

// ── triggers ─────────────────────────────────────────────────────────────────
console.log('\nTRIGGERS');
await as('stranger');
await setDoc(doc(db, 'chats', C, 'joinRequests', uids.stranger), {
  userId: uids.stranger, displayName: 'Stranger', requestedAt: serverTimestamp(), status: 'pending', via: 'invite', inviteToken: first.token,
});
const counted = await waitFor(async () => (await adb.collection('communityInvites').doc(first.token).get()).get('useCount') === 1);
check('invite-originated request -> useCount 1', counted);
await adb.collection('chats').doc(C).collection('joinRequests').doc(uids.stranger).update({ displayName: 'Renamed' });
await sleep(3000);
check('an unrelated update to the same pending request does not count twice',
  (await adb.collection('communityInvites').doc(first.token).get()).get('useCount') === 1);

await adb.collection('chats').doc(C).delete();
const cleaned = await waitFor(async () => {
  const inv = await adb.collection('communityInvites').where('communityId', '==', C).get();
  const code = await adb.collection('communityInviteCodes').doc(first.shortCode).get();
  return inv.empty && !code.exists;
});
check('community delete removes its invites AND their code docs', cleaned);
check("another community's invite is untouched", (await adb.collection('communityInvites').doc(memberInvite.token).get()).exists);

// ── cleanup ──────────────────────────────────────────────────────────────────
for (const col of ['communityInvites', 'communityInviteCodes', 'rateLimits']) {
  const s = await adb.collection(col).get();
  await Promise.all(s.docs.map((d) => d.ref.delete()));
}
for (const id of [C, OPEN]) {
  const rq = await adb.collection('chats').doc(id).collection('joinRequests').get();
  await Promise.all(rq.docs.map((d) => d.ref.delete()));
  await adb.collection('chats').doc(id).delete();
}
await adb.collection('config').doc('appLinks').delete();
console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
