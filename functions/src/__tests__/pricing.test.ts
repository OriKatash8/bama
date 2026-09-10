/**
 * Bounds and status predicates, imported from the ENFORCING copy in
 * functions/src — not a client mirror. The client constants file duplicates the
 * numbers for its error message only; the logic has one home.
 */
import {
  isOfferPriceValid, canHireOnStatus, MIN_OFFER_PRICE, MAX_OFFER_PRICE, HIREABLE_STATUSES,
  hireConsumesNewSlot, atSlotCap,
  resolveConfig, feeRateOf, withinDisputeWindow, CONFIG_DEFAULTS,
  DEFAULT_MAX_OPEN_PROJECTS,
} from '../pricing';

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
