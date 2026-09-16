import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ONE PROJECT, ONE GROUP CHAT — enforced by the build, because the failure is silent.
 *
 * `commitHire` used to decide `isFirstHire` from a project snapshot read before the
 * write, then commit through `db.batch()`. A batch is atomic but NOT isolated: two
 * `hireProfessional` calls that overlap both saw `chatId` absent, each created a
 * chat, and the later `projUpdate.chatId` won. The loser stayed in `chats` with the
 * client still in `members`, so the client simply had two chats for one project and
 * nothing errored.
 *
 * Reachable by ordinary use: one professional sending two offers on one project
 * leaves two live Accept buttons, and the second tap lands while the first call is
 * still running.
 *
 * The rule is therefore structural — the chat decision must be made from a read
 * taken INSIDE the transaction that writes it. A reviewer cannot see that by
 * looking at the chat write alone, and a grep only helps if someone remembers to
 * grep. This is that grep, run by CI.
 */

const HIRE_SRC = readFileSync(join(__dirname, '..', 'hire.ts'), 'utf8');

it('commits the hire through a transaction, never a bare batch', () => {
  // A batch would re-open the read-modify-write window this test exists to close.
  expect(HIRE_SRC).toContain('db.runTransaction');
  expect(HIRE_SRC).not.toMatch(/db\.batch\(\)/);
});

it('re-reads the project inside the transaction before deciding about the chat', () => {
  // The pre-read snapshot is stale by the time the write lands under concurrency.
  expect(HIRE_SRC).toMatch(/tx\.get\(\s*projSnap\.ref\s*\)/);
});

it('never derives isFirstHire from the stale pre-transaction snapshot', () => {
  // This is the exact line that shipped the bug.
  expect(HIRE_SRC).not.toMatch(/isFirstHire\s*=\s*!project\.chatId/);

  const match = HIRE_SRC.match(/const isFirstHire\s*=\s*([^;]+);/);
  expect(match).not.toBeNull();
  // Whatever it reads, it must come from the transaction's own view of the project.
  expect(match![1]).toMatch(/fresh/i);
});
