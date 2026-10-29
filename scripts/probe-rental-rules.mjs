#!/usr/bin/env node
/**
 * Probe for the rentalCompanies / rentalItems rules (and their Storage folder).
 *
 * Runs THE APP'S OWN QUERIES: the specs are imported from
 * src/features/rentals/querySpecs.ts (Node type stripping), the same file the
 * hooks build their queries from. A query the app makes that is not there was
 * never probed.
 *
 * Modes:
 *   --emulator   new rules on the local emulators (auth, firestore, storage,
 *                project demo-bama). The only mode that tests ADMIN reads: it
 *                gives a throwaway emulator account the admin claim.
 *   --baseline   PRODUCTION, current (pre-deploy) rules. Every rental read is
 *                expected DENIED (no rule matches them yet), and the existing
 *                marketplace queries must still work.
 *   (default)    PRODUCTION after deploying the new rules and indexes.
 *
 * Production never gets an admin account, not even a temporary one: the
 * script refuses to set a custom claim unless it is pointed at the emulators.
 * Admin access in production is checked by hand with the real admin account.
 *
 * Production runs use the CLIENT SDK as throwaway accounts (so rules apply) and
 * the Admin SDK only to seed and remove `zzz-probe-*` scratch documents and one
 * scratch Storage file. Teardown verifies everything is gone.
 *
 * Run: node scripts/probe-rental-rules.mjs [--emulator | --baseline]
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { initializeApp } from 'firebase/app';
import {
  getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, deleteUser,
} from 'firebase/auth';
import {
  getFirestore, connectFirestoreEmulator, collection, doc, query, where, orderBy, limit, startAfter,
  getDocs, getDoc, setDoc, updateDoc, deleteDoc,
} from 'firebase/firestore';
import { getStorage, connectStorageEmulator, ref as sref, uploadBytes, getMetadata } from 'firebase/storage';
import { initializeApp as adminInit } from 'firebase-admin/app';
import { getFirestore as adminFs } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { getStorage as adminStorage } from 'firebase-admin/storage';
import {
  rentalItemsSpec, partnerCompaniesSpec, adminCompaniesSpec, adminCompanyItemsSpec, NO_PRICE_SORT,
} from '../src/features/rentals/querySpecs.ts';

const EMULATOR = process.argv.includes('--emulator');
const BASELINE = process.argv.includes('--baseline');
const MODE = EMULATOR ? 'EMULATOR (new rules)' : BASELINE ? 'PRODUCTION BASELINE (current rules)' : 'PRODUCTION (new rules)';

function parseEnv() {
  const env = {};
  for (const line of readFileSync(join(process.cwd(), '.env'), 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq > 0) env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return env;
}

let config;
if (EMULATOR) {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199';
  config = { apiKey: 'demo-key', projectId: 'demo-bama', storageBucket: 'demo-bama.appspot.com', authDomain: 'demo-bama.firebaseapp.com' };
} else {
  for (const v of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST']) {
    if (process.env[v]) { console.error(`ERROR: ${v} is set. Production modes must not touch an emulator.`); process.exit(1); }
  }
  const env = parseEnv();
  config = {
    apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.EXPO_PUBLIC_FIREBASE_APP_ID,
  };
}

const app = initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
if (EMULATOR) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
}

adminInit({ projectId: config.projectId, storageBucket: config.storageBucket });
const adb = adminFs();
const aauth = adminAuth();
const bucket = adminStorage().bucket();

const STAMP = Date.now();
const P = `zzz-probe-${STAMP}`;
const USER = { email: `probe-rental-user-${STAMP}@bama-invalid.test`, password: `Pw!${STAMP}aA` };
const ADMIN = { email: `probe-rental-admin-${STAMP}@bama-invalid.test`, password: `Pw!${STAMP}bB` };
const CO_ACTIVE = `${P}-co-active`;
const CO_INACTIVE = `${P}-co-inactive`;
const IT_VISIBLE = `${CO_ACTIVE}_1`;
const IT_ON_REQUEST = `${CO_ACTIVE}_2`;
const IT_HIDDEN = `${CO_ACTIVE}_3`;
const IT_OF_INACTIVE = `${CO_INACTIVE}_1`;
const FILE = `rentalCompanies/${CO_ACTIVE}/items/1/0-probe-thumb.webp`;
const SEARCH = 'zzzprobe';
const createdUids = [];

// ── results ─────────────────────────────────────────────────────────────────
const results = [];
function record(kind, name, expected, got) {
  const ok = expected === got;
  results.push({ kind, name, ok, expected, got });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  [${kind}] ${name}  — expected ${expected}, got ${got}`);
}
/** 'ok' | 'denied' | 'missing-index' | 'error:<code>' */
async function outcome(fn) {
  try { await fn(); return 'ok'; } catch (e) {
    const code = e?.code ?? '';
    if (code === 'permission-denied' || code === 'storage/unauthorized') return 'denied';
    if (code === 'failed-precondition' && /index/i.test(e?.message ?? '')) return 'missing-index';
    return `error:${code || e?.message}`;
  }
}

function toQuery(spec, after) {
  const cs = spec.clauses.map((c) =>
    c.kind === 'where' ? where(c.field, c.op, c.value) : c.kind === 'orderBy' ? orderBy(c.field, c.dir) : limit(c.n));
  if (after) cs.splice(spec.clauses.findIndex((c) => c.kind === 'limit'), 0, startAfter(after));
  return query(collection(db, spec.collection), ...cs);
}

/** Runs a list query; also fails it if any returned item is not what the user may see. */
async function listOutcome(spec, { check } = {}) {
  let leaked = null;
  const got = await outcome(async () => {
    const snap = await getDocs(toQuery(spec));
    if (check) leaked = snap.docs.find((d) => !check(d.data()))?.id ?? null;
  });
  return leaked ? `leaked:${leaked}` : got;
}

// ── scratch data ────────────────────────────────────────────────────────────
function company(active, name) {
  return { name, city: 'probe', active, removedAt: null, sourceType: 'manual', categoryMap: {}, createdAt: new Date() };
}
function item(companyId, over) {
  return {
    companyId, companyName: 'zzz probe', companyCity: 'probe', source: 'company', externalId: 'x',
    name: `zzz probe ${over.category}`, pricePerDay: 100, salePrice: null, sortPrice: 100, inStock: true,
    category: 'lens', active: true, visible: true, searchKeys: ['zz', 'zzz', 'zzzp', 'zzzpr', 'zzzpro', 'zzzprob', SEARCH],
    images: [], createdAt: new Date(), ...over,
  };
}
async function seed() {
  await adb.doc(`rentalCompanies/${CO_ACTIVE}`).set(company(true, 'zzz probe active'));
  await adb.doc(`rentalCompanies/${CO_INACTIVE}`).set(company(false, 'zzz probe inactive'));
  await adb.doc(`rentalItems/${IT_VISIBLE}`).set(item(CO_ACTIVE, { category: 'lens' }));
  await adb.doc(`rentalItems/${IT_ON_REQUEST}`).set(item(CO_ACTIVE, { category: 'lighting', pricePerDay: null, sortPrice: NO_PRICE_SORT }));
  await adb.doc(`rentalItems/${IT_HIDDEN}`).set(item(CO_ACTIVE, { category: 'unsorted', visible: false }));
  await adb.doc(`rentalItems/${IT_OF_INACTIVE}`).set(item(CO_INACTIVE, { category: 'lens', visible: false }));
  await bucket.file(FILE).save(Buffer.from('RIFF0000WEBP'), { resumable: false, metadata: { contentType: 'image/webp' } });
}

async function signInAs(who) {
  await signOut(auth).catch(() => {});
  await signInWithEmailAndPassword(auth, who.email, who.password);
  await auth.currentUser.getIdToken(true);
}

// ── the probe ───────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== rental rules probe — ${MODE} ===\nproject: ${config.projectId}   scratch prefix: ${P}\n`);
  await seed();
  const u = await createUserWithEmailAndPassword(auth, USER.email, USER.password);
  createdUids.push(u.user.uid);

  // Before deploy nothing matches these collections, so the app's reads are denied.
  const allow = BASELINE ? 'denied' : 'ok';
  const isVisibleItem = (d) => d.visible === true;
  const isActiveCompany = (d) => d.active === true;

  console.log('USER — the app\'s queries (signed in, not admin):');
  await signInAs(USER);
  const itemSpecs = [
    ['items: default (by name)', rentalItemsSpec()],
    ['items: category lens', rentalItemsSpec({ category: 'lens' })],
    ['items: price low→high', rentalItemsSpec({ sort: 'price_asc' })],
    ['items: price high→low', rentalItemsSpec({ sort: 'price_desc' })],
    ['items: lens + price low→high', rentalItemsSpec({ category: 'lens', sort: 'price_asc' })],
    ['items: lens + price high→low', rentalItemsSpec({ category: 'lens', sort: 'price_desc' })],
    ['items: search', rentalItemsSpec({ searchKey: SEARCH })],
    ['items: lens + search', rentalItemsSpec({ category: 'lens', searchKey: SEARCH })],
  ];
  for (const [name, spec] of itemSpecs) record('allow', name, allow, await listOutcome(spec, { check: isVisibleItem }));
  record('allow', 'companies: partner row', allow, await listOutcome(partnerCompaniesSpec(), { check: isActiveCompany }));
  record('allow', 'items: load more (startAfter page 1)', allow, await outcome(async () => {
    const spec = rentalItemsSpec({ searchKey: SEARCH, pageSize: 1 });
    const first = await getDocs(toQuery(spec));
    await getDocs(toQuery(spec, first.docs[0]));
  }));
  record('allow', 'get: visible item', allow, await outcome(() => getDoc(doc(db, 'rentalItems', IT_VISIBLE))));
  record('allow', 'get: active company', allow, await outcome(() => getDoc(doc(db, 'rentalCompanies', CO_ACTIVE))));
  record('allow', 'storage: read a synced image', allow, await outcome(() => getMetadata(sref(storage, FILE))));
  if (!BASELINE) {
    const s = await getDocs(toQuery(rentalItemsSpec({ searchKey: SEARCH })));
    const ids = s.docs.map((d) => d.id).sort().join(',');
    record('allow', 'search returns exactly the visible scratch items', [IT_VISIBLE, IT_ON_REQUEST].sort().join(','), ids);
    const d = await getDocs(toQuery(rentalItemsSpec({ searchKey: SEARCH, sort: 'price_desc' })));
    record('allow', 'search ignores sort (both scratch items, by name)', 2, d.size);
  }

  console.log('\nUSER — must be denied:');
  const deniedLists = [
    ['items: no filter at all', { collection: 'rentalItems', clauses: [{ kind: 'limit', n: 5 }] }],
    ['items: category without visible', { collection: 'rentalItems', clauses: [{ kind: 'where', field: 'category', op: '==', value: 'lens' }, { kind: 'limit', n: 5 }] }],
    ['items: visible == false', { collection: 'rentalItems', clauses: [{ kind: 'where', field: 'visible', op: '==', value: false }, { kind: 'limit', n: 5 }] }],
    ['items: one company (admin query)', adminCompanyItemsSpec(CO_ACTIVE)],
    ['companies: no filter (admin query)', adminCompaniesSpec()],
    ['companies: active == false', { collection: 'rentalCompanies', clauses: [{ kind: 'where', field: 'active', op: '==', value: false }] }],
  ];
  for (const [name, spec] of deniedLists) record('deny', name, 'denied', await listOutcome(spec));
  record('deny', 'get: hidden (unsorted) item', 'denied', await outcome(() => getDoc(doc(db, 'rentalItems', IT_HIDDEN))));
  record('deny', 'get: item of an inactive company', 'denied', await outcome(() => getDoc(doc(db, 'rentalItems', IT_OF_INACTIVE))));
  record('deny', 'get: inactive company', 'denied', await outcome(() => getDoc(doc(db, 'rentalCompanies', CO_INACTIVE))));
  record('deny', 'write: create an item', 'denied', await outcome(() => setDoc(doc(db, 'rentalItems', `${P}-forged`), item(CO_ACTIVE, { category: 'lens' }))));
  record('deny', 'write: change a visible item\'s price', 'denied', await outcome(() => updateDoc(doc(db, 'rentalItems', IT_VISIBLE), { pricePerDay: 1 })));
  record('deny', 'write: un-hide an item', 'denied', await outcome(() => updateDoc(doc(db, 'rentalItems', IT_HIDDEN), { visible: true })));
  record('deny', 'write: delete an item', 'denied', await outcome(() => deleteDoc(doc(db, 'rentalItems', IT_VISIBLE))));
  record('deny', 'write: create a company', 'denied', await outcome(() => setDoc(doc(db, 'rentalCompanies', `${P}-forged`), company(true, 'x'))));
  record('deny', 'write: activate a company', 'denied', await outcome(() => updateDoc(doc(db, 'rentalCompanies', CO_INACTIVE), { active: true })));
  record('deny', 'write: bump click counter', 'denied', await outcome(() => updateDoc(doc(db, 'rentalCompanies', CO_ACTIVE), { clicks: 999 })));
  record('deny', 'storage: upload into rentalCompanies/', 'denied', await outcome(() =>
    uploadBytes(sref(storage, `rentalCompanies/${CO_ACTIVE}/items/1/forged.webp`), new Uint8Array([1, 2, 3]), { contentType: 'image/webp' })));

  console.log('\nREGRESSION — the existing marketplace queries:');
  for (const type of ['rental', 'secondhand']) {
    record('allow', `marketplace_listings where type == ${type}`, 'ok',
      await outcome(() => getDocs(query(collection(db, 'marketplace_listings'), where('type', '==', type), limit(5)))));
  }

  console.log('\nSIGNED OUT — must be denied:');
  await signOut(auth);
  record('deny', 'signed out: items default', 'denied', await listOutcome(rentalItemsSpec()));
  record('deny', 'signed out: partner row', 'denied', await listOutcome(partnerCompaniesSpec()));
  record('deny', 'signed out: get visible item', 'denied', await outcome(() => getDoc(doc(db, 'rentalItems', IT_VISIBLE))));

  if (EMULATOR) {
    console.log('\nADMIN (emulator only) — sees everything:');
    const a = await createUserWithEmailAndPassword(auth, ADMIN.email, ADMIN.password);
    createdUids.push(a.user.uid);
    if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('refusing to set an admin claim outside the emulator');
    await aauth.setCustomUserClaims(a.user.uid, { role: 'admin' });
    await signInAs(ADMIN);
    const all = await getDocs(toQuery(adminCompaniesSpec()));
    record('admin', 'companies: all, inactive included', true, all.docs.some((d) => d.id === CO_INACTIVE));
    const its = await getDocs(toQuery(adminCompanyItemsSpec(CO_ACTIVE)));
    record('admin', 'items of a company, hidden included', 3, its.size);
    record('admin', 'get: hidden item', 'ok', await outcome(() => getDoc(doc(db, 'rentalItems', IT_HIDDEN))));
    record('admin', 'get: inactive company', 'ok', await outcome(() => getDoc(doc(db, 'rentalCompanies', CO_INACTIVE))));
    record('admin', 'write: still denied to the admin client (callables only)', 'denied',
      await outcome(() => updateDoc(doc(db, 'rentalCompanies', CO_INACTIVE), { active: true })));
  }
}

/** Accounts, user docs (onUserCreate), scratch docs and file — then re-read to verify. */
async function teardown() {
  console.log('\n=== teardown ===');
  const problems = [];
  await signOut(auth).catch(() => {});
  for (const uid of createdUids) {
    try { await aauth.deleteUser(uid); } catch (e) { if (e?.code !== 'auth/user-not-found') problems.push(`auth ${uid}: ${e?.code}`); }
  }
  if (!EMULATOR) await new Promise((r) => setTimeout(r, 4000)); // onUserCreate can land after the delete
  const docs = [
    ...createdUids.map((uid) => `users/${uid}`),
    `rentalCompanies/${CO_ACTIVE}`, `rentalCompanies/${CO_INACTIVE}`,
    `rentalItems/${IT_VISIBLE}`, `rentalItems/${IT_ON_REQUEST}`, `rentalItems/${IT_HIDDEN}`, `rentalItems/${IT_OF_INACTIVE}`,
    `rentalItems/${P}-forged`, `rentalCompanies/${P}-forged`,
  ];
  for (const p of docs) await adb.doc(p).delete();
  await bucket.deleteFiles({ prefix: `rentalCompanies/${P}`, force: true }).catch(() => {});
  for (const p of docs) if ((await adb.doc(p).get()).exists) problems.push(`${p} SURVIVED`);
  const [left] = await bucket.getFiles({ prefix: `rentalCompanies/${P}` });
  if (left.length) problems.push(`${left.length} scratch file(s) SURVIVED`);
  for (const uid of createdUids) {
    try { await aauth.getUser(uid); problems.push(`auth ${uid} SURVIVED`); } catch { /* gone */ }
  }
  console.log(problems.length ? `  CLEANUP INCOMPLETE:\n    ${problems.join('\n    ')}`
    : '  cleanup verified: accounts, user docs, scratch documents and the scratch file are gone');
  return problems;
}

let exitCode = 0;
try {
  await main();
} catch (e) {
  console.error('\nPROBE ABORTED:', e?.code ?? '', e?.message ?? e);
  exitCode = 2;
} finally {
  const problems = await teardown();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== summary (${MODE}): ${results.length - failed.length}/${results.length} as expected ===`);
  failed.forEach((r) => console.log(`   FAILED [${r.kind}] ${r.name}: expected ${r.expected}, got ${r.got}`));
  if (failed.length) exitCode = exitCode || 1;
  if (problems.length) exitCode = 3;
  process.exit(exitCode);
}
