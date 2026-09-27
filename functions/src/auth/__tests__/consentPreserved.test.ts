import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * NO CLOUD FUNCTION MAY REPLACE A USER DOCUMENT.
 *
 * users/{uid} has two writers that race at sign-up: the onUserCreate trigger,
 * which knows the Auth identity, and the client, which knows the consent the UI
 * just collected — termsAcceptedAt, termsVersion, ageConfirmed, ageConfirmedAt.
 * Neither can see the other's fields, and neither controls who lands first.
 *
 * onUserCreate used a bare .set(). A bare .set() REPLACES the document. So on
 * every sign-up where the trigger landed second, the four consent fields were
 * written by the UI and erased milliseconds later. The effect was that BAMA held
 * no evidence that any user had accepted the Terms or confirmed being 18+, on
 * any account, ever — and nothing failed, nothing logged, nothing looked wrong.
 * It was found by reading the trigger, not by anything noticing.
 *
 * That is the shape of the bug this test exists to prevent: a write that is
 * correct about its own fields and silently destructive about everyone else's.
 * The rule is therefore mechanical, not a judgement call — a function writing a
 * user document merges or updates, never replaces.
 *
 * FAIL-CLOSED. A .set() on a user document that this test cannot prove carries
 * { merge: true } is a failure, not a pass. If a write genuinely must replace a
 * user document, it has to say so here, in a named exemption, with a reason —
 * which is the review this class of bug never got.
 */

const FUNCTIONS_SRC = join(__dirname, '..', '..');

/** Reference expressions that resolve to a user DOCUMENT (not a subcollection). */
const USER_DOC_TARGETS = [
  /\.collection\(['"`]users['"`]\)\s*\.doc\([^)]*\)\s*\.set\(/,
  /\.doc\(`users\/\$\{[^}]+\}`\)\s*\.set\(/,
  /\.doc\(['"`]users\/[^'"`]+['"`]\)\s*\.set\(/,
  /\buserRef\s*\.set\(/,
];

/**
 * Writes allowed to replace a user document, each with the reason it is safe.
 * Empty on purpose: there is currently no such write, and adding one should
 * require writing down why the other writer's fields do not matter.
 */
const REPLACE_EXEMPTIONS: { file: string; reason: string }[] = [];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'lib' || entry === '__tests__') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

/**
 * The options object of a .set() can sit many lines below the call, after the
 * data literal. Rather than parse, take a generous window from the call and
 * require the merge flag inside it — and cap the window so a merge belonging to
 * some later, unrelated call cannot be mistaken for this one's.
 */
function carriesMerge(source: string, callIndex: number): boolean {
  const window = source.slice(callIndex, callIndex + 1400);
  const end = window.indexOf('\n  }\n');
  const scope = end === -1 ? window : window.slice(0, end + 5);
  return /\{\s*merge:\s*true\s*\}/.test(scope);
}

describe('cloud functions never replace a user document', () => {
  const files = sourceFiles(FUNCTIONS_SRC);

  it('finds the functions source, so a passing run means something', () => {
    expect(files.length).toBeGreaterThan(10);
    expect(files.some((f) => f.endsWith(join('auth', 'index.ts')))).toBe(true);
  });

  it('every .set() on users/{uid} carries { merge: true }', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const rel = file.slice(FUNCTIONS_SRC.length + 1);
      if (REPLACE_EXEMPTIONS.some((e) => e.file === rel)) continue;
      const source = readFileSync(file, 'utf8');

      for (const pattern of USER_DOC_TARGETS) {
        const re = new RegExp(pattern.source, 'g');
        let m: RegExpExecArray | null;
        while ((m = re.exec(source)) !== null) {
          if (carriesMerge(source, m.index)) continue;
          const line = source.slice(0, m.index).split('\n').length;
          offenders.push(`${rel}:${line} — ${m[0].trim()}`);
        }
      }
    }

    // A bare .set() here erases whatever the client wrote, consent included.
    // Use { merge: true }, or .update(), or add a REPLACE_EXEMPTIONS entry
    // saying why replacing the document is safe.
    expect(offenders).toEqual([]);
  });

  it('onUserCreate in particular merges', () => {
    const source = readFileSync(join(FUNCTIONS_SRC, 'auth', 'index.ts'), 'utf8');
    const trigger = source.slice(source.indexOf('export const onUserCreate'));
    const body = trigger.slice(0, trigger.indexOf('\n});') + 4);

    expect(body).toMatch(/\.set\(/);
    expect(body).toMatch(/\{\s*merge:\s*true\s*\}/);
  });

  it('onUserCreate does not write the consent fields it must not own', () => {
    const source = readFileSync(join(FUNCTIONS_SRC, 'auth', 'index.ts'), 'utf8');
    const trigger = source.slice(source.indexOf('export const onUserCreate'));
    const body = trigger.slice(0, trigger.indexOf('\n});') + 4);

    // The client collects these from a human and is the only writer that may
    // set them. A server default here would be a forged consent record.
    for (const field of ['termsAcceptedAt', 'termsVersion', 'ageConfirmed', 'ageConfirmedAt']) {
      expect(body).not.toMatch(new RegExp(`${field}\\s*:`));
    }
  });
});
