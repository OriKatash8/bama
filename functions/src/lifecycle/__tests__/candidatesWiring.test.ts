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
  // Stop at the next top-level declaration OR the doc comment in front of it, so
  // the next function's comment is not read as part of this body.
  const ends = ['\nexport ', '\n/**', '\nasync function ', '\nfunction ']
    .map((m) => SRC.indexOf(m, start + 1)).filter((i) => i !== -1);
  return SRC.slice(start, ends.length ? Math.min(...ends) : undefined);
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
  expect(SRC).toMatch(/async function requirePlainHire[\s\S]*?engagementStatus !== 'hired'[\s\S]*?'engagement-not-open'/);
  const b = body('rejectCandidate');
  before(b, 'requirePlainHire(', 'releaseEngagement(');
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

describe('item 3: the professional side', () => {
  it('both professional callables require a professional on the project who is not its client', () => {
    expect(SRC).toMatch(/async function loadAsCandidate[\s\S]*project\.clientId === uid \|\| !\(\(project\.professionalIds[\s\S]*permission-denied/);
    for (const name of ['acknowledgeCandidacy', 'declineCandidacy']) {
      before(body(name), 'loadAsCandidate(uid', 'requireUnderReview(projectId, uid)');
    }
  });

  it('declineCandidacy is guarded like a rejection, then releases with its own reason', () => {
    const b = body('declineCandidacy');
    before(b, 'requireUnderReview(', 'requirePlainHire(');
    before(b, 'requirePlainHire(', 'releaseEngagement(');
    expect(b).toMatch(/releaseEngagement\(projectId, uid, 'candidate_declined'\)/);
    before(b, 'releaseEngagement(', 'closePendingPriceChanges(projectId, uid)');
    before(b, 'closePendingPriceChanges(', 'maybeActivateProject(projectId)');
  });

  it('acknowledgeCandidacy only records the acknowledgement — never the client\'s review', () => {
    const b = body('acknowledgeCandidacy');
    expect(b).toMatch(/proAccepted: true, proAcceptedAt: FieldValue\.serverTimestamp\(\)/);
    expect(b).not.toMatch(/review:/);
    expect(b).not.toMatch(/maybeActivateProject|releaseEngagement/);
  });

  it('rejectCandidate still shares the same guards', () => {
    const b = body('rejectCandidate');
    before(b, 'requirePlainHire(', 'releaseEngagement(');
    expect(b).toMatch(/closePendingPriceChanges\(projectId, proId\)/);
  });

  const REMOVAL = readFileSync(join(__dirname, '..', 'removal.ts'), 'utf8');
  const release = REMOVAL.slice(REMOVAL.indexOf('export async function releaseEngagement'));

  it('releaseEngagement releases bundles as well as offers', () => {
    expect(release).toMatch(/collection\('bundleOffers'\)[\s\S]*status', '==', 'accepted'/);
    expect(release).toMatch(/bundlesSnap\.docs\.forEach\(\(d\) => batch\.update\(d\.ref, \{ status: 'removed' \}\)\)/);
  });

  it('pushes the client only for a decline, and only after the batch commits', () => {
    const commit = release.indexOf('await batch.commit()');
    const push = release.search(/if \(reason === 'candidate_declined' && project\.clientId\) \{\s*[\s\S]*?await notify\(/);
    expect(commit).toBeGreaterThan(-1);
    expect(push).toBeGreaterThan(commit);
    expect(release).toMatch(/const text = releaseNotice\(reason, proName\)/);
  });

  it('createPaymentRequest passes proAccepted from the accepted docs into the policy', () => {
    const REPRICING = readFileSync(join(__dirname, '..', 'repricing.ts'), 'utf8');
    expect(REPRICING).toMatch(/proAccepted = bd\.proAccepted === true/);
    expect(REPRICING).toMatch(/proAccepted = offers\.docs\.some\(\(d\) => d\.data\(\)\.proAccepted === true\)/);
    expect(REPRICING).toMatch(/decideNewPriceRequest\(\{ callerIsClient, underReview, proAccepted, history \}\)/);
  });
});
