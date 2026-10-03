#!/usr/bin/env node
/**
 * Probe: the four pre-existing rule holes (docs/status/2026-10-03-preexisting-rule-holes.md).
 *
 * Runs against the Firestore EMULATOR with whatever firestore.rules says.
 *
 *   npx firebase emulators:start --only firestore,auth --project bama-af0a0
 *   node scripts/probe-rule-holes.mjs
 *
 * Two halves, both required: every write the app makes today is ALLOWED (in its
 * exact shape — both agreement orders, the admin community create), and each
 * abuse from the report is DENIED.
 */
import { initializeApp as initAdmin } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { initializeApp } from 'firebase/app';
import {
  getFirestore, connectFirestoreEmulator, doc, collection, addDoc, setDoc, updateDoc, writeBatch,
  serverTimestamp, arrayUnion, setLogLevel,
} from 'firebase/firestore';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
setLogLevel('silent');
const PROJECT = 'bama-af0a0';
const adminApp = initAdmin({ projectId: PROJECT });
const adb = getAdminFirestore(adminApp);
const aauth = getAdminAuth(adminApp);
const app = initializeApp({ apiKey: 'emulator-key', projectId: PROJECT }, 'probe');
const db = getFirestore(app);
const auth = getAuth(app);
connectFirestoreEmulator(db, '127.0.0.1', 8080);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });

const PW = 'probe-password-123';
const uid = {};
async function ensureUser(label, claims) {
  const email = `${label}@probe.invalid`;
  let u;
  try { u = (await createUserWithEmailAndPassword(auth, email, PW)).user.uid; }
  catch { u = (await signInWithEmailAndPassword(auth, email, PW)).user.uid; }
  await aauth.updateUser(u, { emailVerified: true });
  await aauth.setCustomUserClaims(u, claims ?? null);
  await signOut(auth);
  uid[label] = u;
}
let current = null;
async function as(label) {
  if (current === label) return;
  await signOut(auth).catch(() => {});
  await signInWithEmailAndPassword(auth, `${label}@probe.invalid`, PW);
  await auth.currentUser.getIdToken(true);
  current = label;
}
for (const l of ['rh-a', 'rh-b', 'rh-c', 'rh-admin']) await ensureUser(l, l === 'rh-admin' ? { role: 'admin' } : null);
await adb.doc('config/demoAccounts').delete().catch(() => {});
const A = uid['rh-a'], B = uid['rh-b'], C = uid['rh-c'];
let n = 0; const id = (p) => `${p}-${Date.now().toString(36)}-${++n}`;

const rows = [];
async function attempt(group, name, who, expected, run) {
  await as(who);
  let allowed = true; let err = '';
  try { await run(); } catch (e) { allowed = false; err = e.code ?? String(e.message ?? e); }
  rows.push({ group, name, expected, allowed, err });
}
const listing = async (poster) => { const l = id('lst'); await adb.doc(`marketplace_listings/${l}`).set({ type: 'secondhand', posterId: poster, productName: 'x', price: 1, status: 'available' }); return l; };
const purchaseChat = async (buyer, seller, l, extra = {}) => { const c = id('pch'); await adb.doc(`chats/${c}`).set({ type: 'purchase', members: [buyer, seller], purchaseListingId: l, lastMessage: null, ...extra }); return c; };
const acceptDeal = (lid, chatId, buyerId) => { const bt = writeBatch(db); bt.update(doc(db, 'marketplace_listings', lid), { status: 'reserved', buyerId, purchaseChatId: chatId }); bt.update(doc(db, 'chats', chatId), { sellerAgreed: true, buyerAgreed: true }); return bt.commit(); };
const project = async (fields) => { const p = id('prj'); await adb.doc(`projects/${p}`).set({ title: 'T', crewSlots: [], filledSlots: [], ...fields }); return p; };
const review = (pid, pro, reviewer) => addDoc(collection(db, 'reviews'), { projectId: pid, professionalId: pro, reviewerId: reviewer, authorId: reviewer, authorName: 'x', rating: 5, text: 'Great work, thanks', body: 'Great work, thanks', createdAt: serverTimestamp() });

// ── 1. chat create ──────────────────────────────────────────────────────────
await attempt('app', 'DM (getOrCreateDM)', 'rh-a', true, () => addDoc(collection(db, 'chats'), { type: 'dm', members: [A, B], lastMessage: null, createdAt: serverTimestamp() }));
{ const l = await listing(B); await attempt('app', 'purchase chat (createPurchaseChat)', 'rh-a', true, () => addDoc(collection(db, 'chats'), { type: 'purchase', members: [A, B], purchaseListingId: l, name: 'x', buyerName: 'a', lastMessage: null, createdAt: serverTimestamp() })); }
await attempt('app', 'admin creates a community (batch with the owner join event)', 'rh-admin', true, async () => {
  const ref = doc(collection(db, 'chats')); const bt = writeBatch(db);
  bt.set(ref, { type: 'community', name: 'C', description: 'd', ownerId: A, members: [A], lastMessage: null, createdAt: serverTimestamp() });
  bt.set(doc(collection(db, 'chats', ref.id, 'communityEvents')), { type: 'join', userId: A, at: serverTimestamp() });
  await bt.commit();
});
await attempt('abuse', 'chat without the creator in it', 'rh-a', false, () => addDoc(collection(db, 'chats'), { type: 'dm', members: [B, C], lastMessage: null }));
await attempt('abuse', 'group chat with self as ownerId', 'rh-a', false, () => addDoc(collection(db, 'chats'), { type: 'group', members: [A, B, C], ownerId: A, name: 'x' }));
await attempt('abuse', 'a 2-member group chat from a client (groups are server-only)', 'rh-a', false, () => addDoc(collection(db, 'chats'), { type: 'group', members: [A, B], name: 'x', lastMessage: null }));
await attempt('abuse', 'DM with 3 members (skips the block check)', 'rh-a', false, () => addDoc(collection(db, 'chats'), { type: 'dm', members: [A, B, C], lastMessage: null }));
await attempt('abuse', 'DM with ownerId', 'rh-a', false, () => addDoc(collection(db, 'chats'), { type: 'dm', members: [A, B], ownerId: A, lastMessage: null }));
await attempt('abuse', 'community by a non-admin', 'rh-a', false, () => addDoc(collection(db, 'chats'), { type: 'community', members: [A], ownerId: A, name: 'x' }));
{ const l = await listing(C); await attempt('abuse', 'purchase chat with someone who is not the seller', 'rh-a', false, () => addDoc(collection(db, 'chats'), { type: 'purchase', members: [A, B], purchaseListingId: l, name: 'x', buyerName: 'a', lastMessage: null })); }
await attempt('abuse', 'purchase chat for a listing that does not exist', 'rh-a', false, () => addDoc(collection(db, 'chats'), { type: 'purchase', members: [A, B], purchaseListingId: 'nope', name: 'x', buyerName: 'a', lastMessage: null }));

// ── 2. project create ───────────────────────────────────────────────────────
await attempt('app', 'project in own name (useProjectRequests)', 'rh-a', true, () => addDoc(collection(db, 'projects'), { clientId: A, crewSlots: [{ category: 'Editor', quantity: 1 }], filledSlots: [], title: 'T', description: 'D', deadline: 'flexible', location: 'TA', status: 'open', createdAt: { seconds: 1, nanoseconds: 0 } }));
await attempt('app', 'direct project in own name (DirectProjectSheet)', 'rh-a', true, () => addDoc(collection(db, 'projects'), { clientId: A, title: 'T', description: 'D', deadline: 'flexible', location: 'TA', crewSlots: [{ category: 'Editor', quantity: 1 }], filledSlots: [], status: 'open', targetProfessionalId: B, createdAt: { seconds: 1, nanoseconds: 0 } }));
await attempt('abuse', 'project in someone else\'s name', 'rh-a', false, () => addDoc(collection(db, 'projects'), { clientId: B, crewSlots: [], filledSlots: [], title: 'T', status: 'open' }));

// ── 3. review create ────────────────────────────────────────────────────────
{ const p = await project({ clientId: A, status: 'completed', professionalIds: [B], filledSlots: [{ category: 'Editor', professionalId: B }] });
  await attempt('app', 'review after completion (ReviewFlow / submitReviews, deterministic id)', 'rh-a', true, () => setDoc(doc(db, 'reviews', `${p}_${B}`), { projectId: p, professionalId: B, reviewerId: A, authorId: A, authorName: 'x', rating: 5, text: 'Great work, thanks', body: 'Great work, thanks', createdAt: serverTimestamp() }));
  await attempt('app', 'a retry of the same review is refused (no duplicate)', 'rh-a', false, () => setDoc(doc(db, 'reviews', `${p}_${B}`), { projectId: p, professionalId: B, reviewerId: A, authorId: A, authorName: 'x', rating: 1, text: 'Changed my mind!!', body: 'x', createdAt: serverTimestamp() }));
  await attempt('abuse', 'review of a pro not on the project', 'rh-a', false, () => review(p, C, A));
  await attempt('abuse', 'review of someone else\'s project', 'rh-c', false, () => review(p, B, C)); }
{ const p = await project({ clientId: A, status: 'completed', filledSlots: [{ category: 'Editor', professionalId: B }] });
  await attempt('app', 'review on a legacy completed project (no professionalIds)', 'rh-a', true, () => review(p, B, A)); }
{ const p = await project({ clientId: A, status: 'in_progress', professionalIds: [B] });
  await attempt('abuse', 'review before the project is completed', 'rh-a', false, () => review(p, B, A)); }
await attempt('abuse', 'review with no project', 'rh-a', false, () => addDoc(collection(db, 'reviews'), { professionalId: B, reviewerId: A, rating: 5, text: 'Great work, thanks', createdAt: serverTimestamp() }));
await attempt('abuse', 'review of a project that does not exist', 'rh-a', false, () => review('nope', B, A));

// ── 4. listing reserve + agreement flags ────────────────────────────────────
{ // seller (B) agrees first, then the buyer (A) presses second: acceptDeal by the buyer
  const l = await listing(B); const c = await purchaseChat(A, B, l);
  await attempt('app', 'seller agrees first (agreeToDeal: own flag)', 'rh-b', true, () => updateDoc(doc(db, 'chats', c), { sellerAgreed: true }));
  await attempt('app', 'buyer presses second (acceptDeal batch by the buyer)', 'rh-a', true, () => acceptDeal(l, c, A)); }
{ // buyer (A) agrees first, then the seller (B) presses second: acceptDeal by the seller
  const l = await listing(B); const c = await purchaseChat(A, B, l);
  await attempt('app', 'buyer agrees first (agreeToDeal: own flag)', 'rh-a', true, () => updateDoc(doc(db, 'chats', c), { buyerAgreed: true }));
  await attempt('app', 'seller presses second (acceptDeal batch by the seller)', 'rh-b', true, () => acceptDeal(l, c, A)); }
{ const l = await listing(B);
  await attempt('abuse', 'reserve with no purchase chat at all', 'rh-a', false, () => updateDoc(doc(db, 'marketplace_listings', l), { status: 'reserved', buyerId: A, purchaseChatId: 'anything' })); }
{ const l = await listing(B); const c = await purchaseChat(A, B, l);
  await attempt('abuse', 'reserve before the seller agreed', 'rh-a', false, () => acceptDeal(l, c, A));
  await attempt('abuse', 'reserve (listing write only) through own chat before the seller agreed', 'rh-a', false, () => updateDoc(doc(db, 'marketplace_listings', l), { status: 'reserved', buyerId: A, purchaseChatId: c }));
  await attempt('abuse', 'buyer forges the seller\'s agreement', 'rh-a', false, () => updateDoc(doc(db, 'chats', c), { sellerAgreed: true }));
  await attempt('abuse', 'seller forges the buyer\'s agreement', 'rh-b', false, () => updateDoc(doc(db, 'chats', c), { buyerAgreed: true })); }
{ const l = await listing(B); const l2 = await listing(B); const c = await purchaseChat(A, B, l2, { sellerAgreed: true });
  await attempt('abuse', 'reserve through another listing\'s agreed chat', 'rh-a', false, () => updateDoc(doc(db, 'marketplace_listings', l), { status: 'reserved', buyerId: A, purchaseChatId: c })); }
{ const l = await listing(B); const c = await purchaseChat(C, B, l, { sellerAgreed: true });
  await attempt('abuse', 'reserve through someone else\'s agreed chat', 'rh-a', false, () => updateDoc(doc(db, 'marketplace_listings', l), { status: 'reserved', buyerId: A, purchaseChatId: c })); }
{ // owner adds members — only on a real community now (no self-made "owner")
  const cm = id('comm'); await adb.doc(`chats/${cm}`).set({ type: 'community', name: 'C', ownerId: A, members: [A], lastMessage: null });
  await attempt('app', 'community owner adds a member', 'rh-a', true, () => updateDoc(doc(db, 'chats', cm), { members: arrayUnion(B) })); }

let bad = 0;
for (const r of rows) {
  const ok = r.allowed === r.expected; if (!ok) bad++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} [${r.group}] ${r.name} — expected ${r.expected ? 'allow' : 'deny'}, ${r.allowed ? 'allowed' : `denied (${r.err})`}`);
}
console.log(`\n${rows.length} cases, ${bad} not as expected`);
await signOut(auth).catch(() => {});
process.exit(bad ? 1 : 0);
