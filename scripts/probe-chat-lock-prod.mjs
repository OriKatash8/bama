#!/usr/bin/env node
/**
 * Production probe: the project-chat leave lock (groupLeaveAllowed) and the
 * hiddenFor self-only rule, against the LIVE ruleset.
 *
 *   completed project, inside the dispute window → leaving denied (client and pro)
 *   cancelled project                            → leaving allowed
 *   hiddenFor: own uid → allowed; someone else's uid → denied
 *
 * Two throwaway verified accounts. Projects and chats are seeded with the Admin
 * SDK (tagged with a unique stamp); the client writes are the exact ones the app
 * makes (removeMemberFromGroup, hideChatForUser). No messages are written, so no
 * notification trigger fires. Everything is DELETED and VERIFIED gone at the end
 * (exits non-zero on any leftover).
 *
 *   node scripts/probe-chat-lock-prod.mjs --prod
 */
import './lib/requireProd.mjs'; // explicit --prod required, no default target
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, updateDoc, arrayRemove, arrayUnion } from 'firebase/firestore';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';

for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '');
}
const cfg = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};
console.log(`\nproject: ${cfg.projectId}  (LIVE)\n`);

const { initializeApp: ia } = await import('firebase-admin/app');
const { getFirestore: gdb, Timestamp, FieldPath } = await import('firebase-admin/firestore');
const { getAuth: gAdminAuth } = await import('firebase-admin/auth');
const STAMP = `probechatlock${Date.now()}`;
const adminApp = ia({ projectId: cfg.projectId }, STAMP);
const adminDb = gdb(adminApp);
const adminAuth = gAdminAuth(adminApp);

let failures = 0;
const check = (l, ok, d = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}${d ? `  - ${d}` : ''}`); if (!ok) failures++; };
const allowed = async (label, fn) => {
  try { await fn(); check(label, true, 'allowed'); } catch (e) { check(label, false, `${e.code ?? e}: refused`); }
};
const denied = async (label, fn) => {
  try { await fn(); check(label, false, 'was ALLOWED'); } catch (e) { check(label, String(e.code ?? '').includes('permission-denied'), e.code); }
};

const created = { uids: [], docs: [] };
const seed = async (path, data) => { created.docs.push(path); await adminDb.doc(path).set(data); };

async function principal(name) {
  const app = initializeApp(cfg, `${STAMP}-${name}`);
  const auth = getAuth(app);
  const uid = (await createUserWithEmailAndPassword(auth, `${STAMP}-${name}@probe.invalid`, 'Probe-Password-123!')).user.uid;
  created.uids.push(uid);
  await adminAuth.updateUser(uid, { emailVerified: true });
  await auth.currentUser.getIdToken(true);
  return { name, uid, db: getFirestore(app) };
}

let exitCode = 0;
try {
  const client = await principal('client');
  const pro = await principal('pro');
  const DAY = 86_400_000;

  /** A project + its group chat (both members). */
  async function projectChat(key, project) {
    const pid = `${STAMP}-${key}`;
    const cid = `${STAMP}-${key}-chat`;
    await seed(`projects/${pid}`, {
      clientId: client.uid, professionalIds: [pro.uid], chatId: cid, title: 'Probe chat lock',
      crewSlots: [], filledSlots: [], ...project,
    });
    await seed(`chats/${cid}`, {
      type: 'group', projectId: pid, name: 'Probe chat lock', members: [client.uid, pro.uid],
      lastMessage: null, createdAt: new Date(),
    });
    return cid;
  }

  console.log('1. Leaving a project chat:');
  const inside = await projectChat('inside', {
    status: 'completed', completedAt: new Date(), adminReviewPending: false,
    disputeWindowEndsAt: Timestamp.fromMillis(Date.now() + 5 * DAY),
  });
  await denied('client: leave, completed INSIDE the window', () => updateDoc(doc(client.db, 'chats', inside), { members: arrayRemove(client.uid) }));
  await denied('pro: leave, completed INSIDE the window', () => updateDoc(doc(pro.db, 'chats', inside), { members: arrayRemove(pro.uid) }));
  const cancelled = await projectChat('cancelled', { status: 'cancelled', cancelledAt: new Date() });
  await allowed('client: leave, CANCELLED project', () => updateDoc(doc(client.db, 'chats', cancelled), { members: arrayRemove(client.uid) }));

  console.log('\n2. hiddenFor:');
  const hide = await projectChat('hide', { status: 'in_progress' });
  await allowed('client: add OWN uid to hiddenFor', () => updateDoc(doc(client.db, 'chats', hide), { hiddenFor: arrayUnion(client.uid) }));
  await denied("client: add the PRO's uid to hiddenFor", () => updateDoc(doc(client.db, 'chats', hide), { hiddenFor: arrayUnion(pro.uid) }));
  const after = (await adminDb.doc(`chats/${hide}`).get()).get('hiddenFor') ?? [];
  check('hiddenFor holds only the client after both writes', after.length === 1 && after[0] === client.uid, JSON.stringify(after.map((u) => (u === client.uid ? 'client' : u === pro.uid ? 'pro' : u))));
} catch (e) {
  console.error('probe error:', e);
  exitCode = 1;
} finally {
  console.log('\n3. Cleanup, then VERIFY it is gone:');
  for (const path of [...created.docs].reverse()) await adminDb.doc(path).delete().catch(() => {});
  for (const uid of created.uids) await adminAuth.deleteUser(uid).catch(() => {});
  let leftovers = 0;
  for (const path of created.docs) {
    const gone = !(await adminDb.doc(path).get()).exists;
    console.log(`  ${gone ? 'gone  ' : 'STILL THERE'}  doc  ${path}`);
    if (!gone) leftovers++;
  }
  for (const uid of created.uids) {
    const gone = await adminAuth.getUser(uid).then(() => false, (e) => e.code === 'auth/user-not-found');
    // onUserCreate also writes users/<uid>: remove and verify that too.
    await adminDb.doc(`users/${uid}`).delete().catch(() => {});
    const userDocGone = !(await adminDb.doc(`users/${uid}`).get()).exists;
    console.log(`  ${gone ? 'gone  ' : 'STILL THERE'}  user ${uid}   users/${uid} doc: ${userDocGone ? 'gone' : 'STILL THERE'}`);
    if (!gone || !userDocGone) leftovers++;
  }
  // Anything else carrying the stamp (a chat or project this run did not record).
  for (const col of ['chats', 'projects']) {
    const ids = (await adminDb.collection(col)
      .where(FieldPath.documentId(), '>=', STAMP).where(FieldPath.documentId(), '<', `${STAMP}\uf8ff`)
      .select().get()).docs.map((d) => d.id);
    console.log(`  ${col} tagged ${STAMP}: ${ids.length} remaining`);
    if (ids.length > 0) leftovers++;
  }
  const ok = failures === 0 && leftovers === 0 && exitCode === 0;
  console.log(`\n${ok ? 'ALL PASS, nothing left behind' : `FAILED: ${failures} check(s), ${leftovers} leftover(s)`}`);
  process.exit(ok ? 0 : 1);
}
