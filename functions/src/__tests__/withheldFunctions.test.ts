import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Withheld functions can NOT be shipped by a full deploy.
 *
 * Firebase deploys exactly what functions/src/index.ts exports. A function listed in
 * scripts/deploy-drift-allowlist.json ("exported from functions/src but intentionally NOT
 * deployed") must therefore not be re-exported from index.ts (directly, through a barrel
 * `export *`, or through ./payments). The module keeps its `export const` so the code, its
 * tests and the drift check still see it. This fails the moment one is wired back in.
 */
/** Every name functions/src/index.ts exports, resolved by the TypeScript compiler (through `export *`,
 *  named re-exports and ./payments), which is exactly what the Firebase CLI deploys. No runtime load. */
function indexExports(): string[] {
  const root = join(__dirname, '..', '..');
  const ts = require('typescript') as typeof import('typescript'); // eslint-disable-line @typescript-eslint/no-require-imports
  const cfg = ts.readConfigFile(join(root, 'tsconfig.json'), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, root);
  const entry = join(root, 'src', 'index.ts');
  const program = ts.createProgram([entry], { ...parsed.options, noEmit: true });
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(entry)!;
  return checker.getExportsOfModule(checker.getSymbolAtLocation(sf)!).map((sym) => sym.name);
}

const allowlist = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'scripts', 'deploy-drift-allowlist.json'), 'utf8')) as {
  functionsNotDeployed: { name: string }[];
};
const WITHHELD = allowlist.functionsNotDeployed.map((e) => e.name);

describe('withheld functions', () => {
  it('the allowlist names at least the three withheld on purpose', () => {
    expect(WITHHELD).toEqual(expect.arrayContaining(['callClaude', 'resolveCommunityInvite', 'paymentWebhook']));
  });

  it('none of them is exported from functions/src/index.ts, so a full deploy cannot ship them', () => {
    const exported = indexExports();
    expect(exported.length).toBeGreaterThan(50); // the real index loaded, not an empty stub
    for (const name of WITHHELD) expect(exported).not.toContain(name);
  });

  it('the siblings of a withheld function are still exported (only the named one is held back)', () => {
    const exported = indexExports();
    for (const name of ['createCommunityInvite', 'getCommunityInvite', 'revokeCommunityInvite', 'onCommunityInviteJoinRequest',
      'onCommunityDeleted', 'paymentLinkConfirm', 'feeChargeCron', 'getMyPaymentMethod']) {
      expect(exported).toContain(name);
    }
  });

  it('each withheld function still exists as code in its module (the code stays in the repo)', () => {
    const src = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
    expect(src('claude/index.ts')).toMatch(/export const callClaude = onCall/);
    expect(src('communities/invites.ts')).toMatch(/export const resolveCommunityInvite = onRequest/);
    expect(src('payments/paymentWebhook.ts')).toMatch(/export const paymentWebhook = onRequest/);
  });
});
