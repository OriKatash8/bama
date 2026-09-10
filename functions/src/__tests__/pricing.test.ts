/**
 * Bounds and status predicates, imported from the ENFORCING copy in
 * functions/src — not a client mirror. The client constants file duplicates the
 * numbers for its error message only; the logic has one home.
 */
import {
  isOfferPriceValid, canHireOnStatus, MIN_OFFER_PRICE, MAX_OFFER_PRICE, HIREABLE_STATUSES,
  hireConsumesNewSlot, atSlotCap,
  resolveConfig, feeRateOf, withinDisputeWindow, CONFIG_DEFAULTS, feeBlocksNewHire,
  DEFAULT_MAX_OPEN_PROJECTS,
} from '../pricing';
import { computeFee } from '../lifecycle/helpers';

describe('isOfferPriceValid', () => {
  it('rejects the two real production typos', () => {
    expect(isOfferPriceValid(554_545)).toBe(false);    // observed in production
    expect(isOfferPriceValid(10_000_000)).toBe(false); // observed in production
    expect(isOfferPriceValid(70_000)).toBe(false);     // above the ceiling
  });

  it('accepts the real prices on the platform', () => {
    for (const p of [12, 100, 300, 1000, 1799.9, 2000, 10_000, 50_000]) {
      expect(isOfferPriceValid(p)).toBe(true);
    }
  });

  it('holds at the boundaries', () => {
    expect(isOfferPriceValid(MIN_OFFER_PRICE - 1)).toBe(false); // 0
    expect(isOfferPriceValid(MIN_OFFER_PRICE)).toBe(true);
    expect(isOfferPriceValid(MAX_OFFER_PRICE)).toBe(true);
    expect(isOfferPriceValid(MAX_OFFER_PRICE + 1)).toBe(false);
  });

  it('rejects zero and negatives', () => {
    expect(isOfferPriceValid(0)).toBe(false);
    expect(isOfferPriceValid(-1)).toBe(false);
    expect(isOfferPriceValid(-50_000)).toBe(false);
  });

  it('rejects non-finite and non-numeric values', () => {
    for (const v of [NaN, Infinity, -Infinity, '500', null, undefined, {}, []]) {
      expect(isOfferPriceValid(v)).toBe(false);
    }
  });

  it('allows non-integers — a live bundle is priced 1799.9', () => {
    expect(isOfferPriceValid(1799.9)).toBe(true);
  });
});

describe('canHireOnStatus', () => {
  it('permits the live statuses', () => {
    expect(canHireOnStatus('open')).toBe(true);
    expect(canHireOnStatus('in_progress')).toBe(true);
  });

  it('refuses the terminal statuses', () => {
    expect(canHireOnStatus('completed')).toBe(false);
    expect(canHireOnStatus('cancelled')).toBe(false);
  });

  it('refuses anything unrecognised, including missing', () => {
    for (const v of ['', 'draft', 'filled', undefined, null, 0, {}]) {
      expect(canHireOnStatus(v)).toBe(false);
    }
  });

  /**
   * Pins the set against ProjectRequest['status'] = open | in_progress |
   * completed | cancelled. If a status is ever added, this fails and forces a
   * decision instead of silently defaulting to un-hireable.
   */
  it('covers every ProjectRequest status explicitly', () => {
    const ALL = ['open', 'in_progress', 'completed', 'cancelled'] as const;
    const hireable = ALL.filter(canHireOnStatus);
    expect(hireable).toEqual([...HIREABLE_STATUSES]);
    expect(ALL.length - hireable.length).toBe(2);
  });
});

/**
 * The slot cap means "one project the pro is engaged on", not "one role". These
 * mirror hire.ts's control flow: hireConsumesNewSlot gates whether the cap check
 * runs at all.
 *
 * There is ONE cap and no tier that lifts it. The subscriber branch this table
 * used to carry is gone: capacity is not purchasable, and the only things that
 * free a slot are completing or cancelling a project.
 *
 * PRO and OTHER are two professionals; HERE is the project being hired onto.
 */
const PRO = 'pro-uid';
const OTHER = 'other-uid';

/** The decision hire.ts makes, expressed exactly as its branches do. */
function verdict(input: {
  slotHolders?: string[];
  /** What the cap query would return. Only consulted when a new slot is taken. */
  slotProjectCount: number;
  /** `maxOpenProjects` from the runtime config. */
  cap?: number;
}): { allowed: boolean; reason?: string } {
  const cap = input.cap ?? DEFAULT_MAX_OPEN_PROJECTS;
  if (hireConsumesNewSlot(input.slotHolders, PRO) && atSlotCap(input.slotProjectCount, cap)) {
    return { allowed: false, reason: 'slot-cap-reached' };
  }
  return { allowed: true };
}

describe('hireConsumesNewSlot', () => {
  it('is false when the pro already holds a slot here', () => {
    expect(hireConsumesNewSlot([PRO, OTHER], PRO)).toBe(false);
  });
  it('is true when they do not', () => {
    expect(hireConsumesNewSlot([OTHER], PRO)).toBe(true);
  });
  it('is true for an empty or missing slotHolders', () => {
    expect(hireConsumesNewSlot([], PRO)).toBe(true);
    expect(hireConsumesNewSlot(undefined, PRO)).toBe(true);
  });
});

describe('slot cap: a slot is one PROJECT, not one role', () => {
  const CAP = DEFAULT_MAX_OPEN_PROJECTS;

  it('pro AT the cap takes a second role on a project they already hold → ALLOW', () => {
    // The regression: the cap query counts the current project, so this used to
    // be refused with slot-cap-reached even though arrayUnion was a no-op.
    const v = verdict({ slotHolders: [PRO], slotProjectCount: CAP });
    expect(v.allowed).toBe(true);
    expect(v.reason).toBeUndefined();
  });

  it('pro AT the cap takes a role on a NEW project → still denied', () => {
    const v = verdict({ slotHolders: [OTHER], slotProjectCount: CAP });
    expect(v.allowed).toBe(false);
    expect(v.reason).toBe('slot-cap-reached');
  });

  it('pro BELOW the cap on a new project → allowed', () => {
    const v = verdict({ slotHolders: [], slotProjectCount: CAP - 1 });
    expect(v.allowed).toBe(true);
  });

  it('a pro re-hired on a project they have left → denied at the cap', () => {
    // They leave slotHolders when the project completes or is cancelled, but
    // remain in professionalIds. Re-hiring genuinely needs a slot again, so
    // keying on professionalIds would have handed them a free engagement.
    // slotHolders is what decides.
    const noLongerHolding: string[] = [];
    const v = verdict({ slotHolders: noLongerHolding, slotProjectCount: CAP });
    expect(v.allowed).toBe(false);
    expect(v.reason).toBe('slot-cap-reached');
  });

  it('follows the CONFIG cap, not a constant', () => {
    // The whole point of the runtime config: raising maxOpenProjects admits a
    // hire that the previous value refused, with no redeploy.
    expect(verdict({ slotHolders: [], slotProjectCount: 3, cap: 3 }).allowed).toBe(false);
    expect(verdict({ slotHolders: [], slotProjectCount: 3, cap: 4 }).allowed).toBe(true);
  });

  it('there is no tier that lifts the cap', () => {
    // Capacity is not purchasable. Whatever a professional has paid or not paid,
    // the same cap applies — the decision depends only on slots held.
    const atCap = verdict({ slotHolders: [OTHER], slotProjectCount: CAP });
    expect(atCap.allowed).toBe(false);
    expect(atCap.reason).toBe('slot-cap-reached');
  });
});

describe('atSlotCap boundary', () => {
  it('fires at the cap, not before', () => {
    expect(atSlotCap(DEFAULT_MAX_OPEN_PROJECTS - 1, DEFAULT_MAX_OPEN_PROJECTS)).toBe(false);
    expect(atSlotCap(DEFAULT_MAX_OPEN_PROJECTS, DEFAULT_MAX_OPEN_PROJECTS)).toBe(true);
  });
  it('defaults to the fallback cap when none is supplied', () => {
    expect(atSlotCap(DEFAULT_MAX_OPEN_PROJECTS)).toBe(true);
  });
});

/**
 * Runtime config. The merge is what stands between a typo in the Firestore
 * console and a commission rate of zero, so it is tested per field.
 */
describe('resolveConfig', () => {
  it('returns the defaults for a missing or non-object document', () => {
    expect(resolveConfig(null)).toEqual(CONFIG_DEFAULTS);
    expect(resolveConfig(undefined)).toEqual(CONFIG_DEFAULTS);
    expect(resolveConfig('nope')).toEqual(CONFIG_DEFAULTS);
  });

  it('takes valid values from the document', () => {
    const out = resolveConfig({ feePercent: 5, maxOpenProjects: 4, disputeWindowDays: 10 });
    expect(out.feePercent).toBe(5);
    expect(out.maxOpenProjects).toBe(4);
    expect(out.disputeWindowDays).toBe(10);
  });

  it('falls back PER FIELD, so one bad key cannot revert the others', () => {
    const out = resolveConfig({ feePercent: 5, maxOpenProjects: 'three' });
    expect(out.feePercent).toBe(5);
    expect(out.maxOpenProjects).toBe(CONFIG_DEFAULTS.maxOpenProjects);
  });

  it.each([['a string', 'x'], ['null', null], ['zero', 0], ['negative', -3], ['NaN', NaN], ['Infinity', Infinity]])(
    'rejects %s and keeps the default',
    (_label, value) => {
      expect(resolveConfig({ feePercent: value }).feePercent).toBe(CONFIG_DEFAULTS.feePercent);
    },
  );
});

describe('computeFee — the commission floor (Terms 12.4.1)', () => {
  it('takes the percentage when it clears the floor', () => {
    expect(computeFee(5000, 0.03, 6)).toBe(150);
    expect(computeFee(1000, 0.03, 6)).toBe(30);
  });

  it('takes the floor when the percentage falls short', () => {
    expect(computeFee(100, 0.03, 6)).toBe(6);   // 3
    expect(computeFee(20, 0.03, 6)).toBe(6);    // 1
    expect(computeFee(1, 0.03, 6)).toBe(6);     // 0
  });

  it('holds at the exact boundary — 200 x 3% is 6, not 5.99 or 6.0000001', () => {
    expect(200 * 0.03).toBe(6);                 // no float drift at the boundary
    expect(computeFee(200, 0.03, 6)).toBe(6);
    expect(computeFee(199, 0.03, 6)).toBe(6);   // 5.97 rounds up to 6 anyway
    expect(computeFee(201, 0.03, 6)).toBe(6);   // 6.03 rounds down to 6
    expect(computeFee(234, 0.03, 6)).toBe(7);   // first base that clears it
  });

  it('stays whole for a non-integer base — a live bundle is priced 1799.9', () => {
    const fee = computeFee(1799.9, 0.03, 6);
    expect(fee).toBe(54);
    expect(Number.isInteger(fee)).toBe(true);
  });

  it('charges the floor on a zero base — under-reporting cannot reach zero', () => {
    expect(computeFee(0, 0.03, 6)).toBe(6);
  });

  it('DEFAULTS TO NO FLOOR, which is what makes old records need no backfill', () => {
    // A fee written before the floor existed carries no minFeeApplied, so callers
    // pass `?? 0` and the amount is arithmetically what it always was. A real
    // production record sits at baseAmount 123 -> 4; it must stay 4.
    expect(computeFee(123, 0.03)).toBe(4);
    expect(computeFee(123, 0.03, 0)).toBe(4);
    expect(computeFee(100, 0.03)).toBe(3);
  });

  it('honours a floor that is not the current default — it is per record', () => {
    expect(computeFee(100, 0.03, 10)).toBe(10);
    expect(computeFee(500, 0.03, 10)).toBe(15);
  });
});

describe('minFeeAmount config key', () => {
  it('defaults to 6', () => {
    expect(CONFIG_DEFAULTS.minFeeAmount).toBe(6);
  });

  it('is runtime-tunable', () => {
    expect(resolveConfig({ minFeeAmount: 10 }).minFeeAmount).toBe(10);
  });

  it('CANNOT be switched off with a 0 — resolveConfig takes only v > 0', () => {
    // Documented, not accidental: removing the floor is a code change.
    expect(resolveConfig({ minFeeAmount: 0 }).minFeeAmount).toBe(6);
    expect(resolveConfig({ minFeeAmount: -1 }).minFeeAmount).toBe(6);
    expect(resolveConfig({ minFeeAmount: 'six' }).minFeeAmount).toBe(6);
  });
});

describe('feeBlocksNewHire — arrears, not a payment gate', () => {
  const DAY = 86400_000;
  const now = Date.UTC(2026, 8, 11);
  const stamp = (daysAgo: number) => ({ toMillis: () => now - daysAgo * DAY });
  const owed = (over: Record<string, unknown> = {}) => ({
    feeStatus: 'owed', ...over,
  });

  it('does NOT block an unpaid fee that was never invoiced', () => {
    // The whole reason demandSentAt exists: finishing a job on Tuesday must not
    // put you in arrears on Wednesday.
    expect(feeBlocksNewHire(owed(), 7, now)).toBe(false);
    expect(feeBlocksNewHire(owed({ demandSentAt: null }), 7, now)).toBe(false);
  });

  it('does NOT block inside the grace period', () => {
    expect(feeBlocksNewHire(owed({ demandSentAt: stamp(3) }), 7, now)).toBe(false);
  });

  it('BLOCKS once the grace period has passed', () => {
    expect(feeBlocksNewHire(owed({ demandSentAt: stamp(9) }), 7, now)).toBe(true);
  });

  it('holds at the boundary — the deadline day itself does not block', () => {
    expect(feeBlocksNewHire(owed({ demandSentAt: stamp(7) }), 7, now)).toBe(false);
    expect(feeBlocksNewHire(owed({ demandSentAt: stamp(7.5) }), 7, now)).toBe(true);
  });

  it('does NOT block a disputed fee — good faith keeps you working', () => {
    expect(feeBlocksNewHire(
      owed({ demandSentAt: stamp(30), status: 'disputed' }), 7, now,
    )).toBe(false);
  });

  it('does NOT block once paid, by either signal', () => {
    expect(feeBlocksNewHire(owed({ demandSentAt: stamp(30), feePaid: true }), 7, now)).toBe(false);
    expect(feeBlocksNewHire(owed({ demandSentAt: stamp(30), status: 'paid' }), 7, now)).toBe(false);
  });

  it('does NOT block a fee voided by cancellation or removal', () => {
    // Those paths leave feeStatus at 'owed' on purpose, so status is the only
    // signal — the same asymmetry settleFee guards against.
    expect(feeBlocksNewHire(
      owed({ demandSentAt: stamp(30), status: 'not_owed' }), 7, now,
    )).toBe(false);
  });

  it('does NOT block when no fee was ever owed', () => {
    for (const feeStatus of ['exempt', 'included', undefined]) {
      expect(feeBlocksNewHire({ feeStatus, demandSentAt: stamp(30) }, 7, now)).toBe(false);
    }
  });

  it('reads a MISSING status as unsettled — the live production shape', () => {
    // All 15 production fee records predate the status field.
    expect(feeBlocksNewHire(owed({ demandSentAt: stamp(9) }), 7, now)).toBe(true);
    expect(feeBlocksNewHire(owed({ demandSentAt: stamp(9), feePaid: true }), 7, now)).toBe(false);
  });

  it('refuses to block on an unusable grace period rather than blocking at once', () => {
    for (const bad of [0, -1, NaN, Infinity]) {
      expect(feeBlocksNewHire(owed({ demandSentAt: stamp(999) }), bad as number, now)).toBe(false);
    }
  });

  it('takes the grace period from its argument, so config drives it', () => {
    const fee = owed({ demandSentAt: stamp(9) });
    expect(feeBlocksNewHire(fee, 7, now)).toBe(true);
    expect(feeBlocksNewHire(fee, 14, now)).toBe(false);
  });
});

describe('feeRateOf', () => {
  it('converts the config percent to the fraction a fee document stores', () => {
    expect(feeRateOf({ ...CONFIG_DEFAULTS, feePercent: 3 })).toBeCloseTo(0.03);
    expect(feeRateOf({ ...CONFIG_DEFAULTS, feePercent: 12.5 })).toBeCloseTo(0.125);
  });
});

describe('withinDisputeWindow', () => {
  it('is true up to and including the deadline', () => {
    expect(withinDisputeWindow(1_000, 999)).toBe(true);
    expect(withinDisputeWindow(1_000, 1_000)).toBe(true);
  });
  it('is false after it', () => {
    expect(withinDisputeWindow(1_000, 1_001)).toBe(false);
  });
  it('is false with no deadline — the caller must not treat that as open', () => {
    expect(withinDisputeWindow(undefined, 0)).toBe(false);
    expect(withinDisputeWindow(NaN, 0)).toBe(false);
  });
});
