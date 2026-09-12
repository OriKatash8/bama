import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * THE CENTRAL INVARIANT OF THE ENGAGEMENT REFACTOR, enforced by the build.
 *
 * `projects/{id}.completion` is a CACHE with exactly one writer: derive.ts. Two
 * writers is how the project and its engagements drift, which is the whole class
 * of bug this refactor removed — and the failure is silent. A second writer does
 * not throw; it just makes the project disagree with the engagements underneath
 * it, and the disagreement surfaces days later as a reminder that never fired or
 * a project that completed while somebody was still working.
 *
 * `remindedDays` is the same invariant one level down: as a single array on the
 * project it meant reminding one professional marked the day sent for all of
 * them. It belongs to the engagement now.
 *
 * A grep only catches this when somebody remembers to grep. This is the grep,
 * run by CI, failing the build the moment a project write reintroduces either.
 *
 * FAIL-CLOSED. A write whose target this test cannot classify is a failure, not
 * a pass — the author is asked to make the target obvious rather than the test
 * being asked to guess.
 */

const LIFECYCLE = join(__dirname, '..');
const FUNCTIONS_SRC = join(LIFECYCLE, '..');

/** The one file allowed to write the project-level cache. */
const SOLE_WRITER = 'derive.ts';

/** Tokens that identify an update target as the PROJECT document. */
const PROJECT_TARGETS = [
  'snap.ref', 'projSnap.ref', 'doc.ref', 'projRef', 'db.doc(`projects/',
];

/** Tokens that identify an update target as an ENGAGEMENT (fee) document. */
const ENGAGEMENT_TARGETS = [
  'feeRef(', 'fRef', 'myFeeRef', 'engRef', 'f.ref', 'd.ref', 'ref.update', 'fSnap.ref',
];

const GUARDED = ['completion', 'remindedDays'];

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      return name === '__tests__' || name === 'node_modules' ? [] : tsFiles(full);
    }
    return name.endsWith('.ts') ? [full] : [];
  });
}

/**
 * Pull out every `.update(...)` / `.set(...)` call with its argument text, by
 * matching parentheses rather than by line so a multi-line object literal is
 * captured whole.
 *
 * WHICH REF IS THE TARGET depends on the form, and getting this wrong is how the
 * first version of this test flagged three correct engagement writes:
 *
 *   ref.update({ ... })           -> the RECEIVER is the target
 *   batch.update(ref, { ... })    -> the FIRST ARGUMENT is the target
 *
 * so the argument list is split at its top-level comma, and the first segment
 * wins when there is one.
 */
function stripComments(source: string): string {
  // Comments must go before anything is matched: confirmCompletionInternal's
  // project update carries a comment saying "No `completion` here", and a naive
  // scan reads that as the very write it is promising not to make.
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');   // spare `://` inside URLs
}

function writeCalls(raw: string): { target: string; body: string }[] {
  const source = stripComments(raw);
  const out: { target: string; body: string }[] = [];
  const re = /\.(update|set)\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    let depth = 1;
    let i = m.index + m[0].length;
    while (i < source.length && depth > 0) {
      if (source[i] === '(') depth++;
      else if (source[i] === ')') depth--;
      i++;
    }
    const args = source.slice(m.index + m[0].length, i - 1);

    // Split at the FIRST top-level comma — nested objects and calls have their
    // own commas and must not fool this.
    let d = 0;
    let split = -1;
    for (let k = 0; k < args.length; k++) {
      const c = args[k];
      if (c === '(' || c === '{' || c === '[') d++;
      else if (c === ')' || c === '}' || c === ']') d--;
      else if (c === ',' && d === 0) { split = k; break; }
    }

    // The method is part of the receiver token, so `ref.update` matches rather
    // than the bare `ref` that the slice would otherwise end on.
    const receiver = source.slice(Math.max(0, m.index - 60), m.index) + m[0];
    const target = split === -1 ? receiver : args.slice(0, split);
    const body = split === -1 ? args : args.slice(split + 1);
    out.push({ target, body });
  }
  return out;
}

describe('one writer: projects/{id}.completion belongs to derive.ts alone', () => {
  const files = tsFiles(FUNCTIONS_SRC).filter((f) => !f.endsWith(SOLE_WRITER));

  it('finds the source tree it is supposed to be guarding', () => {
    // A test that silently scans nothing passes forever. Pin that it is looking
    // at the real files.
    expect(files.length).toBeGreaterThan(5);
    expect(files.some((f) => f.endsWith('completion.ts'))).toBe(true);
    expect(files.some((f) => f.endsWith('cron.ts'))).toBe(true);
    expect(files.some((f) => f.endsWith('hire.ts'))).toBe(true);
  });

  it('no file but derive.ts writes completion or remindedDays to a project', () => {
    const violations: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const { target, body } of writeCalls(source)) {
        const guarded = GUARDED.filter((g) => new RegExp(`\\b${g}\\b`).test(body));
        if (guarded.length === 0) continue;

        // PROJECT IS CHECKED FIRST, and the order is the fix for a real bug: the
        // engagement token `ref.update` is also a substring of `doc.ref.update`,
        // which is a PROJECT write. Checking engagements first classified the
        // project write as an engagement one and waved it through — this test
        // passed against a deliberately injected violation until the order
        // changed. Most specific wins.
        const isProject = PROJECT_TARGETS.some((t) => target.includes(t));
        const isEngagement = !isProject && ENGAGEMENT_TARGETS.some((t) => target.includes(t));
        if (isEngagement) continue;
        const rel = file.slice(FUNCTIONS_SRC.length + 1);
        violations.push(
          isProject
            ? `${rel}: writes ${guarded.join('+')} to a PROJECT document — that belongs to ${SOLE_WRITER}`
            // Fail-closed: an unclassifiable target is not waved through.
            : `${rel}: writes ${guarded.join('+')} to an UNRECOGNISED target `
              + `(${target.trim().slice(-40)}) — name the ref so this test can tell `
              + `a project write from an engagement write`,
        );
      }
    }

    expect(violations).toEqual([]);
  });

  it('derive.ts does write it, so the rule above is not vacuously true', () => {
    // If derive.ts ever stopped writing the cache, the test above would pass
    // while the cache went stale forever. Assert the writer still writes.
    const derive = readFileSync(join(LIFECYCLE, SOLE_WRITER), 'utf8');
    expect(derive).toMatch(/update\.completion\s*=/);
  });
});
