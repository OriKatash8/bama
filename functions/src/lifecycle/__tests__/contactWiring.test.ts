import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * getContactPhone decides with the shared policy and reads the right things.
 * Behaviour is in contactPolicy.test.ts; this pins the wiring.
 */

const SRC = readFileSync(join(__dirname, '..', 'contact.ts'), 'utf8');
const INDEX = readFileSync(join(__dirname, '..', '..', 'index.ts'), 'utf8');
const call = SRC.slice(SRC.indexOf('export const getContactPhone'));

it('is exported, so it deploys', () => {
  expect(INDEX).toMatch(/export \* from '\.\/lifecycle\/contact';/);
});

it('requires a signed-in caller before reading anything', () => {
  const auth = call.indexOf('requireAuth(');
  expect(auth).toBeGreaterThan(-1);
  expect(auth).toBeLessThan(call.indexOf('.get()'));
});

it('reads the engagement of the PRO — the target when the client asks, the caller when a pro asks', () => {
  expect(call).toMatch(/const proId = uid === clientId \? userId : uid;/);
  expect(call).toMatch(/feeRef\(projectId, proId\)\.get\(\)/);
});

it('decides with the shared policy, and refuses before the number is read', () => {
  expect(SRC).toMatch(/from '\.\/contactPolicy'/);
  const decide = call.indexOf('canRevealPhone(');
  const refuse = call.indexOf("'permission-denied'");
  const read = call.indexOf('private/contact');
  expect(decide).toBeGreaterThan(-1);
  expect(decide).toBeLessThan(refuse);
  expect(refuse).toBeLessThan(read);
  expect(SRC).not.toMatch(/'completed'\s*,\s*'disputed'/);
});

it('reads the number from the private doc, never the public user doc', () => {
  expect(call).toMatch(/db\.doc\(`users\/\$\{userId\}\/private\/contact`\)\.get\(\)/);
  expect(call).not.toMatch(/db\.doc\(`users\/\$\{userId\}`\)/);
});
