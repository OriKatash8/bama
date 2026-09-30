#!/usr/bin/env node
/**
 * READ-ONLY scan of production profiles for phone numbers and email addresses in public text
 * (Terms §6.8): users/{uid}/profile/data .bio, .equipment[], .priceList[].service.
 *
 * Uses the app's own detector (src/utils/contactFilter.ts, incl. Unicode-digit
 * normalization). Only get() — it writes nothing. Prints uid · field · snippet
 * to the terminal; do not paste the output into the repo (real numbers).
 *
 *   node --experimental-strip-types scripts/scan-contact-in-profiles.mjs
 *
 * Credentials: gcloud Application Default Credentials, like the other admin
 * scripts (gcloud auth application-default login).
 */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { findPhoneNumbers, findEmails } from '../src/utils/contactFilter.ts';

// MIRROR of EQUIPMENT_MAX (src/features/profile/utils/profileContact.ts) — KEEP IN SYNC.
const EQUIPMENT_MAX_FOR_SCAN = 15;

const db = getFirestore(initializeApp({ projectId: 'bama-af0a0' }));

const snap = await db.collectionGroup('profile').get();
let scanned = 0;
let overCap = 0;
const hits = [];

for (const d of snap.docs) {
  if (d.id !== 'data') continue;
  scanned++;
  const uid = d.ref.parent.parent?.id ?? '?';
  const p = d.data();
  const check = (field, text) => {
    if (typeof text !== 'string') return;
    for (const m of [...findPhoneNumbers(text), ...findEmails(text)]) hits.push({ uid, field, match: m, text: text.slice(0, 80) });
  };
  check('bio', p.bio);
  (Array.isArray(p.equipment) ? p.equipment : []).forEach((e, i) =>
    check(`equipment[${i}]`, typeof e === 'string' ? e : e?.name));
  (Array.isArray(p.priceList) ? p.priceList : []).forEach((e, i) => check(`priceList[${i}].service`, e?.service));
  if (Array.isArray(p.equipment) && p.equipment.length > EQUIPMENT_MAX_FOR_SCAN) overCap++;
}

console.log(`Scanned ${scanned} profiles (read-only).`);
console.log(`Profiles with more than ${EQUIPMENT_MAX_FOR_SCAN} equipment items: ${overCap}`);
console.log(`Phone numbers / email addresses found: ${hits.length}`);
for (const h of hits) console.log(`  ${h.uid} · ${h.field} · "${h.match}" · in: ${JSON.stringify(h.text)}`);
process.exit(0);
