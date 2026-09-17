import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * THE REVIEW CALLABLES' ORDER OF CHECKS, enforced on the source.
 *
 * Each of these guards fails silently if it moves after the write it protects:
 * the write lands, and the refusal that follows changes nothing. The callables
 * themselves are exercised against the emulator by
 * scripts/probe-candidate-review.mjs; this pins the ordering in CI.
 */

const SRC = readFileSync(join(__dirname, '..', 'candidates.ts'), 'utf8');
const COMPLETION = readFileSync(join(__dirname, '..', 'completion.ts'), 'utf8');

const body = (name: string) => {
  const start = SRC.indexOf(`export const ${name} = onCall`);
  expect(start).toBeGreaterThan(-1);
  const next = SRC.indexOf('\nexport ', start + 1);
  return SRC.slice(start, next === -1 ? undefined : next);
};
const before = (text: string, a: string | RegExp, b: string | RegExp) => {
  const ia = typeof a === 'string' ? text.indexOf(a) : text.search(a);
  const ib = typeof b === 'string' ? text.indexOf(b) : text.search(b);
  expect(ia).toBeGreaterThan(-1);
  expect(ib).toBeGreaterThan(-1);
  expect(ia).toBeLessThan(ib);
};

it('only the project client can call either decision, checked before anything else', () => {
  expect(SRC).toMatch(/project\.clientId !== uid[\s\S]*permission-denied/);
  for (const name of ['confirmCandidate', 'rejectCandidate']) {
    const b = body(name);
    before(b, 'loadAsClient(', 'requireUnderReview(');
  }
});

it('confirm refuses while a price change is pending, before writing review', () => {
  const b = body('confirmCandidate');
  before(b, 'requireUnderReview(', "'price-change-pending'");
  before(b, "'price-change-pending'", "review: 'confirmed'");
});

it("reject releases only a plain 'hired' engagement, checked before releaseEngagement (C6)", () => {
  const b = body('rejectCandidate');
  expect(b).toMatch(/engagementStatus !== 'hired'[\s\S]*'engagement-not-open'/);
  before(b, "'engagement-not-open'", 'releaseEngagement(');
  expect(b).toMatch(/releaseEngagement\(projectId, proId, 'candidate_rejected'\)/);
});

it('the rejection reason goes to a private DM, never the group chat', () => {
  const b = body('rejectCandidate');
  expect(b).toMatch(/sendBamaSystemDM\(db, proId,/);
  expect(b).not.toMatch(/chats\/\$\{/);
});

it('both decisions re-evaluate activation afterwards', () => {
  for (const name of ['confirmCandidate', 'rejectCandidate']) {
    before(body(name), /batch\.commit\(\)|releaseEngagement\(/, 'maybeActivateProject(projectId)');
  }
});

it('maybeActivateProject decides inside a transaction, all reads before any write', () => {
  const start = SRC.indexOf('export async function maybeActivateProject');
  const fn = SRC.slice(start);
  expect(fn).toMatch(/db\.runTransaction/);
  const firstWrite = fn.search(/tx\.(update|set)\(/);
  const lastRead = Math.max(...[...fn.matchAll(/tx\.get\(/g)].map((m) => m.index ?? -1));
  expect(firstWrite).toBeGreaterThan(-1);
  expect(lastRead).toBeLessThan(firstWrite);
  expect(fn).toMatch(/decideActivation\(project, offers\)/);
});

it('C6: both completion paths log a completion under review, after their writes', () => {
  expect(COMPLETION.match(/warnIfCompletedUnderReview\(/g)?.length).toBe(2);
});
