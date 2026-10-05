import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * chats/{chatId}/joinRequestNotices/{uid} is the owner-push cooldown: written and read by the
 * trigger only. It is protected by the rules' catch-all deny, so what must NEVER appear is a rule
 * that would match it. This pins that, and the catch-all itself.
 */
const rules = readFileSync(join(__dirname, '..', '..', '..', 'firestore.rules'), 'utf8');
const code = rules.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

describe('firestore.rules and the cooldown stamps', () => {
  it('has no rule that names joinRequestNotices', () => {
    expect(code).not.toMatch(/joinRequestNotices/);
  });

  it('has no recursive wildcard that could reach a chats subcollection, apart from the final deny-all and the fees collection-group rule', () => {
    const wildcards = [...code.matchAll(/match\s+(\/\S*=\*\*\S*)\s*\{/g)].map((m) => m[1]);
    expect(wildcards.sort()).toEqual(['/{document=**}', '/{path=**}/fees/{proId}'].sort());
  });

  it('ends with the catch-all that denies everything not listed', () => {
    const tail = code.slice(code.lastIndexOf('match /{document=**}'));
    expect(tail.replace(/\s+/g, ' ')).toMatch(/^match \/\{document=\*\*\} \{ allow read, write: if false; \} \} \}\s*$/);
  });

  it('the other server-written chat subcollections are explicit matches too (same pattern), and none of them is a wildcard', () => {
    for (const name of ['memberStats', 'communityEvents']) expect(code).toMatch(new RegExp(`match /${name}/\\{`));
  });
});
