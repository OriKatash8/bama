#!/usr/bin/env node
/**
 * Probe for storage.rules.
 *
 * WHY THIS EXISTS. There are eleven probes for firestore.rules and none for
 * Storage, which until now was a single `allow write: if request.auth != null`
 * over `/{allPaths=**}` — every signed-in account could create, update and
 * DELETE any object in the bucket. The replacement is 13 path blocks with three
 * different kinds of guard, and the two bugs found by hand while writing it
 * (Storage assigns application/octet-stream to an undeclared upload, so a strict
 * contentType check rejects real images; and getDownloadURL needs READ access,
 * so admin-only evidence broke the reporter's own upload) are exactly the kind
 * that a probe catches and a reading does not.
 *
 * Runs against the STORAGE + FIRESTORE + AUTH emulators with whatever
 * storage.rules currently says. Nothing here touches production.
 *
 * Firestore matters: isChatMember() and the marketplace delete rule call
 * firestore.get() from inside storage.rules, so the Storage emulator must be
 * able to reach the Firestore emulator. Both are seeded below with the Admin
 * SDK, which bypasses rules.
 *
 * The ALLOWED half carries more weight than the DENIED half. No hole here has
 * been exploited, while every upload path is shipped behaviour — a false denial
 * silently breaks avatars, chat media or listings for real users, which is how
 * the two bugs above surfaced.
 *
 * ONE COMMAND — starts the emulators, runs this, shuts them down:
 *
 *   npx firebase emulators:exec --only storage,firestore,auth --project bama-af0a0 \
 *     "node scripts/probe-storage-rules.mjs"
 *
 * `emulators:start` also works but is a FOREGROUND server: it holds the terminal
 * until you stop it, so the probe needs a second one. Pasting both into the same
 * shell just queues the probe behind an emulator that never exits.
 */

import { initializeApp as initAdmin } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { getStorage as getAdminStorage } from 'firebase-admin/storage';
import { initializeApp } from 'firebase/app';
import {
  getStorage, connectStorageEmulator, ref, uploadBytes, getDownloadURL, deleteObject,
} from 'firebase/storage';
import {
  getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
} from 'firebase/auth';

const ST_PORT = process.env.ST_PORT ?? '9199';
const FS_PORT = process.env.FS_PORT ?? '8080';
const AUTH_PORT = process.env.AUTH_PORT ?? '9099';
process.env.FIRESTORE_EMULATOR_HOST ??= `127.0.0.1:${FS_PORT}`;
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= `127.0.0.1:${AUTH_PORT}`;
process.env.STORAGE_EMULATOR_HOST ??= `http://127.0.0.1:${ST_PORT}`;
const PROJECT = 'bama-af0a0';
const BUCKET = 'bama-af0a0.firebasestorage.app';

const app = initAdmin({ projectId: PROJECT, storageBucket: BUCKET });
const adminDb = getAdminFirestore(app);
const adminBucket = getAdminStorage(app).bucket(BUCKET);

const clientApp = initializeApp(
  { apiKey: 'emulator-key', projectId: PROJECT, storageBucket: BUCKET },
  'probe-storage',
);
const storage = getStorage(clientApp);
const auth = getAuth(clientApp);
connectStorageEmulator(storage, '127.0.0.1', Number(ST_PORT));
connectAuthEmulator(auth, `http://127.0.0.1:${AUTH_PORT}`, { disableWarnings: true });

const PW = 'probe-password-123';
const rows = [];

async function ensureUser(label) {
  const email = `${label}@probe.invalid`;
  let uid;
  try {
    uid = (await createUserWithEmailAndPassword(auth, email, PW)).user.uid;
  } catch {
    uid = (await signInWithEmailAndPassword(auth, email, PW)).user.uid;
  }
  // Every rule that gates on verified() lives in firestore.rules, not here, but
  // sign-in providers differ and emulator accounts arrive unverified — Storage
  // rules never check email_verified, so nothing below depends on it.
  await signOut(auth);
  return uid;
}
async function as(label) {
  await signOut(auth).catch(() => {});
  await signInWithEmailAndPassword(auth, `${label}@probe.invalid`, PW);
}

const OWNER = await ensureUser('st-owner');
const OTHER = await ensureUser('st-other');

const CHAT = 'probe-storage-chat';
const LISTING = 'probe-storage-listing';
const REPORT = 'probe-storage-report';

/** A tiny PNG. Content is irrelevant to rules; the declared type and size are not. */
const png = () => new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: 'image/png' });
const mp4 = () => new Blob([new Uint8Array(64)], { type: 'video/mp4' });
const m4a = () => new Blob([new Uint8Array(64)], { type: 'audio/mp4' });
const html = () => new Blob(['<script>alert(1)</script>'], { type: 'text/html' });
/** 11MB — over the 10MB image cap. */
const hugeImage = () => new Blob([new Uint8Array(11 * 1024 * 1024)], { type: 'image/png' });
/** An upload that declares nothing, which Storage stores as octet-stream. */
const undeclared = () => new Blob([new Uint8Array(8)]);

/**
 * Known state before EVERY attempt, rules-exempt.
 *
 * OWNER is a member of CHAT and the poster of LISTING; OTHER is neither. The
 * seeded objects exist so that "another user cannot DELETE this" is a real
 * denial rather than a miss on a nonexistent file.
 */
async function reseed() {
  await adminDb.doc(`chats/${CHAT}`).set({ type: 'group', members: [OWNER] });
  await adminDb.doc(`marketplace_listings/${LISTING}`).set({ posterId: OWNER, status: 'available' });
  for (const path of [
    `avatars/${OWNER}`,
    `portfolio/${OWNER}/seeded.png`,
    `marketplace/${LISTING}/seeded.png`,
    `reports/${REPORT}/evidence/${OWNER}/seeded.png`,
  ]) {
    await adminBucket.file(path).save(Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
      contentType: 'image/png',
    });
  }
}

async function attempt(section, name, identity, expected, run) {
  await reseed();
  await as(identity);
  let allowed = true;
  let error = '';
  try { await run(); } catch (e) { allowed = false; error = e.code ?? String(e.message ?? e); }
  rows.push({ section, name, identity, expected, allowed, error });
}

const put = (path, blob) => uploadBytes(ref(storage, path), blob);

// ── avatars/{uid} ───────────────────────────────────────────────────────────
await attempt('avatars', 'a. owner uploads their avatar', 'st-owner', true,
  () => put(`avatars/${OWNER}`, png()));
await attempt('avatars', 'b. an undeclared upload still works (octet-stream)', 'st-owner', true,
  () => put(`avatars/${OWNER}`, undeclared()));
await attempt('avatars', 'c. another user CANNOT overwrite it', 'st-other', false,
  () => put(`avatars/${OWNER}`, png()));
await attempt('avatars', 'd. another user CANNOT delete it', 'st-other', false,
  () => deleteObject(ref(storage, `avatars/${OWNER}`)));
await attempt('avatars', 'e. an 11MB image is rejected', 'st-owner', false,
  () => put(`avatars/${OWNER}`, hugeImage()));
await attempt('avatars', 'f. a declared text/html is rejected', 'st-owner', false,
  () => put(`avatars/${OWNER}`, html()));

// ── portfolio/{uid}/{file} ──────────────────────────────────────────────────
await attempt('portfolio', 'g. owner uploads an image', 'st-owner', true,
  () => put(`portfolio/${OWNER}/a.png`, png()));
await attempt('portfolio', 'h. owner uploads a video', 'st-owner', true,
  () => put(`portfolio/${OWNER}/a.mp4`, mp4()));
await attempt('portfolio', 'i. owner deletes their own asset', 'st-owner', true,
  () => deleteObject(ref(storage, `portfolio/${OWNER}/seeded.png`)));
await attempt('portfolio', 'j. another user CANNOT upload into it', 'st-other', false,
  () => put(`portfolio/${OWNER}/evil.png`, png()));
await attempt('portfolio', 'k. another user CANNOT delete from it', 'st-other', false,
  () => deleteObject(ref(storage, `portfolio/${OWNER}/seeded.png`)));

// ── chat media ──────────────────────────────────────────────────────────────
await attempt('chat', 'l. a member sends an image', 'st-owner', true,
  () => put(`chat-images/${CHAT}/1.jpg`, png()));
await attempt('chat', 'm. a NON-member cannot', 'st-other', false,
  () => put(`chat-images/${CHAT}/2.jpg`, png()));
await attempt('chat', 'n. a member sends a voice note', 'st-owner', true,
  () => put(`chat-audio/${CHAT}/1.m4a`, m4a()));
await attempt('chat', 'o. a NON-member cannot', 'st-other', false,
  () => put(`chat-audio/${CHAT}/2.m4a`, m4a()));
await attempt('chat', 'p. owner uploads their own chat video', 'st-owner', true,
  () => put(`chat-videos/${OWNER}/1.mp4`, mp4()));
await attempt('chat', 'q. another user CANNOT use their folder', 'st-other', false,
  () => put(`chat-videos/${OWNER}/2.mp4`, mp4()));

// ── report evidence ─────────────────────────────────────────────────────────
// r/s are the regression guard for the bug that made every non-admin report
// fail: the upload succeeded and then getDownloadURL was denied.
await attempt('reports', 'r. reporter uploads evidence', 'st-owner', true,
  () => put(`reports/${REPORT}/evidence/${OWNER}/1.png`, png()));
await attempt('reports', 's. reporter reads their own evidence URL', 'st-owner', true,
  () => getDownloadURL(ref(storage, `reports/${REPORT}/evidence/${OWNER}/seeded.png`)));
await attempt('reports', 't. another user CANNOT read it', 'st-other', false,
  () => getDownloadURL(ref(storage, `reports/${REPORT}/evidence/${OWNER}/seeded.png`)));
await attempt('reports', 'u. another user CANNOT upload under that uid', 'st-other', false,
  () => put(`reports/${REPORT}/evidence/${OWNER}/evil.png`, png()));

// ── marketplace ─────────────────────────────────────────────────────────────
// Create is deliberately open to any signed-in user: useCreateListing uploads
// BEFORE the listing document exists, so there is nothing to check against.
await attempt('marketplace', 'v. any signed-in user may upload (create path)', 'st-other', true,
  () => put(`marketplace/${LISTING}/1.png`, png()));
await attempt('marketplace', 'w. the poster deletes their image', 'st-owner', true,
  () => deleteObject(ref(storage, `marketplace/${LISTING}/seeded.png`)));
await attempt('marketplace', 'x. a non-poster CANNOT delete it', 'st-other', false,
  () => deleteObject(ref(storage, `marketplace/${LISTING}/seeded.png`)));

// ── admin-only and unlisted ─────────────────────────────────────────────────
await attempt('other', 'y. a non-admin CANNOT upload a course video', 'st-owner', false,
  () => put(`courses/${OWNER}/1.mp4`, mp4()));
await attempt('other', 'z. an unlisted prefix is denied outright', 'st-owner', false,
  () => put('not-a-real-prefix/1.png', png()));

// ── Report ──────────────────────────────────────────────────────────────────
let mismatches = 0;
for (const section of [...new Set(rows.map((r) => r.section))]) {
  console.log(`\n${section.toUpperCase()}`);
  for (const r of rows.filter((x) => x.section === section)) {
    const ok = r.allowed === r.expected;
    if (!ok) mismatches++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${r.name} — ${r.allowed ? 'allowed' : `denied (${r.error})`}`);
  }
}
console.log(`\n${rows.length} cases, ${mismatches} not as expected`);
await signOut(auth).catch(() => {});
process.exit(mismatches === 0 ? 0 : 1);
