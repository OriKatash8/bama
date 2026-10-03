import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { overdueStampFields, overdueNoticeFor, dueNoticeOwed } from '../feeOverdue';
import { resolvedFee } from '../disputeResolution';
import { computeFee } from '../helpers';

/**
 * The overdue-fee block: the stamp, the three notices, dispute pricing, and the
 * wiring that makes "paid" lift the block immediately. The predicate itself is
 * tabled in __tests__/pricing.test.ts.
 */

const ts = (ms: number) => ({ toMillis: () => ms }) as never;
const T = Date.UTC(2026, 9, 2);
const DAY = 86400_000;
const ON = { feeOverdueBlockEnabled: true, feeOverdueBlockDays: 7 };
const OFF = { feeOverdueBlockEnabled: false, feeOverdueBlockDays: 7 };

describe('overdueStampFields — the clock set at completion', () => {
  it('stamps completion + feeOverdueBlockDays', () => {
    const out = overdueStampFields(ON, T) as { overdueAt: { toMillis(): number } };
    expect(out.overdueAt.toMillis()).toBe(T + 7 * DAY);
    const ten = overdueStampFields({ ...ON, feeOverdueBlockDays: 10 }, T) as typeof out;
    expect(ten.overdueAt.toMillis()).toBe(T + 10 * DAY);
  });

  it('stamps NOTHING while the switch is off — why turning it on blocks no old fee', () => {
    expect(overdueStampFields(OFF, T)).toEqual({});
  });

  it('keeps an earlier clock still running on an unpaid fee (a re-hire\'s second completion)', () => {
    const out = overdueStampFields(ON, T, { overdueAt: ts(T - DAY), feePaid: false, status: 'pending' }) as {
      overdueAt: { toMillis(): number };
    };
    expect(out.overdueAt.toMillis()).toBe(T - DAY);
  });

  it('starts fresh when the earlier debt was settled', () => {
    const out = overdueStampFields(ON, T, { overdueAt: ts(T - DAY), feePaid: true, status: 'paid' }) as {
      overdueAt: { toMillis(): number };
    };
    expect(out.overdueAt.toMillis()).toBe(T + 7 * DAY);
  });
});

describe('the notices', () => {
  const fee = (over: Record<string, unknown> = {}) => ({
    feeStatus: 'owed', status: 'pending', feePaid: false, feeDue: 30, engagementStatus: 'completed',
    overdueAt: ts(T + 7 * DAY), chargeDueAt: ts(T + 4 * DAY), ...over,
  }) as never;

  it('"fee is now due" fires when the contest window closes (chargeDueAt), once', () => {
    expect(dueNoticeOwed(fee(), T + 4 * DAY - 1)).toBe(false);
    expect(dueNoticeOwed(fee(), T + 4 * DAY)).toBe(true);
    expect(dueNoticeOwed(fee({ dueNotifiedAt: ts(T) }), T + 5 * DAY)).toBe(false);
  });

  it('"fee is now due" is not sent for fees the rule does not cover', () => {
    expect(dueNoticeOwed(fee({ overdueAt: undefined }), T + 5 * DAY)).toBe(false); // switch was off
    expect(dueNoticeOwed(fee({ feePaid: true }), T + 5 * DAY)).toBe(false);
  });

  it('"one day before" fires inside the last 24h, then "block started" at the moment', () => {
    expect(overdueNoticeFor(fee(), T + 6 * DAY - 1)).toBeNull();
    expect(overdueNoticeFor(fee(), T + 6 * DAY)).toBe('fee_overdue_soon');
    expect(overdueNoticeFor(fee({ overdueWarnedAt: ts(T) }), T + 6.5 * DAY)).toBeNull();
    expect(overdueNoticeFor(fee({ overdueWarnedAt: ts(T) }), T + 7 * DAY)).toBe('fee_overdue');
    expect(overdueNoticeFor(fee({ overdueBlockNotifiedAt: ts(T) }), T + 8 * DAY)).toBeNull();
  });

  it('says nothing about a paid or disputed fee', () => {
    expect(overdueNoticeFor(fee({ status: 'paid' }), T + 8 * DAY)).toBeNull();
    expect(overdueNoticeFor(fee({ engagementStatus: 'disputed' }), T + 8 * DAY)).toBeNull();
  });
});

describe('resolvedFee — what a dispute resolved as completed leaves owing', () => {
  const contested = (over: Record<string, unknown>) => ({
    feeStatus: 'owed', feeRate: 0.03, minFeeApplied: 6, baseAmount: 1000, ...over,
  }) as never;

  it('didnt_happen: restores the fee the contest zeroed, from preDispute', () => {
    const fee = contested({ feeDue: 0, status: 'not_owed', preDispute: { feeDue: 30, status: 'pending', baseAmount: 1000 } });
    expect(resolvedFee(fee)).toEqual({ baseAmount: 1000, feeDue: 30 });
  });

  it('a contest from before preDispute existed: recomputed from the surviving baseAmount', () => {
    expect(resolvedFee(contested({ feeDue: 0, status: 'not_owed' }))).toEqual({ baseAmount: 1000, feeDue: 30 });
  });

  it('amount_disputed with a corrected price: completion\'s calculation, floor included', () => {
    expect(resolvedFee(contested({}), 500).feeDue).toBe(computeFee(500, 0.03, 6));   // 15
    expect(resolvedFee(contested({}), 100).feeDue).toBe(6);                         // the floor
    expect(resolvedFee(contested({ paidAmount: 10 }), 500).feeDue).toBe(5);         // less paid early
    expect(resolvedFee(contested({ paidAmount: 100 }), 500).feeDue).toBe(0);        // never negative
    expect(resolvedFee(contested({}), 500).baseAmount).toBe(500);
  });

  it('owes nothing on an exempt engagement whatever the price', () => {
    expect(resolvedFee(contested({ feeStatus: 'exempt' }), 5000).feeDue).toBe(0);
  });

  it('a fee that was void before the contest stays void', () => {
    const fee = contested({ preDispute: { feeDue: 0, status: 'not_owed', baseAmount: 1000 } });
    expect(resolvedFee(fee).feeDue).toBe(0);
  });
});

describe('wiring', () => {
  const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
  const COMPLETION = read('completion.ts');
  const HIRE = read('hire.ts');
  const REMOVAL = read('removal.ts');
  const RESOLVE = read('disputeResolution.ts');
  const RULES = readFileSync(join(__dirname, '..', '..', '..', '..', 'firestore.rules'), 'utf8');
  const slice = (src: string, from: string, to: string) => src.slice(src.indexOf(from), src.indexOf(to, src.indexOf(from)));

  it('settleFee recomputes the block itself, after its transaction', () => {
    const settle = slice(COMPLETION, 'async function settleFee', 'export const markDemandSent');
    const tx = settle.indexOf('db.runTransaction');
    const recompute = settle.indexOf('recomputeFeeBlockSafely(proId)');
    expect(tx).toBeGreaterThan(-1);
    expect(recompute).toBeGreaterThan(tx);
  });

  it('settleFee prices a completed ENGAGEMENT from its stored feeDue, not the offers', () => {
    const settle = slice(COMPLETION, 'async function settleFee', 'export const markDemandSent');
    expect(settle).toMatch(/\|\|\s*fee\.engagementStatus === 'completed'/);
  });

  it('every path that lifts or pauses a block recomputes it directly', () => {
    expect(slice(COMPLETION, 'export const contestEngagement', '\n});')).toContain('recomputeFeeBlockSafely(uid)');
    expect(slice(COMPLETION, 'export const cancelProject', '\n});')).toContain('recomputeFeeBlockSafely(d.id)');
    expect(REMOVAL).toContain('recomputeFeeBlockSafely(proId)');
    expect(RESOLVE).toContain('recomputeFeeBlockSafely(proId)');
  });

  it('the contest snapshots the fee before zeroing it', () => {
    const contest = slice(COMPLETION, 'export const contestEngagement', '\n});');
    expect(contest.indexOf('preDispute')).toBeGreaterThan(-1);
    expect(contest.indexOf('preDispute')).toBeLessThan(contest.indexOf("feeDue: 0, status: 'not_owed'"));
  });

  it('both completion paths stamp the clock', () => {
    expect(slice(COMPLETION, 'confirmCompletionInternal', 'export const confirmCompletion'))
      .toContain('overdueStampFields(config, completedAtMs, fee)');
    expect(slice(COMPLETION, 'export async function completeEngagementInternal', '\n}\n'))
      .toContain('overdueStampFields(config, completedAtMs, eng)');
  });

  it('the hire gate checks overdue behind the switch, with the arrears gate, before the commit', () => {
    const enforce = slice(HIRE, 'async function loadAndEnforce', 'return { projSnap');
    const gate = enforce.indexOf('if (config.feeOverdueBlockEnabled)');
    expect(gate).toBeGreaterThan(enforce.indexOf("'fee-arrears'"));
    expect(enforce.slice(gate)).toMatch(
      /if \(feesSnap\.docs\.some\(\(d\) => feeIsOverdue\(d\.data\(\), now\)\)\) \{\s*throw new HttpsError\('resource-exhausted', 'fee-overdue'\);/,
    );
  });

  it('a paid re-hire clears the old clock', () => {
    expect(HIRE).toMatch(/feeUpdate\.overdueAt = FieldValue\.delete\(\)/);
  });

  it('the rules gate offers, bundles and applications, and read the kill switch themselves', () => {
    const valid = slice(RULES, 'function offerCreateValid()', '\n    }');
    expect(valid).toContain('!feeOverdueBlocks()');
    // The demo-isolation helper sits between the match and the allow; the gate is unchanged.
    expect(RULES).toMatch(/match \/projectApplications\/\{applicationId\} \{[\s\S]*?allow create: if isAuth\(\) && !feeOverdueBlocks\(\)( && applicationOnSide\(\))?;/);
    const fn = slice(RULES, 'function feeOverdueBlocks()', '\n    }');
    expect(fn).toContain("get(cfgPath).data.get('feeOverdueBlockEnabled', false) == true");
    expect(fn).toContain('request.time >= get(blockPath).data.blockedFrom');
    expect(RULES).toMatch(/match \/feeBlocks\/\{userId\} \{\s*allow read: if isOwner\(userId\);\s*allow write: if false;/);
  });
});
