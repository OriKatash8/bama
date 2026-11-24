#!/usr/bin/env node
/**
 * PRODUCTION: publish the reviewed seed projects (scripts/seedProjects.json) as
 * 'open' notice-board projects, the same document the app's builder writes
 * (src/app/(client)/(tabs)/home/builder.tsx -> useProjectRequests.submit).
 *
 * THERE IS NO APPROVAL STEP in the app: once written, a project is live and the
 * onProjectCreate trigger notifies every matching REAL professional. Edit the JSON
 * first; publishing cannot be quietly undone (use removeSeedUsers.mjs).
 *
 *   node scripts/publishSeedProjects.mjs --prod            dry run (validates, prints)
 *   node scripts/publishSeedProjects.mjs --prod --commit   writes the projects
 *
 * Credentials: Application Default Credentials. isSeed:true is cleanup-only.
 */
import './lib/requireProd.mjs';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const here = dirname(fileURLToPath(import.meta.url));
const COMMIT = process.argv.includes('--commit');

// ── role / specialization ids, read straight from categories.ts (the source of truth)
const catSrc = readFileSync(join(here, '../src/features/crew/data/categories.ts'), 'utf8');
const rolesBlock = catSrc.slice(catSrc.indexOf('export const ROLES'), catSrc.indexOf('export const ROLE_TO_LEGACY_CATEGORY'));
const VALID = {};
let cur = null;
for (const line of rolesBlock.split('\n')) {
  const role = line.match(/^    id: '(\w+)'/);
  if (role) { cur = role[1]; VALID[cur] = new Set(); continue; }
  const spec = line.match(/^\s+\{ id: '(\w+)'/);
  if (spec && cur) VALID[cur].add(spec[1]);
}
const legacyBlock = catSrc.slice(catSrc.indexOf('export const ROLE_TO_LEGACY_CATEGORY'));
const LEGACY = Object.fromEntries(
  [...legacyBlock.slice(0, legacyBlock.indexOf('};')).matchAll(/^\s+(\w+):\s+'([^']+)'/gm)].map((m) => [m[1], m[2]]),
);

const { projects } = JSON.parse(readFileSync(join(here, 'seedProjects.json'), 'utf8'));

const ISO = /^\d{4}-\d{2}-\d{2}$/;
function validate(p) {
  const errs = [];
  for (const k of ['clientEmail', 'title', 'description', 'location', 'exec', 'deadline']) if (!p[k]?.trim?.()) errs.push(`missing ${k}`);
  if (!ISO.test(p.exec ?? '') || !ISO.test(p.deadline ?? '')) errs.push('exec/deadline must be YYYY-MM-DD');
  else if (p.exec > p.deadline) errs.push('exec is after deadline');
  if (!Array.isArray(p.slots) || p.slots.length === 0) errs.push('needs at least one slot');
  for (const s of p.slots ?? []) {
    if (!VALID[s.role]) errs.push(`unknown role "${s.role}"`);
    else if (s.specialization != null && !VALID[s.role].has(s.specialization)) errs.push(`unknown specialization "${s.specialization}" for ${s.role}`);
    if (!LEGACY[s.role]) errs.push(`no legacy category for ${s.role}`);
    if (!Number.isInteger(s.quantity) || s.quantity < 1) errs.push(`bad quantity for ${s.role}`);
  }
  return errs;
}

let bad = 0;
for (const p of projects) {
  const e = validate(p);
  if (e.length) { bad++; console.error(`INVALID ${p.clientEmail}: ${e.join('; ')}`); }
}
if (bad) { console.error('Fix scripts/seedProjects.json and re-run.'); process.exit(1); }

initializeApp({ projectId: 'bama-af0a0' });
const auth = getAuth();
const db = getFirestore();

const rows = [];
for (const p of projects) {
  const user = await auth.getUserByEmail(p.clientEmail).catch(() => null);
  if (!user) { console.error(`NO ACCOUNT for ${p.clientEmail}; run seedClients.mjs first.`); process.exit(1); }
  const udoc = await db.doc(`users/${user.uid}`).get();
  if (udoc.data()?.isSeed !== true) { console.error(`${p.clientEmail} is not a seed user (isSeed missing); refusing.`); process.exit(1); }

  const dup = await db.collection('projects').where('clientId', '==', user.uid).where('isSeed', '==', true).where('title', '==', p.title).get();
  if (!dup.empty) { console.log(`SKIP   already published: "${p.title}" (${dup.docs[0].id})`); rows.push([p.clientEmail, p.title, dup.docs[0].id, 'already open']); continue; }

  // createdAt: publish time, or up to 45 minutes earlier. Never in the future.
  const created = Timestamp.fromMillis(Date.now() - Math.floor(Math.random() * 45 * 60 * 1000));
  const doc = {
    clientId: user.uid,
    title: p.title.trim(),
    description: p.description,
    exec: p.exec,
    deadline: p.deadline,
    // endDateFromDeadline(): local midnight of the deadline day
    endDate: Timestamp.fromDate(new Date(`${p.deadline}T00:00:00`)),
    location: p.location,
    crewSlots: p.slots.map((s) => ({
      category: LEGACY[s.role],
      quantity: s.quantity,
      // key ABSENT for a general slot (a 'general' value could never be filled)
      ...(s.specialization ? { requiredCapability: s.specialization } : {}),
    })),
    filledSlots: [],
    status: 'open',
    createdAt: created,
    isSeed: true,
  };
  if (!COMMIT) { console.log(`WOULD  publish "${doc.title}" for ${p.clientEmail}`, JSON.stringify(doc.crewSlots)); rows.push([p.clientEmail, doc.title, '-', 'dry run']); continue; }
  const ref = await db.collection('projects').add(doc);
  console.log(`OPENED ${ref.id}  "${doc.title}"`);
  rows.push([p.clientEmail, doc.title, ref.id, 'open']);
}
console.log('\nemail | title | project id | status');
for (const r of rows) console.log(r.join(' | '));
if (!COMMIT) console.log('\n(dry run: nothing written; pass --commit to publish. Matching pros WILL be notified.)');
