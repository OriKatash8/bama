import { readFileSync } from 'fs';
import { join } from 'path';
import { ROLE_CATEGORIES } from '../data/categories';

/**
 * AI_ROLE_CATEGORIES in functions/src/claude/tasks.ts is a hand-copied mirror of
 * ROLE_CATEGORIES here, because a functions/ build cannot import from src/. It
 * is spliced into the 'crew-recommendation' system prompt as the exhaustive list
 * of roles the model may return, and the client then DISCARDS any returned role
 * not in ROLE_CATEGORIES.
 *
 * So a drift between the two is silent and one-directional: add a role to the
 * app and the model is never told it exists; remove one and every suggestion of
 * it is thrown away after being paid for. No error either way.
 *
 * Read as text rather than imported: the app's tsconfig does not cover
 * functions/, and this assertion should not depend on that changing.
 */
describe('AI role categories', () => {
  it('match ROLE_CATEGORIES in the app', () => {
    const src = readFileSync(
      join(__dirname, '../../../../functions/src/claude/tasks.ts'),
      'utf8',
    );

    const block = src.match(
      /AI_ROLE_CATEGORIES:\s*readonly string\[\]\s*=\s*\[([\s\S]*?)\];/,
    );
    expect(block).not.toBeNull();

    const mirrored = [...block![1].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) =>
      m[1].replace(/\\'/g, "'"),
    );

    expect(mirrored).toEqual(ROLE_CATEGORIES);
  });
});
