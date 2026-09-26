import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * onProjectClosed posts the closing message exactly once, only on the move into
 * completed/cancelled, from the private contact docs. Behaviour of the message
 * itself is in closingNotice.test.ts; this pins the wiring.
 */

const SRC = readFileSync(join(__dirname, '..', 'closingTrigger.ts'), 'utf8');
const INDEX = readFileSync(join(__dirname, '..', '..', 'index.ts'), 'utf8');

it('is exported, so it deploys', () => {
  expect(INDEX).toMatch(/export \* from '\.\/lifecycle\/closingTrigger';/);
});

it('fires on project updates and bails before reading anything unless it is the closing move', () => {
  expect(SRC).toMatch(/onDocumentUpdated\(\s*'projects\/\{projectId\}'/);
  const guard = SRC.indexOf('isClosingTransition(');
  expect(guard).toBeGreaterThan(-1);
  expect(guard).toBeLessThan(SRC.indexOf('.get()'));
});

it('writes to a FIXED message id with create(), so a retry or a reopen never posts twice', () => {
  expect(SRC).toMatch(/messages\/\$\{CLOSING_MESSAGE_ID\}/);
  expect(SRC).toMatch(/const CLOSING_MESSAGE_ID = 'project-closed';/);
  expect(SRC).toMatch(/\.create\(/);
  expect(SRC).not.toMatch(/messages'\)\.add\(/);
});

it('reads each number from the private contact doc', () => {
  expect(SRC).toMatch(/users\/\$\{uid\}\/private\/contact/);
});

it('builds the message with the shared pure builder', () => {
  expect(SRC).toMatch(/from '\.\/closingNotice'/);
  expect(SRC).toMatch(/buildClosingNotice\(/);
});

it('updates the chat preview and unread counts only after the message exists', () => {
  const create = SRC.indexOf('.create(');
  const preview = SRC.indexOf('lastMessage');
  expect(preview).toBeGreaterThan(create);
  expect(SRC).toMatch(/unreadCount\.\$\{uid\}/);
});
