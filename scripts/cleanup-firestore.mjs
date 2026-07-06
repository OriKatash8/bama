#!/usr/bin/env node
/**
 * Firestore test-data cleanup script
 *
 * What it does:
 *   1. Clears the `skills` array on every users/{uid}/profile/data document
 *   2. Deletes ALL documents in the `projects` collection
 *   3. Deletes ALL documents in the `priceOffers` collection
 *   4. Deletes all `chats` documents where type !== 'dm'
 *      (message subcollections inside deleted chats are left as orphans — harmless)
 *
 * Usage:
 *   node scripts/cleanup-firestore.mjs
 *
 * Credentials are read from .env — add these two keys (gitignored, never logged):
 *   FIREBASE_CLEANUP_EMAIL=your@email.com
 *   FIREBASE_CLEANUP_PASSWORD=yourpassword
 *
 * Falls back to interactive prompt if either key is missing.
 * Reads Firebase config from .env (EXPO_PUBLIC_FIREBASE_* keys).
 * Authentication is required because Firestore rules demand request.auth != null.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function parseEnv() {
  const text = readFileSync(join(process.cwd(), '.env'), 'utf8');
  const env = {};
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return env;
}

const env = parseEnv();
const PROJECT_ID = env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
const API_KEY = env.EXPO_PUBLIC_FIREBASE_API_KEY;

if (!PROJECT_ID || !API_KEY) {
  console.error('Missing EXPO_PUBLIC_FIREBASE_PROJECT_ID or EXPO_PUBLIC_FIREBASE_API_KEY in .env');
  process.exit(1);
}

const FS_ROOT = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

async function signIn(email, password) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`Sign-in failed: ${data.error?.message}`);
  return data.idToken;
}

// ---------------------------------------------------------------------------
// Firestore helpers
// ---------------------------------------------------------------------------

async function listCollection(token, collPath) {
  const docs = [];
  let pageToken;
  do {
    const qs = pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : '';
    const res = await fetch(`${FS_ROOT}/${collPath}${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 404) break; // collection doesn't exist
    if (!res.ok) {
      const err = await res.json();
      throw new Error(`List "${collPath}" failed: ${err.error?.message}`);
    }
    const data = await res.json();
    if (data.documents) docs.push(...data.documents);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return docs;
}

async function deleteDocument(token, docResourceName) {
  const res = await fetch(`https://firestore.googleapis.com/v1/${docResourceName}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) {
    const err = await res.json();
    throw new Error(`Delete "${docResourceName}" failed: ${err.error?.message}`);
  }
}

/**
 * Sets skills=[] on an existing document.
 * Does nothing if the document doesn't exist (currentDocument.exists=true precondition).
 * Returns true if updated, false if skipped.
 */
async function clearSkillsField(token, docResourceName) {
  const url =
    `https://firestore.googleapis.com/v1/${docResourceName}` +
    `?updateMask.fieldPaths=skills&currentDocument.exists=true`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields: { skills: { arrayValue: { values: [] } } } }),
  });
  if (!res.ok) {
    const err = await res.json();
    const status = err.error?.status ?? '';
    if (status === 'FAILED_PRECONDITION' || status === 'NOT_FOUND' || res.status === 404) {
      return false; // document doesn't exist — skip
    }
    throw new Error(`Clear skills on "${docResourceName}" failed: ${err.error?.message}`);
  }
  return true;
}

function getStringField(doc, field) {
  return doc.fields?.[field]?.stringValue;
}

// ---------------------------------------------------------------------------
// Prompt helper
// ---------------------------------------------------------------------------

async function promptLine(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans); }));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Prefer .env keys so credentials never appear in shell history or process list
  let email = env.FIREBASE_CLEANUP_EMAIL ?? '';
  let password = env.FIREBASE_CLEANUP_PASSWORD ?? '';
  if (!email) email = await promptLine('Firebase email: ');
  if (!password) password = await promptLine('Firebase password: ');

  console.log('\nSigning in...');
  const token = await signIn(email.trim(), password.trim());
  console.log('✓ Authenticated\n');

  // 1. Clear skills on all user profiles
  console.log('1. Clearing skills from user profiles...');
  const users = await listCollection(token, 'users');
  let skillsCleared = 0;
  for (const userDoc of users) {
    const uid = userDoc.name.split('/').pop();
    const docResource =
      `projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}/profile/data`;
    const cleared = await clearSkillsField(token, docResource);
    if (cleared) {
      skillsCleared++;
      console.log(`  ✓ Cleared skills — user ${uid}`);
    }
  }
  console.log(`  → ${skillsCleared}/${users.length} profile(s) had skills\n`);

  // 2. Delete all projects
  console.log('2. Deleting all projects...');
  const projects = await listCollection(token, 'projects');
  for (const p of projects) {
    await deleteDocument(token, p.name);
    console.log(`  ✓ Deleted project ${p.name.split('/').pop()}`);
  }
  console.log(`  → ${projects.length} project(s) deleted\n`);

  // 3. Delete all priceOffers
  console.log('3. Deleting all priceOffers...');
  const offers = await listCollection(token, 'priceOffers');
  for (const o of offers) {
    await deleteDocument(token, o.name);
    console.log(`  ✓ Deleted offer ${o.name.split('/').pop()}`);
  }
  console.log(`  → ${offers.length} offer(s) deleted\n`);

  // 4. Delete non-DM chats (keep type=='dm')
  console.log('4. Deleting non-DM chats...');
  const chats = await listCollection(token, 'chats');
  let deletedChats = 0;
  let keptDMs = 0;
  for (const c of chats) {
    const type = getStringField(c, 'type');
    if (type === 'dm') {
      keptDMs++;
    } else {
      await deleteDocument(token, c.name);
      deletedChats++;
      console.log(`  ✓ Deleted chat ${c.name.split('/').pop()} (type="${type ?? 'unknown'}")`);
    }
  }
  console.log(`  → ${deletedChats} non-DM chat(s) deleted, ${keptDMs} DM(s) kept\n`);

  console.log('✅ Cleanup complete!');
  console.log('   Note: message subcollections inside deleted chats are orphaned but harmless.');
  console.log('   Note: missions/paymentRequests inside deleted projects are orphaned but harmless.');
}

main().catch((err) => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
