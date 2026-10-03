// node --test scripts/__tests__/*.test.mjs
//
// The demo accounts claim "every role with every specialization". ROLES is a copy
// (a .mjs script cannot import the app's TypeScript), so this pins it to the
// source of truth, src/features/crew/data/categories.ts, read as text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ROLES, LEGACY, ROLE_SKILLS, ACCOUNTS, COMPLETED, ACTIVE, OPEN, DEMO_UIDS,
} from '../lib/demoAccountsData.mjs';

const SRC = readFileSync(new URL('../../src/features/crew/data/categories.ts', import.meta.url), 'utf8');

/** role id → specialization ids, parsed from the ROLES array in categories.ts. */
function rolesFromSource() {
  const out = {};
  const body = SRC.slice(SRC.indexOf('export const ROLES'), SRC.indexOf('export const ROLE_TO_LEGACY_CATEGORY'));
  const blocks = body.split(/\n  \{\n/).slice(1);
  for (const b of blocks) {
    const id = b.match(/^\s*id: '([a-z_]+)'/m)?.[1];
    const specs = [...b.matchAll(/\{ id: '([a-z_]+)',/g)].map((m) => m[1]);
    if (id) out[id] = specs;
  }
  return out;
}

test('every role and every specialization in categories.ts, in order', () => {
  const src = rolesFromSource();
  assert.ok(Object.keys(src).length >= 8, 'parsed the roles');
  assert.deepEqual(ROLES, src);
});

test('the legacy category names match ROLE_TO_LEGACY_CATEGORY', () => {
  for (const [role, cat] of Object.entries(LEGACY)) {
    assert.match(SRC, new RegExp(`${role}:\\s+'${cat.replace(/[&]/g, '\\$&')}'`));
  }
});

test('each account carries every role, with every specialization', () => {
  assert.equal(ROLE_SKILLS.length, Object.keys(ROLES).length);
  for (const r of ROLE_SKILLS) assert.deepEqual(r.specializations, ROLES[r.role]);
});

test('three accounts, fixed demo uids, drama-range phones, no admin anywhere', () => {
  assert.deepEqual(DEMO_UIDS, ['demo-test1', 'demo-test2', 'demo-test3']);
  for (const a of ACCOUNTS) {
    assert.match(a.phone, /^\+4477009000\d\d$/);       // Ofcom drama range 07700 900000-900999
    assert.match(a.email, /^bama\.app\.hk\+test[123]@gmail\.com$/);
    assert.equal(a.displayName, a.key);
    assert.ok(a.equipment.length >= 8);
    // profileWriteOk forbids contact details in profile text
    for (const s of [a.bio, ...a.equipment.map((e) => e.name)]) assert.doesNotMatch(s, /@|\d{7,}/);
  }
});

test('every account is reviewed by each of the other two, through a completed project', () => {
  const got = {};
  for (const p of COMPLETED) {
    for (const { pro } of p.crew) {
      assert.ok(p.reviews[pro], `${p.key} reviews ${pro}`);
      (got[pro] ??= []).push(p.client);
    }
  }
  for (const a of ACCOUNTS) {
    assert.deepEqual(got[a.key].sort(), ACCOUNTS.map((x) => x.key).filter((k) => k !== a.key).sort());
  }
});

test('the open project has a pending offer from test2 and test3; the active one is not test1\'s', () => {
  assert.equal(OPEN.client, 'test1');
  assert.deepEqual(OPEN.offers.map((o) => o.pro).sort(), ['test2', 'test3']);
  // test1 must stay deletable (deletion is blocked by an open engagement).
  assert.notEqual(ACTIVE.client, 'test1');
  assert.ok(!ACTIVE.crew.some((c) => c.pro === 'test1'));
});
