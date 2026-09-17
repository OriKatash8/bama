import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * EVERY OFFER A HIRE ACCEPTS STARTS UNDER THE CLIENT'S REVIEW.
 *
 * The review card finds its rows by `review === 'pending'` on accepted offers.
 * An accept write that forgets the flag is silent — the hire works, the card
 * simply never shows that professional — so the rule is checked on the source,
 * like hireAtomicity.test.ts.
 */

const SRC = readFileSync(join(__dirname, '..', 'hire.ts'), 'utf8');

it("REVIEW_PENDING is the literal 'pending' the client type and card expect", () => {
  expect(SRC).toMatch(/const REVIEW_PENDING = 'pending';/);
});

it('every accept write carries review: REVIEW_PENDING', () => {
  const accepts = SRC.match(/\{\s*status:\s*'accepted'[^}]*\}/g) ?? [];
  // The single offer, the bundle, and each of the bundle's component offers.
  expect(accepts).toHaveLength(3);
  for (const write of accepts) expect(write).toMatch(/review:\s*REVIEW_PENDING/);
});

it('the flag is written inside the accept closures, not after the transaction', () => {
  const offer = SRC.slice(SRC.indexOf('async function prepareOffer'), SRC.indexOf('async function prepareBundle'));
  const bundle = SRC.slice(SRC.indexOf('async function prepareBundle'), SRC.indexOf('export const hireProfessional'));
  expect(offer).toMatch(/acceptWrites[\s\S]*review:\s*REVIEW_PENDING/);
  expect(bundle).toMatch(/acceptWrites[\s\S]*bSnap\.ref,\s*\{[^}]*review:\s*REVIEW_PENDING/);
  expect(bundle).toMatch(/offerIds\.forEach[^\n]*review:\s*REVIEW_PENDING/);
});
