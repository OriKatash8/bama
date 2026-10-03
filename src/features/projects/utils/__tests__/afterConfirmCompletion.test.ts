import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterConfirmCompletion } from '../completion';

/**
 * After "confirm completion", the screen follows the project as the server now
 * has it. A disputed engagement keeps it open: no review flow, nothing marked
 * reviewed (reviews need a completed project and would all be refused, while the
 * project was still marked reviewed — those reviews lost for good).
 */

it('a project still open (a disputed engagement) goes to "disputed", reviewed or not', () => {
  expect(afterConfirmCompletion('open', false)).toBe('disputed');
  expect(afterConfirmCompletion('in_progress', false)).toBe('disputed');
  expect(afterConfirmCompletion('open', true)).toBe('disputed');
  expect(afterConfirmCompletion(undefined, false)).toBe('disputed');
});

it('a completed project opens the review flow, or just closes if already reviewed', () => {
  expect(afterConfirmCompletion('completed', false)).toBe('review');
  expect(afterConfirmCompletion('completed', true)).toBe('done');
});

describe('wiring in project-details handleConfirmComplete', () => {
  const src = readFileSync(join(__dirname, '..', '..', '..', '..', 'app', '(client)', 'chat', 'project-details.tsx'), 'utf8');
  const fn = src.slice(src.indexOf('async function handleConfirmComplete'), src.indexOf('async function handleMarkEngagementComplete'));

  it('never forces the status to completed on screen', () => {
    expect(fn).not.toMatch(/status: 'completed'/);
  });

  it('the not-yet-reviewed path returns on "disputed" BEFORE marking reviews pending or opening the review flow', () => {
    const guard = fn.indexOf("if (afterConfirmCompletion(fresh.status, false) === 'disputed') {");
    expect(guard).toBeGreaterThan(-1);
    const after = fn.slice(guard);
    const ret = after.indexOf('return;');
    expect(ret).toBeGreaterThan(-1);
    expect(ret).toBeLessThan(after.indexOf('reviewsCompleted: false'));
    expect(ret).toBeLessThan(after.indexOf('setShowReviewFlow(true)'));
  });

  it('the already-reviewed path also decides from the server status', () => {
    expect(fn).toMatch(/afterConfirmCompletion\(fresh\.status, true\)/);
  });
});
