import {
  resolvePricingConfig, feeRateOf, PRICING_CONFIG_DEFAULTS,
} from '../config';

/**
 * The merge is the whole safety story for runtime config: it is what stands
 * between a typo in the Firestore console and a commission rate of zero.
 */
describe('resolvePricingConfig', () => {
  it('returns the defaults for a missing document', () => {
    expect(resolvePricingConfig(null)).toEqual(PRICING_CONFIG_DEFAULTS);
    expect(resolvePricingConfig(undefined)).toEqual(PRICING_CONFIG_DEFAULTS);
  });

  it('returns the defaults for a non-object', () => {
    expect(resolvePricingConfig('nope')).toEqual(PRICING_CONFIG_DEFAULTS);
    expect(resolvePricingConfig(42)).toEqual(PRICING_CONFIG_DEFAULTS);
  });

  it('takes every valid key from the document', () => {
    const raw = {
      feePercent: 5,
      maxOpenProjects: 4,
      disputeWindowDays: 10,
      autoCloseReminderDays: 2,
      autoCloseFinalDays: 5,
      autoCloseDays: 20,
      paymentFailureGraceDays: 9,
    };
    expect(resolvePricingConfig(raw)).toEqual(raw);
  });

  it('falls back PER FIELD, so one bad key cannot revert the others', () => {
    const out = resolvePricingConfig({ feePercent: 5, maxOpenProjects: 'three' });
    expect(out.feePercent).toBe(5);
    expect(out.maxOpenProjects).toBe(PRICING_CONFIG_DEFAULTS.maxOpenProjects);
  });

  it.each([
    ['a string', 'x'],
    ['null', null],
    ['zero', 0],
    ['negative', -3],
    ['NaN', NaN],
    ['Infinity', Infinity],
  ])('rejects %s and keeps the default', (_label, value) => {
    expect(resolvePricingConfig({ feePercent: value }).feePercent)
      .toBe(PRICING_CONFIG_DEFAULTS.feePercent);
  });

  it('ignores keys nothing reads', () => {
    const out = resolvePricingConfig({ feePercent: 4, somethingElse: 99 });
    expect(out.feePercent).toBe(4);
    expect(out).not.toHaveProperty('somethingElse');
  });
});

describe('feeRateOf', () => {
  it('converts the config percent to the fraction a fee document stores', () => {
    expect(feeRateOf({ ...PRICING_CONFIG_DEFAULTS, feePercent: 3 })).toBeCloseTo(0.03);
    expect(feeRateOf({ ...PRICING_CONFIG_DEFAULTS, feePercent: 12.5 })).toBeCloseTo(0.125);
  });
});
