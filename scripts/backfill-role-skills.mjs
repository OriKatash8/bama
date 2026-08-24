#!/usr/bin/env node
/**
 * Phase 5 — Backfill roleSkills onto existing professional profiles.
 * Mirrors seedRoleSkills: each legacy skill {category} -> role -> { role, specializations: ['general'] }
 * IDEMPOTENT (skips pros with roleSkills) + ADDITIVE (only writes roleSkills).
 * Run: node scripts/backfill-role-skills.mjs
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const ROLE_TO_LEGACY_CATEGORY = {
  videographer:     'Video Photographer',
  photographer:     'Still Photographer',
  editor:           'Editor',
  graphic_designer: 'Graphic Designer',
  social_media:     'Social Media',
  studio_audio:     'Studio & Audio',
  sound:            'Sound Recordist',
  lighting:         'Lighting Tech',
};
const LEGACY_TO_ROLE = Object.fromEntries(
  Object.entries(ROLE_TO_LEGACY_CATEGORY).map(([role, cat]) => [cat, role]),
);
const KNOWN_ROLES = new Set(Object.keys(ROLE_TO_LEGACY_CATEGORY));

function computeRoleSkills(skills) {
  const roles = (skills ?? [])
    .map((s) => LEGACY_TO_ROLE[s.category] ?? s.category)
    .filter((role) => KNOWN_ROLES.has(role));
  const seen = new Set();
  const out = [];
  for (const role of roles) {
    if (seen.has(role)) continue;
    seen.add(role);
    out.push({ role, specializations: ['general'] });
  }
  return out;
}

initializeApp({ projectId: 'bama-af0a0' });
const db = getFirestore();

const usersSnap = await db.collection('users').get();
console.log(`Scanning ${usersSnap.size} user docs…`);

let updated = 0, skipped = 0, noSkills = 0;
for (const doc of usersSnap.docs) {
  const data = doc.data();
  const skills = data.skills;
  const roleSkills = data.roleSkills;
  if (!Array.isArray(skills) || skills.length === 0) { noSkills++; continue; }
  if (Array.isArray(roleSkills) && roleSkills.length > 0) { skipped++; continue; }
  const computed = computeRoleSkills(skills);
  if (computed.length === 0) { skipped++; continue; }
  await doc.ref.update({ roleSkills: computed });
  console.log(`  ✓ ${doc.id}  ${JSON.stringify(computed.map((r) => r.role))}`);
  updated++;
}
console.log(`\nDone. Updated ${updated}; skipped ${skipped}; ${noSkills} non-professional docs.`);
process.exit(0);
