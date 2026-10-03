#!/usr/bin/env node
/**
 * PRODUCTION: the three Apple App Review demo accounts (test1..3) and everything
 * between them. Re-runnable — a reviewer deleting an account is fixed by running
 * `setup` again. Plan and approval: docs/status/2026-10-03-demo-accounts-phase1.md.
 *
 *   DEMO_PASSWORD=… node scripts/demo-accounts.mjs setup [--commit] [--out DIR]
 *   node scripts/demo-accounts.mjs verify [--out DIR]               (read-only)
 *   node scripts/demo-accounts.mjs cleanup [--commit] [--purge]
 *   node scripts/demo-accounts.mjs snapshot-content [--commit]     (alias: snapshot-portfolio)
 *   node scripts/demo-accounts.mjs restore-content --commit
 *
 * Without --commit nothing is written: the command prints what it would do.
 * Credentials: Application Default Credentials (gcloud auth application-default
 * login). The password is read from DEMO_PASSWORD only and never written anywhere.
 * Run logs go to --out (default: the OS temp dir), never into the project.
 *
 * ISOLATION. config/demoAccounts puts these accounts on their own side
 * (firestore.rules oneSide, functions/src/demo.ts): they reach each other and
 * nobody else. `setup` writes it FIRST and proves a live function reads it
 * (a hire across sides must be refused) before any project exists, so no
 * "new project" push can reach a real professional.
 *
 * FEES. Demo engagements create real fee records. They are NOT settled here:
 * `setup` prints them and stops; mark them paid in the admin screen, then run
 * `verify`, which checks they are all paid.
 *
 * HAND-MADE CONTENT. Portfolio, avatar, listings and their photos, and owned
 * communities are added by hand in the app. `snapshot-content` copies them (docs
 * and Storage objects, download tokens included) to demoBackups/{uid} and
 * Storage demo-backup/{uid}/ — both Admin-only. `setup` snapshots before it
 * cleans up (never replacing a backup with an empty one, never from a deleted
 * account) and restores after, to the same paths and ids under the same fixed
 * uids, so every saved URL keeps working.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { initializeApp as initAdmin } from 'firebase-admin/app';
import { getFirestore as getAdminDb, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { initializeApp } from 'firebase/app';
import {
  getFirestore, connectFirestoreEmulator, collection, collectionGroup, doc, getDoc, getDocs, addDoc, setDoc, updateDoc,
  query, where, serverTimestamp, increment,
} from 'firebase/firestore';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import {
  ACCOUNTS, byKey, DEMO_UIDS, ROLE_SKILLS, LEGACY,
  COMPLETED, ACTIVE, OPEN, DM, LISTINGS,
} from './lib/demoAccountsData.mjs';

const PROJECT = 'bama-af0a0';
const BUCKET = 'bama-af0a0.firebasestorage.app';
const args = process.argv.slice(2);
const CMD = args[0];
const COMMIT = args.includes('--commit');
const PURGE = args.includes('--purge');
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const OUT = flag('--out') ?? join(tmpdir(), 'bama-demo-accounts');
mkdirSync(OUT, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const log = [];
const say = (...a) => { const line = a.join(' '); console.log(line); log.push(line); };
const saveLog = (name) => writeFileSync(join(OUT, `${STAMP}-${name}.log`), log.join('\n') + '\n');

const REPO = new URL('..', import.meta.url);
const TERMS_VERSION = readFileSync(new URL('src/core/constants/legal.ts', REPO), 'utf8')
  .match(/export const CURRENT_TERMS_VERSION = '([^']+)'/)[1];
// The app's own web config, committed in eas.json (there is no .env in the project).
const WEB = JSON.parse(readFileSync(new URL('eas.json', REPO), 'utf8')).build.production.env;
const WEB_CONFIG = {
  apiKey: WEB.EXPO_PUBLIC_FIREBASE_API_KEY, authDomain: WEB.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: WEB.EXPO_PUBLIC_FIREBASE_PROJECT_ID, appId: WEB.EXPO_PUBLIC_FIREBASE_APP_ID,
};
if (WEB_CONFIG.projectId !== PROJECT) throw new Error(`eas.json points at ${WEB_CONFIG.projectId}, expected ${PROJECT}`);

// A rehearsal against the emulators when FIRESTORE_EMULATOR_HOST is set: the
// Admin SDK follows the *_EMULATOR_HOST variables itself; client apps are
// pointed at them in clientApp().
const EMU = process.env.FIRESTORE_EMULATOR_HOST;
function clientApp(name) {
  const app = initializeApp(EMU ? { ...WEB_CONFIG, apiKey: 'emulator-key' } : WEB_CONFIG, name);
  if (EMU) {
    const [host, port] = EMU.split(':');
    connectFirestoreEmulator(getFirestore(app), host, Number(port));
    connectAuthEmulator(getAuth(app), `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
    connectFunctionsEmulator(getFunctions(app), host, 5001);
  }
  return app;
}
if (EMU) console.log(`(EMULATOR ${EMU})`);
const adminApp = initAdmin({ projectId: PROJECT, storageBucket: BUCKET });
const adb = getAdminDb(adminApp);
const aauth = getAdminAuth(adminApp);
const bucket = getStorage(adminApp).bucket();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cfgRef = adb.doc('config/demoAccounts');

async function waitFor(what, fn, ms = 30000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(700);
  }
}

// ── neutral uids: admins + BAMA itself ──────────────────────────────────────
async function adminUids() {
  const out = [];
  let token;
  do {
    const page = await aauth.listUsers(1000, token);
    for (const u of page.users) if (u.customClaims?.role === 'admin') out.push(u.uid);
    token = page.pageToken;
  } while (token);
  return out;
}

// ── hand-made content backup ────────────────────────────────────────────────
// Everything the owner adds to a demo account by hand in the app survives a
// re-run of setup (whose cleanup deletes it) and a reviewer's account deletion:
//   portfolio items, the avatar, marketplace listings and their photos, and the
//   communities the account owns (channels, messages, join requests, stats,
//   events, their images and chat media).
// Firestore copies go to demoBackups/{uid}/…, Storage copies to
// demo-backup/{uid}/<original path> — both Admin-only. Objects are copied with
// their metadata, download tokens included, and restored to the same paths
// under the same fixed uid, so every saved URL keeps working.
const backupPrefix = (uid) => `demo-backup/${uid}/`;
const livePrefixes = (uid) => [`portfolio/${uid}/`, `avatars/${uid}`, `users/${uid}/avatar/`];
// setup creates these two listings itself; backing them up would duplicate them.
const SEEDED_LISTINGS = [LISTINGS.sale, LISTINGS.rental].map((l) => `${byKey[l.by].uid}|${l.productName}`);
const isSeededListing = (d) => SEEDED_LISTINGS.includes(`${d.get('posterId')}|${d.get('productName')}`);
const pathOfUrl = (url) => { const m = String(url ?? '').match(/\/o\/([^?]+)/); return m ? decodeURIComponent(m[1]) : null; };

/** Copy a document and everything under it (Admin SDK). */
async function copyTree(src, dst) {
  const s = await src.get();
  if (s.exists) await dst.set(s.data());
  for (const sub of await src.listCollections()) {
    for (const ref of await sub.listDocuments()) await copyTree(ref, dst.collection(sub.id).doc(ref.id));
  }
}

async function gatherContent(uid) {
  const portfolio = (await adb.collection(`users/${uid}/portfolio`).get()).docs;
  const listings = (await adb.collection('marketplace_listings').where('posterId', '==', uid).get()).docs.filter((d) => !isSeededListing(d));
  const communities = (await adb.collection('chats').where('type', '==', 'community').where('ownerId', '==', uid).get()).docs;
  const prefixes = [...livePrefixes(uid)];
  for (const l of listings) prefixes.push(`marketplace/${l.id}/`);
  for (const c of communities) prefixes.push(`chat-images/${c.id}/`, `chat-audio/${c.id}/`);
  const files = new Map();
  for (const p of prefixes) for (const f of (await bucket.getFiles({ prefix: p }))[0]) files.set(f.name, f);
  // Images referenced by URL from elsewhere (community photos, a listing photo outside its folder).
  for (const url of [...communities.map((c) => c.get('photoURL')), ...listings.map((l) => l.get('imageUrl'))]) {
    const p = pathOfUrl(url);
    if (p && !files.has(p)) { const f = bucket.file(p); if ((await f.exists())[0]) files.set(p, f); }
  }
  const user = await adb.doc(`users/${uid}`).get();
  return { portfolio, listings, communities, files: [...files.values()], photoURL: user.get('photoURL') ?? null, userDeleted: !user.exists || user.get('deleted') === true };
}

/**
 * `force`: the owner's explicit snapshot replaces the backup whenever anything
 * is live. The automatic one in setup does not touch the backup of an account a
 * reviewer has deleted (its content is then partly gone), and never replaces a
 * backup with an empty one.
 */
async function snapshotContent({ force }) {
  for (const a of ACCOUNTS) {
    const c = await gatherContent(a.uid);
    const total = c.portfolio.length + c.listings.length + c.communities.length + c.files.length;
    const summary = `${c.portfolio.length} portfolio, ${c.listings.length} listings, ${c.communities.length} communities, ${c.files.length} files`;
    if (total === 0) { say(`  ${a.key}: nothing live — existing backup (if any) kept`); continue; }
    if (!force && c.userDeleted) { say(`  ${a.key}: account was deleted — existing backup kept (live: ${summary})`); continue; }
    say(`  ${a.key}: ${summary}${COMMIT ? '' : ' (dry run)'}`);
    if (!COMMIT) continue;
    await adb.recursiveDelete(adb.doc(`demoBackups/${a.uid}`));
    await bucket.deleteFiles({ prefix: backupPrefix(a.uid) });
    for (const f of c.files) await f.copy(bucket.file(backupPrefix(a.uid) + f.name)); // metadata (incl. download tokens) is copied
    for (const d of c.portfolio) await adb.doc(`demoBackups/${a.uid}/portfolio/${d.id}`).set(d.data());
    for (const d of c.listings) await adb.doc(`demoBackups/${a.uid}/listings/${d.id}`).set(d.data());
    for (const d of c.communities) await copyTree(d.ref, adb.doc(`demoBackups/${a.uid}/communities/${d.id}`));
    await adb.doc(`demoBackups/${a.uid}`).set({
      photoURL: c.photoURL, files: c.files.map((f) => f.name),
      counts: { portfolio: c.portfolio.length, listings: c.listings.length, communities: c.communities.length, files: c.files.length },
      snapshotAt: FieldValue.serverTimestamp(),
    });
  }
}

/**
 * Put it all back. Restoring community messages fires onNewCommunityMessage
 * (unread counts, member stats, a notification per demo member), so the chat
 * and memberStats docs are written again from the backup once the triggers have
 * run, and the notifications they created are deleted. The pushes themselves
 * reach only devices signed in as a demo account.
 */
async function restoreContent() {
  const started = Timestamp.now();
  const restoredChats = [];
  for (const a of ACCOUNTS) {
    const meta = await adb.doc(`demoBackups/${a.uid}`).get();
    if (!meta.exists) { say(`  ${a.key}: no backup`); continue; }
    const [files] = await bucket.getFiles({ prefix: backupPrefix(a.uid) });
    for (const f of files) await f.copy(bucket.file(f.name.slice(backupPrefix(a.uid).length)));
    const portfolio = (await adb.collection(`demoBackups/${a.uid}/portfolio`).get()).docs;
    for (const d of portfolio) await adb.doc(`users/${a.uid}/portfolio/${d.id}`).set(d.data());
    const listings = (await adb.collection(`demoBackups/${a.uid}/listings`).get()).docs;
    for (const d of listings) {
      const data = d.data();
      // A reservation's purchase chat is not restored: put the item back on the market.
      if (data.purchaseChatId && !(await adb.doc(`chats/${data.purchaseChatId}`).get()).exists) {
        delete data.purchaseChatId; delete data.buyerId; data.status = 'available';
      }
      await adb.doc(`marketplace_listings/${d.id}`).set(data);
    }
    const communities = await adb.collection(`demoBackups/${a.uid}/communities`).listDocuments();
    for (const ref of communities) { await copyTree(ref, adb.doc(`chats/${ref.id}`)); restoredChats.push({ uid: a.uid, id: ref.id }); }
    if (communities.length) await cfgRef.set({ communityIds: FieldValue.arrayUnion(...communities.map((r) => r.id)) }, { merge: true });
    if (meta.get('photoURL') && (await adb.doc(`users/${a.uid}`).get()).exists) await adb.doc(`users/${a.uid}`).update({ photoURL: meta.get('photoURL') });
    say(`  ${a.key}: restored ${portfolio.length} portfolio, ${listings.length} listings, ${communities.length} communities, ${files.length} files`);
  }
  if (!restoredChats.length) return;
  await sleep(20000); // let the message triggers finish
  for (const { uid, id } of restoredChats) {
    const src = adb.doc(`demoBackups/${uid}/communities/${id}`);
    await adb.doc(`chats/${id}`).set((await src.get()).data());
    const stats = await src.collection('memberStats').get();
    for (const s of (await adb.collection(`chats/${id}/memberStats`).get()).docs) if (!stats.docs.some((b) => b.id === s.id)) await s.ref.delete();
    for (const s of stats.docs) await adb.doc(`chats/${id}/memberStats/${s.id}`).set(s.data());
  }
  const ids = new Set(restoredChats.map((c) => c.id));
  let removed = 0;
  for (const n of (await adb.collection('notifications').where('createdAt', '>=', started).get()).docs) {
    if (ids.has(n.get('data')?.chatId)) { await n.ref.delete(); removed++; }
  }
  say(`  restored-community side effects undone: chat docs and memberStats rewritten, ${removed} notifications removed`);
}

// ── cleanup ─────────────────────────────────────────────────────────────────
const isDemo = (uid) => DEMO_UIDS.includes(uid);

async function cleanup() {
  const neutral = new Set(['bama-system', ...(await adminUids())]);
  const skipped = [];
  const counts = {};
  const del = async (ref, kind, recursive = false) => {
    counts[kind] = (counts[kind] ?? 0) + 1;
    if (!COMMIT) return;
    if (recursive) await adb.recursiveDelete(ref); else await ref.delete();
  };

  // Projects: the demo accounts' own. A project with a non-demo professional is
  // left alone and reported — it cannot exist under the rules, so it means
  // something is wrong and a human should look.
  const projectIds = new Set();
  for (const uid of DEMO_UIDS) {
    for (const p of (await adb.collection('projects').where('clientId', '==', uid).get()).docs) {
      const outsiders = ((p.get('professionalIds') ?? [])).filter((x) => !isDemo(x));
      if (outsiders.length) { skipped.push(`projects/${p.id} (pros ${outsiders.join(',')})`); continue; }
      projectIds.add(p.id);
      await del(p.ref, 'projects', true);   // fees, meetings, missions, paymentRequests, removalRequests
    }
    for (const p of (await adb.collection('projects').where('professionalIds', 'array-contains', uid).get()).docs) {
      if (!isDemo(p.get('clientId'))) skipped.push(`projects/${p.id} (real client ${p.get('clientId')})`);
    }
  }
  for (const col of ['priceOffers', 'bundleOffers', 'projectApplications']) {
    for (const uid of DEMO_UIDS) {
      for (const d of (await adb.collection(col).where('professionalId', '==', uid).get()).docs) await del(d.ref, col);
    }
    for (const pid of projectIds) {
      for (const d of (await adb.collection(col).where('projectId', '==', pid).get()).docs) {
        if (isDemo(d.get('professionalId'))) continue; // counted above
        skipped.push(`${col}/${d.id} (real offerer on a demo project)`);
      }
    }
  }
  // Chats: every chat a demo account is in, plus each one's system DM. Any chat
  // with a non-demo, non-neutral member is reported, never deleted.
  const chatIds = new Set();
  for (const uid of DEMO_UIDS) {
    for (const c of (await adb.collection('chats').where('members', 'array-contains', uid).get()).docs) {
      if (chatIds.has(c.id)) continue;
      const outsiders = (c.get('members') ?? []).filter((m) => !isDemo(m) && !neutral.has(m));
      if (outsiders.length) { skipped.push(`chats/${c.id} (members ${outsiders.join(',')})`); continue; }
      chatIds.add(c.id);
      await del(c.ref, 'chats', true);      // messages, channels/*/messages, joinRequests, communityEvents, memberStats
    }
    const sys = adb.doc(`chats/sys_${uid}`);
    if ((await sys.get()).exists && !chatIds.has(sys.id)) { chatIds.add(sys.id); await del(sys, 'chats', true); }
  }

  for (const uid of DEMO_UIDS) {
    for (const field of ['reviewerId', 'professionalId']) {
      for (const d of (await adb.collection('reviews').where(field, '==', uid).get()).docs) {
        const other = field === 'reviewerId' ? d.get('professionalId') : d.get('reviewerId');
        if (!isDemo(other)) { skipped.push(`reviews/${d.id} (real ${field === 'reviewerId' ? 'pro' : 'reviewer'})`); continue; }
        if (field === 'professionalId' && isDemo(d.get('reviewerId'))) continue; // counted once, as reviewerId
        await del(d.ref, 'reviews');
      }
    }
    for (const d of (await adb.collection('marketplace_listings').where('posterId', '==', uid).get()).docs) await del(d.ref, 'marketplace_listings');
    for (const d of (await adb.collection('notifications').where('userId', '==', uid).get()).docs) await del(d.ref, 'notifications');
    for (const d of (await adb.collection('pushTokens').where('userId', '==', uid).get()).docs) await del(d.ref, 'pushTokens');
    const fb = adb.doc(`feeBlocks/${uid}`);
    if ((await fb.get()).exists) await del(fb, 'feeBlocks');
    const user = adb.doc(`users/${uid}`);
    if ((await user.get()).exists || (await user.listCollections()).length) await del(user, 'users', true);
    for (const p of [...livePrefixes(uid), `chat-videos/${uid}/`]) {
      const [files] = await bucket.getFiles({ prefix: p });
      counts.storage = (counts.storage ?? 0) + files.length;
      if (COMMIT && files.length) await bucket.deleteFiles({ prefix: p });
    }
    try {
      await aauth.getUser(uid);
      counts.authUsers = (counts.authUsers ?? 0) + 1;
      if (COMMIT) await aauth.deleteUser(uid);
    } catch (e) { if (e.code !== 'auth/user-not-found') throw e; }
  }
  if (PURGE) {
    if ((await cfgRef.get()).exists) await del(cfgRef, 'config/demoAccounts');
    for (const uid of DEMO_UIDS) {
      const b = adb.doc(`demoBackups/${uid}`);
      if ((await b.get()).exists) await del(b, 'demoBackups', true);
      if (COMMIT) await bucket.deleteFiles({ prefix: backupPrefix(uid) });
    }
  }
  say(`  ${COMMIT ? 'deleted' : 'would delete'}: ${JSON.stringify(counts)}`);
  if (skipped.length) say(`  SKIPPED (has a non-demo party — look at these):\n    ${skipped.join('\n    ')}`);
  return { counts, skipped };
}

// ── client sessions: the real app paths, under the real rules ───────────────
const sessions = {};
async function signIn(key, password) {
  const app = clientApp(`demo-${key}-${STAMP}`);
  const auth = getAuth(app);
  await signInWithEmailAndPassword(auth, byKey[key].email, password);
  sessions[key] = { uid: byKey[key].uid, db: getFirestore(app), fns: getFunctions(app), auth };
  return sessions[key];
}
const call = async (key, name, data) => (await httpsCallable(sessions[key].fns, name)(data)).data;

/** chatService.sendMessage, exactly: the message, then lastMessage + unread counts. */
async function sendMessage(key, chatId, text) {
  const { db, uid } = sessions[key];
  await addDoc(collection(db, 'chats', chatId, 'messages'), { senderId: uid, text, timestamp: serverTimestamp(), readBy: [uid] });
  const members = (await getDoc(doc(db, 'chats', chatId))).data()?.members ?? [];
  const update = { lastMessage: { text, senderId: uid, timestamp: serverTimestamp() } };
  for (const m of members) if (m !== uid) update[`unreadCount.${m}`] = increment(1);
  await updateDoc(doc(db, 'chats', chatId), update);
}

const isoDay = (days) => { const d = new Date(Date.now() + days * 864e5); return d.toISOString().slice(0, 10); };
const nowMap = () => ({ seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 });

/** useProjectRequests.submit, exactly. */
async function createProject(def, deadlineDays) {
  const { db, uid } = sessions[def.client];
  const deadline = isoDay(deadlineDays);
  const ref = await addDoc(collection(db, 'projects'), {
    clientId: uid,
    crewSlots: def.crew.map((c) => ({ category: LEGACY[c.role], quantity: 1 })),
    filledSlots: [],
    title: def.title, description: def.description, location: def.location, deadline,
    endDate: new Date(`${deadline}T00:00:00`),
    status: 'open',
    createdAt: nowMap(),
  });
  return ref.id;
}

/** usePriceOffer.submit, exactly. */
async function offer(proKey, projectId, role, price) {
  const { db, uid } = sessions[proKey];
  const ref = await addDoc(collection(db, 'priceOffers'), {
    projectId, professionalId: uid, category: LEGACY[role], price, status: 'pending', createdAt: serverTimestamp(),
  });
  return ref.id;
}

const projectData = (pid) => adb.doc(`projects/${pid}`).get().then((s) => s.data());

/** Hire every offer, the pro says "I'm in", the client confirms: in_progress. */
async function hireAndConfirm(def, pid, offerIds) {
  for (const oid of offerIds) await call(def.client, 'hireProfessional', { offerId: oid });
  for (const c of def.crew) await call(c.pro, 'acknowledgeCandidacy', { projectId: pid });
  for (const c of def.crew) await call(def.client, 'confirmCandidate', { projectId: pid, professionalId: byKey[c.pro].uid });
  const p = await waitFor(`${def.key} in_progress`, async () => { const d = await projectData(pid); return d?.status === 'in_progress' && d; });
  return p.chatId;
}

const record = { projects: {}, chats: {}, listings: {}, fees: [] };

async function seedCompleted(def) {
  const pid = await createProject(def, 7);
  const offerIds = [];
  for (const c of def.crew) offerIds.push(await offer(c.pro, pid, c.role, c.price));
  const chatId = await hireAndConfirm(def, pid, offerIds);
  for (const [k, text] of def.messages) await sendMessage(k, chatId, text);
  // The pro marks their part done (the primary path); the client confirms the
  // project, which closes the rest and the chat — project-details.tsx:513.
  await call(def.crew[0].pro, 'markEngagementComplete', { projectId: pid });
  await call(def.client, 'confirmCompletion', { projectId: pid });
  await waitFor(`${def.key} completed`, async () => (await projectData(pid))?.status === 'completed');
  // ReviewFlow.tsx:113, exactly — then the flag that keeps ReviewFlowGate quiet.
  const { db, uid } = sessions[def.client];
  for (const c of def.crew) {
    const [rating, text] = def.reviews[c.pro];
    await addDoc(collection(db, 'reviews'), {
      projectId: pid, professionalId: byKey[c.pro].uid, reviewerId: uid, authorId: uid, authorName: byKey[def.client].displayName,
      rating, text, body: text, createdAt: serverTimestamp(),
    });
  }
  await updateDoc(doc(db, 'projects', pid), { reviewsCompleted: true, reviewsPending: [] });
  record.projects[def.key] = pid; record.chats[def.key] = chatId;
  say(`  ${def.key}: ${def.title} — ${pid} (chat ${chatId})`);
}

async function seedActive() {
  const pid = await createProject(ACTIVE, ACTIVE.deadlineDays);
  const offerIds = [];
  for (const c of ACTIVE.crew) offerIds.push(await offer(c.pro, pid, c.role, c.price));
  const chatId = await hireAndConfirm(ACTIVE, pid, offerIds);
  for (const [k, text] of ACTIVE.messages) await sendMessage(k, chatId, text);
  record.projects.active = pid; record.chats.active = chatId;
  say(`  active: ${ACTIVE.title} — ${pid} (chat ${chatId})`);
}

async function seedOpen() {
  const pid = await createProject(OPEN, OPEN.deadlineDays);
  for (const o of OPEN.offers) await offer(o.pro, pid, o.role, o.price);
  record.projects.open = pid;
  say(`  open: ${OPEN.title} — ${pid}, pending offers from ${OPEN.offers.map((o) => o.pro).join(', ')}`);
}

async function seedDm() {
  const { db } = sessions[DM.a];
  const ref = await addDoc(collection(db, 'chats'), {                       // chatService.getOrCreateDM
    type: 'dm', members: [byKey[DM.a].uid, byKey[DM.b].uid], lastMessage: null, createdAt: serverTimestamp(),
  });
  for (const [k, text] of DM.messages) await sendMessage(k, ref.id, text);
  record.chats.dm = ref.id;
  say(`  dm: ${DM.a} ↔ ${DM.b} — ${ref.id}`);
}

async function seedListings() {
  const s = LISTINGS.sale;
  const sale = await addDoc(collection(sessions[s.by].db, 'marketplace_listings'), {  // useCreateListing, exactly
    type: s.type, posterId: byKey[s.by].uid, posterName: byKey[s.by].displayName, productName: s.productName,
    location: s.location, price: s.price, imageUrl: null, condition: s.condition, category: s.category,
    subcategory: s.subcategory, brand: s.brand, status: 'available', createdAt: nowMap(),
  });
  // Rentals are admin-created only (firestore.rules) — same fields, Admin SDK.
  const r = LISTINGS.rental;
  const rental = adb.collection('marketplace_listings').doc();
  await rental.set({
    type: r.type, posterId: byKey[r.by].uid, posterName: byKey[r.by].displayName, productName: r.productName,
    location: r.location, price: r.price, imageUrl: null, condition: r.condition, category: r.category,
    subcategory: r.subcategory, brand: r.brand, storeName: r.storeName, productUrl: r.productUrl, pricePeriod: r.pricePeriod,
    status: 'available', createdAt: nowMap(),
  });
  record.listings = { sale: sale.id, rental: rental.id };
  say(`  listings: sale ${sale.id} (${s.by}), rental ${rental.id} (${r.by})`);
}

// ── canary: a live function must already see the new config ─────────────────
async function canary() {
  const email = `demo-canary-${Date.now()}@probe.invalid`;
  const pw = randomBytes(18).toString('base64url');
  const real = await aauth.createUser({ email, password: pw, emailVerified: true, displayName: 'canary' });
  const pid = adb.collection('projects').doc().id;
  const oid = adb.collection('priceOffers').doc().id;
  try {
    await waitFor('canary users doc', async () => (await adb.doc(`users/${real.uid}`).get()).exists, 20000).catch(() => {});
    // Targeted at demo-test1, so onProjectCreate returns before matching anyone.
    await adb.doc(`projects/${pid}`).set({
      clientId: real.uid, title: 'canary', crewSlots: [{ category: 'Editor', quantity: 1 }], filledSlots: [],
      status: 'open', targetProfessionalId: DEMO_UIDS[0], createdAt: { seconds: 0, nanoseconds: 0 },
    });
    await adb.doc(`priceOffers/${oid}`).set({ projectId: pid, professionalId: DEMO_UIDS[0], category: 'Editor', price: 100, status: 'pending', createdAt: FieldValue.serverTimestamp() });
    const app = clientApp(`canary-${STAMP}`);
    await signInWithEmailAndPassword(getAuth(app), email, pw);
    let refused = null;
    try { await httpsCallable(getFunctions(app), 'hireProfessional')({ offerId: oid }); } catch (e) { refused = e; }
    if (!refused || refused.code !== 'functions/failed-precondition' || refused.message !== 'demo-isolation') {
      throw new Error(`CANARY FAILED: a real client could hire a demo pro (${refused ? `${refused.code} ${refused.message}` : 'hire succeeded'}). Stop.`);
    }
    say('  canary: real client → demo pro hire refused with demo-isolation ✓ (the live function reads the new config)');
  } finally {
    await adb.recursiveDelete(adb.doc(`projects/${pid}`));
    await adb.doc(`priceOffers/${oid}`).delete();
    for (const d of (await adb.collection('notifications').where('userId', '==', real.uid).get()).docs) await d.ref.delete();
    await aauth.deleteUser(real.uid);
    await sleep(3000);
    await adb.recursiveDelete(adb.doc(`users/${real.uid}`));
  }
}

// ── accounts ────────────────────────────────────────────────────────────────
async function createAccounts(password) {
  for (const a of ACCOUNTS) {
    await aauth.createUser({ uid: a.uid, email: a.email, password, displayName: a.displayName, emailVerified: true });
    // onUserCreate merge-writes users/{uid}; let it land, then write the whole doc.
    // Not fatal if it never does (it can't under the functions emulator —
    // docs/slice1-verification.md): the doc below is complete on its own.
    await waitFor(`users/${a.uid}`, async () => (await adb.doc(`users/${a.uid}`).get()).exists, 15000)
      .catch(() => say(`  (${a.key}: onUserCreate did not write users/${a.uid} within 15s — writing it anyway)`));
    const now = Date.now();
    await adb.doc(`users/${a.uid}`).set({
      id: a.uid, displayName: a.displayName, photoURL: null, createdAt: FieldValue.serverTimestamp(),
      termsVersion: TERMS_VERSION, termsAcceptedAt: now, ageConfirmed: true, ageConfirmedAt: now,
      needsProfileSetup: false, clientOnboarded: true,
    });
    await adb.doc(`users/${a.uid}/profile/data`).set({
      roleSkills: ROLE_SKILLS, bio: a.bio, equipment: a.equipment, priceList: a.priceList,
      availability: 'available', proProfileCompleted: true,
    });
    await adb.doc(`users/${a.uid}/private/contact`).set({ phone: a.phone, updatedAt: FieldValue.serverTimestamp() });
    say(`  ${a.key}: ${a.uid} <${a.email}>`);
  }
}

async function printFees() {
  const rows = [];
  for (const [key, pid] of Object.entries(record.projects)) {
    const title = (await projectData(pid))?.title;
    for (const f of (await adb.collection(`projects/${pid}/fees`).get()).docs) {
      const pro = ACCOUNTS.find((a) => a.uid === f.id)?.key ?? f.id;
      rows.push({ key, title, pid, pro, engagement: f.get('engagementStatus'), feeDue: f.get('feeDue'), status: f.get('status') });
    }
  }
  record.fees = rows;
  const done = rows.filter((r) => r.engagement === 'completed');
  say(`\n  FEES TO MARK PAID in the admin screen (${done.length} completed engagements):`);
  for (const r of done) say(`    ${r.title.padEnd(30)} pro ${r.pro}   ₪${r.feeDue}   (${r.status})   project ${r.pid}`);
  for (const r of rows.filter((x) => x.engagement !== 'completed')) {
    say(`  (also, still active: ${r.title} / ${r.pro} — engagement ${r.engagement}, fee ${r.status}; not due until completion)`);
  }
}

// ── verify (read-only) ──────────────────────────────────────────────────────
async function verify(password) {
  const results = [];
  const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); say(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };
  const cfg = (await cfgRef.get()).data();
  check('config/demoAccounts present with the 3 uids', !!cfg && DEMO_UIDS.every((u) => cfg.uids?.includes(u)));
  for (const cid of cfg?.communityIds ?? []) {
    const c = await adb.doc(`chats/${cid}`).get();
    check(`demo community ${cid} exists and is owned by a demo account`, c.exists && c.get('type') === 'community' && DEMO_UIDS.includes(c.get('ownerId')), c.get('name') ?? '(missing)');
  }

  for (const a of ACCOUNTS) {
    const u = await aauth.getUser(a.uid).catch(() => null);
    check(`${a.key}: auth user exists, email verified, enabled`, !!u && u.emailVerified && !u.disabled);
    check(`${a.key}: no custom claims (not admin)`, !!u && (!u.customClaims || Object.keys(u.customClaims).length === 0), JSON.stringify(u?.customClaims ?? {}));
    const user = (await adb.doc(`users/${a.uid}`).get()).data() ?? {};
    const profile = (await adb.doc(`users/${a.uid}/profile/data`).get()).data() ?? {};
    const contact = (await adb.doc(`users/${a.uid}/private/contact`).get()).data() ?? {};
    // nextAuthRoute / useOnboardingGate / both layouts, gate by gate.
    const common = user.moderation?.status !== 'suspended' && user.termsVersion === TERMS_VERSION
      && user.needsProfileSetup !== true && /^\+[1-9]\d{7,14}$/.test(contact.phone ?? '');
    check(`${a.key}: client mode gates pass`, common && user.clientOnboarded === true);
    check(`${a.key}: professional mode gates pass`, common && profile.proProfileCompleted === true && (profile.roleSkills?.length ?? 0) > 0);
    check(`${a.key}: every role with every specialization`, JSON.stringify(profile.roleSkills) === JSON.stringify(ROLE_SKILLS));
    check(`${a.key}: equipment`, (profile.equipment?.length ?? 0) >= 8, `${profile.equipment?.length} items`);
  }

  // The app's own queries, signed in as each account, under the live rules.
  for (const a of ACCOUNTS) {
    const { db, uid } = await signIn(a.key, password);
    const reviews = await getDocs(query(collection(db, 'reviews'), where('professionalId', '==', uid), where('published', '==', true)));
    const authors = reviews.docs.map((d) => d.get('reviewerId')).sort();
    check(`${a.key}: 2 published reviews, one from each other account`, JSON.stringify(authors) === JSON.stringify(DEMO_UIDS.filter((x) => x !== uid).sort()));
    const mine = await getDocs(query(collection(db, 'projects'), where('clientId', '==', uid)));
    check(`${a.key}: own projects load`, mine.size >= 1, `${mine.size}`);
    const open = await getDocs(query(collection(db, 'projects'), where('status', '==', 'open')));
    check(`${a.key}: noticeboard query loads`, open.size >= 1);
    const chats = await getDocs(query(collection(db, 'chats'), where('members', 'array-contains', uid)));
    let msgs = 0;
    for (const c of chats.docs) msgs += (await getDocs(collection(db, 'chats', c.id, 'messages'))).size;
    check(`${a.key}: chats and their messages load`, chats.size >= 3 && msgs > 0, `${chats.size} chats, ${msgs} messages`);
    for (const type of ['secondhand', 'rental']) {
      const l = await getDocs(query(collection(db, 'marketplace_listings'), where('type', '==', type)));
      check(`${a.key}: ${type} listings load, demo one present`, l.docs.some((d) => DEMO_UIDS.includes(d.get('posterId'))));
    }
    // Demo communities are made by hand in the app (none is seeded): report membership, don't require it.
    const communities = await getDocs(query(collection(db, 'chats'), where('type', '==', 'community'), where('members', 'array-contains', uid)));
    say(`  info: ${a.key} is in ${communities.docs.filter((d) => cfg?.communityIds?.includes(d.id)).map((d) => d.get('name')).join(', ') || 'no demo community'}`);
    const fees = await getDocs(query(collectionGroup(db, 'fees'), where('professionalId', '==', uid)));   // feesService.ts:66
    check(`${a.key}: own fees load`, fees.size >= 1, `${fees.size}`);
  }

  // Fees: every completed demo engagement is paid.
  const feeRows = [];
  for (const uid of DEMO_UIDS) {
    for (const f of (await adb.collectionGroup('fees').where('professionalId', '==', uid).get()).docs) {
      feeRows.push({ path: f.ref.path, engagement: f.get('engagementStatus'), status: f.get('status'), feePaid: f.get('feePaid') });
    }
  }
  const completed = feeRows.filter((r) => r.engagement === 'completed');
  check('6 completed demo engagements', completed.length === 6, `${completed.length}`);
  check('every completed demo fee is paid', completed.every((r) => r.status === 'paid' && r.feePaid === true),
    completed.filter((r) => r.status !== 'paid').map((r) => r.path).join(', '));
  for (const r of feeRows.filter((x) => x.engagement !== 'completed')) say(`  info: ${r.path} engagement ${r.engagement}, fee ${r.status}`);

  // No notification since the seed reached anyone outside the demo side.
  if (cfg?.seededAt) {
    const since = await adb.collection('notifications').where('createdAt', '>=', cfg.seededAt).get();
    const demoProjects = new Set();
    for (const uid of DEMO_UIDS) for (const p of (await adb.collection('projects').where('clientId', '==', uid).get()).docs) demoProjects.add(p.id);
    const demoChats = new Set();
    for (const uid of DEMO_UIDS) for (const c of (await adb.collection('chats').where('members', 'array-contains', uid).get()).docs) demoChats.add(c.id);
    const toReal = since.docs.filter((d) => !DEMO_UIDS.includes(d.get('userId')));
    const offenders = toReal.filter((d) => {
      const data = d.get('data') ?? {};
      return demoProjects.has(data.projectId) || demoChats.has(data.chatId) || DEMO_UIDS.includes(data.senderId) || DEMO_UIDS.includes(data.fromUserId);
    });
    check('no notification about demo activity reached a non-demo user', offenders.length === 0,
      `${since.size} notifications since seed: ${since.size - toReal.length} to demo, ${toReal.length} to others (unrelated), ${offenders.length} offending`);
    for (const d of offenders) say(`    offender: notifications/${d.id} → ${d.get('userId')} ${JSON.stringify(d.get('data'))}`);
  }
  const bad = results.filter((r) => !r.ok).length;
  say(`\n  ${results.length} checks, ${bad} failed`);
  writeFileSync(join(OUT, `${STAMP}-verify.json`), JSON.stringify({ results, feeRows }, null, 2));
  return bad;
}

// ── main ────────────────────────────────────────────────────────────────────
const password = process.env.DEMO_PASSWORD;
try {
  if (CMD === 'snapshot-content' || CMD === 'snapshot-portfolio') {
    say(`snapshot-content${COMMIT ? '' : ' (dry run)'}`); await snapshotContent({ force: true });
  } else if (CMD === 'restore-content') {
    if (!COMMIT) { say('restore-content writes to production: pass --commit'); process.exit(2); }
    say('restore-content'); await restoreContent();
  } else if (CMD === 'cleanup') {
    say(`cleanup${COMMIT ? '' : ' (dry run)'}${PURGE ? ' --purge' : ''}`); await cleanup();
  } else if (CMD === 'verify') {
    if (!password) throw new Error('DEMO_PASSWORD is required (verify signs in as each account)');
    say('verify'); process.exitCode = (await verify(password)) ? 1 : 0;
  } else if (CMD === 'setup') {
    if (!password) throw new Error('DEMO_PASSWORD is required');
    say(`setup${COMMIT ? '' : ' (dry run)'} — project ${PROJECT}, terms ${TERMS_VERSION}`);
    say('1. hand-made content snapshot'); await snapshotContent({ force: false });
    say('2. cleanup'); const { skipped } = await cleanup();
    if (skipped.length) throw new Error('cleanup found demo data touching non-demo users — stopping for a human');
    const neutral = ['bama-system', ...(await adminUids())];
    const keptCommunities = (await cfgRef.get()).get('communityIds') ?? [];
    say(`3. config/demoAccounts — uids ${DEMO_UIDS.join(', ')}; neutral ${neutral.length} (bama-system + admins); communityIds kept as they are (${keptCommunities.length})`);
    if (!COMMIT) { say('\nDry run: nothing written. Re-run with --commit.'); process.exit(0); }
    // merge: communityIds (communities made by hand for the demo accounts) are left as they are.
    await cfgRef.set({ uids: DEMO_UIDS, neutralUids: neutral, seededAt: FieldValue.serverTimestamp() }, { merge: true });
    say('4. canary'); await canary();
    say('5. accounts'); await createAccounts(password);
    for (const a of ACCOUNTS) await signIn(a.key, password);
    say('6. completed projects (hire → confirm → complete → review)');
    for (const def of COMPLETED) await seedCompleted(def);
    say('7. active project'); await seedActive();
    say('8. open project'); await seedOpen();
    say('9. direct chat'); await seedDm();
    say('10. listings'); await seedListings();
    say('12. hand-made content restore'); await restoreContent();
    await printFees();
    writeFileSync(join(OUT, `${STAMP}-setup.json`), JSON.stringify(record, null, 2));
    say('\nSTOPPED: mark the fees above paid in the admin screen, then run `verify`.');
  } else {
    console.error('usage: node scripts/demo-accounts.mjs setup|verify|cleanup|snapshot-portfolio [--commit] [--purge] [--out DIR]');
    process.exitCode = 2;
  }
} catch (e) {
  say(`\nERROR: ${e.message}`);
  process.exitCode = 1;
} finally {
  saveLog(CMD ?? 'none');
  say(`log: ${OUT}`);
  setTimeout(() => process.exit(process.exitCode ?? 0), 200);
}
