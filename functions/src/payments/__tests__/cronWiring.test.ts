import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Source-level pin (the repo's wiring-test style): lifecycleCron's stub charge sweep
 * runs ONLY under paymentProvider 'none', so a live provider and the stub can never
 * both act on a fee; and the stub body is the shared runStubChargeFor.
 */
const cron = readFileSync(join(__dirname, '..', '..', 'lifecycle', 'cron.ts'), 'utf8');
const code = cron.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

describe('lifecycleCron sweep 6', () => {
  it("is guarded by paymentProvider === 'none'", () => {
    const guard = code.indexOf("paymentProvider === 'none'");
    const call = code.indexOf('runStubChargeFor(projectId');
    expect(guard).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(guard);
  });
  it('no longer calls chargeEngagementFee directly', () => {
    expect(code).not.toMatch(/chargeEngagementFee\(/);
  });
});
