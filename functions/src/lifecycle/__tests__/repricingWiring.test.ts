import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * createPaymentRequest / respondToPaymentRequest enforce the policy in the right
 * place. Behaviour is in repricingPolicy.test.ts and the emulator probe
 * (scripts/probe-repricing.mjs); this pins the ordering.
 */

const SRC = readFileSync(join(__dirname, '..', 'repricing.ts'), 'utf8');
const RULES = readFileSync(join(__dirname, '..', '..', '..', '..', 'firestore.rules'), 'utf8');
const create = SRC.slice(SRC.indexOf('export const createPaymentRequest'), SRC.indexOf('export const respondToPaymentRequest'));
const respond = SRC.slice(SRC.indexOf('export const respondToPaymentRequest'));

it('create checks the 1–50000 range before anything else is read or written', () => {
  const range = create.indexOf('isOfferPriceValid(proposedAmount)');
  expect(range).toBeGreaterThan(-1);
  expect(range).toBeLessThan(create.indexOf('loadParty('));
});

it('create reads the history through the transaction and decides before writing', () => {
  const tx = create.slice(create.indexOf('db.runTransaction'));
  const read = tx.search(/tx\.get\(\s*db\.collection\(`projects\/\$\{projectId\}\/paymentRequests`\)/);
  const decide = tx.indexOf('decideNewPriceRequest(');
  const refuse = tx.indexOf('if (!decision.allowed)');
  const write = tx.search(/tx\.(set|update)\(/);
  expect(read).toBeGreaterThan(-1);
  expect(read).toBeLessThan(decide);
  expect(decide).toBeLessThan(refuse);
  expect(refuse).toBeLessThan(write);
  expect(create).not.toMatch(/db\.batch\(\)/);
});

it('create scopes the history to the role being repriced', () => {
  expect(create).toMatch(/sameRole\(roleKey, roleKeyOf\(r\)\)/);
});

it('respond re-checks the range before repricing an offer', () => {
  const range = respond.indexOf('isOfferPriceValid(newAmount)');
  expect(range).toBeGreaterThan(-1);
  expect(range).toBeLessThan(respond.search(/price: newAmount|bundlePrice: newAmount/));
});

it('clients cannot create paymentRequests directly', () => {
  const block = RULES.slice(RULES.indexOf('match /paymentRequests/{paymentRequestId}'));
  expect(block.slice(0, block.indexOf('allow read'))).toMatch(/allow create: if false;/);
  expect(RULES).not.toMatch(/INTERIM/);
});

it('create pushes the counterparty, only after the transaction committed', () => {
  const tx = create.indexOf('db.runTransaction');
  const push = create.search(/await notify\(\{\s*userId: toUserId,/);
  expect(push).toBeGreaterThan(tx);
  // After the transaction's closing, not inside its callback.
  expect(create.slice(tx, push)).toMatch(/\n  \}\);\n/);
  expect(create.slice(push)).toMatch(/type: 'system'/);
});
