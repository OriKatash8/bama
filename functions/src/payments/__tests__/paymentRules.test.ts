import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Static pin of the payment-related rules (the repo's rules-text style): every
 * payment collection is closed to clients in both directions, the fee's charge-attempt
 * log is closed, and the tester list can never be read through the config rule
 * (rules OR their matches, so the exclusion has to live in `config/{docId}` itself).
 */
const rules = readFileSync(join(__dirname, '..', '..', '..', '..', 'firestore.rules'), 'utf8');
const code = rules.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n').replace(/\s+/g, ' ');

const closed = (path: string) =>
  new RegExp(`match ${path.replace(/[{}$]/g, '\\$&')} \\{ allow read, write: if false; \\}`).test(code);

describe('payment rules', () => {
  it.each(['/paymentMethods/{uid}', '/paymentEvents/{eventId}', '/paymentFake/{key}'])(
    '%s is closed to clients', (path) => expect(closed(path)).toBe(true),
  );

  it('fees/*/charges is closed, nested under the fee match', () => {
    expect(closed('/charges/{attemptId}')).toBe(true);
    const fees = code.indexOf('match /fees/{proId}');
    const charges = code.indexOf('match /charges/{attemptId}');
    const removal = code.indexOf('match /removalRequests');
    expect(fees).toBeGreaterThan(-1);
    expect(charges).toBeGreaterThan(fees);
    expect(charges).toBeLessThan(removal);
  });

  it('a pro still cannot write their own fee', () => {
    const block = code.slice(code.indexOf('match /fees/{proId}'), code.indexOf('match /charges/{attemptId}'));
    expect(block).toContain('allow write: if false;');
  });

  it('config/paymentsPrivate is excluded from the signed-in config read', () => {
    expect(code).toMatch(/match \/config\/\{docId\} \{ allow read: if isAuth\(\) && docId != 'paymentsPrivate'; allow write: if false; \}/);
    expect(code).not.toMatch(/match \/config\/paymentsPrivate/);
  });

  it('no payment collection is reachable by a recursive wildcard other than the fees group rule', () => {
    const wildcards = [...code.matchAll(/match (\/\S*=\*\*\S*) \{/g)].map((m) => m[1]);
    expect(wildcards.sort()).toEqual(['/{document=**}', '/{path=**}/fees/{proId}'].sort());
  });
});
