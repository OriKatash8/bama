/**
 * Bounds and status predicates, imported from the ENFORCING copy in
 * functions/src — not a client mirror. The client constants file duplicates the
 * numbers for its error message only; the logic has one home.
 */
import {
  isOfferPriceValid, canHireOnStatus, MIN_OFFER_PRICE, MAX_OFFER_PRICE, HIREABLE_STATUSES,
  hireConsumesNewSlot, atSlotCap, atMonthlyLimit, monthCountFor,
  NON_SUBSCRIBER_SLOT_CAP, SUBSCRIBER_MONTHLY_LIMIT,
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
 * mirror hire.ts's control flow: hireConsumesNewSlot gates whether the cap /
 * monthly checks run at all, and whether monthCount is incremented afterwards.
 *
 * PRO and OTHER are two professionals; HERE is the project being hired onto.
 */
const PRO = 'pro-uid';
const OTHER = 'other-uid';

/** The decision hire.ts makes, expressed exactly as its branches do. */
function verdict(input: {
  slotHolders?: string[];
  isSubscriber: boolean;
  /** What the cap query would return. Only consulted when a new slot is taken. */
  slotProjectCount: number;
  monthCount: number;
}): { allowed: boolean; reason?: string; monthCountDelta: number } {
  const consumesNewSlot = hireConsumesNewSlot(input.slotHolders, PRO);
  if (consumesNewSlot) {
    if (input.isSubscriber) {
      if (atMonthlyLimit(input.monthCount)) return { allowed: false, reason: 'monthly-limit-reached', monthCountDelta: 0 };
    } else if (atSlotCap(input.slotProjectCount)) {
      return { allowed: false, reason: 'slot-cap-reached', monthCountDelta: 0 };
    }
  }
  return { allowed: true, monthCountDelta: input.isSubscriber && consumesNewSlot ? 1 : 0 };
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
  it('pro AT the cap takes a second role on a project they already hold → ALLOW', () => {
    // The regression: the cap query counts the current project, so this used to
    // be refused with slot-cap-reached even though arrayUnion was a no-op.
    const v = verdict({
      slotHolders: [PRO], isSubscriber: false,
      slotProjectCount: NON_SUBSCRIBER_SLOT_CAP, monthCount: 0,
    });
    expect(v.allowed).toBe(true);
    expect(v.reason).toBeUndefined();
  });

  it('pro AT the cap takes a role on a NEW project → still denied', () => {
    const v = verdict({
      slotHolders: [OTHER], isSubscriber: false,
      slotProjectCount: NON_SUBSCRIBER_SLOT_CAP, monthCount: 0,
    });
    expect(v.allowed).toBe(false);
    expect(v.reason).toBe('slot-cap-reached');
  });

  it('pro BELOW the cap on a new project → allowed', () => {
    const v = verdict({
      slotHolders: [], isSubscriber: false,
      slotProjectCount: NON_SUBSCRIBER_SLOT_CAP - 1, monthCount: 0,
    });
    expect(v.allowed).toBe(true);
  });

  it('a pro who SETTLED EARLY is re-hired on that same project → still denied at the cap', () => {
    // They left slotHolders when their fee settled but remain in professionalIds.
    // Re-hiring genuinely needs a slot again, so keying on professionalIds would
    // have handed them a free engagement. slotHolders is what decides.
    const settledSoNotHolding: string[] = [];
    const v = verdict({
      slotHolders: settledSoNotHolding, isSubscriber: false,
      slotProjectCount: NON_SUBSCRIBER_SLOT_CAP, monthCount: 0,
    });
    expect(v.allowed).toBe(false);
    expect(v.reason).toBe('slot-cap-reached');
  });
});

describe('subscriber monthly counter', () => {
  it('second role on the same project → monthCount UNCHANGED', () => {
    const v = verdict({
      slotHolders: [PRO], isSubscriber: true, slotProjectCount: 99, monthCount: 3,
    });
    expect(v.allowed).toBe(true);
    expect(v.monthCountDelta).toBe(0);
  });

  it('first role on a NEW project → monthCount + 1', () => {
    const v = verdict({
      slotHolders: [], isSubscriber: true, slotProjectCount: 0, monthCount: 3,
    });
    expect(v.allowed).toBe(true);
    expect(v.monthCountDelta).toBe(1);
  });

  it('AT the monthly limit, second role on a project they are on → ALLOW, still no charge', () => {
    const v = verdict({
      slotHolders: [PRO], isSubscriber: true,
      slotProjectCount: 0, monthCount: SUBSCRIBER_MONTHLY_LIMIT,
    });
    expect(v.allowed).toBe(true);
    expect(v.monthCountDelta).toBe(0);
  });

  it('AT the monthly limit, first role on a new project → denied', () => {
    const v = verdict({
      slotHolders: [], isSubscriber: true,
      slotProjectCount: 0, monthCount: SUBSCRIBER_MONTHLY_LIMIT,
    });
    expect(v.allowed).toBe(false);
    expect(v.reason).toBe('monthly-limit-reached');
  });

  it('a bundle and two separate offers cost the same', () => {
    // Bundle: ONE commitHire, pro not yet holding -> 1 credit.
    const bundle = verdict({ slotHolders: [], isSubscriber: true, slotProjectCount: 0, monthCount: 0 });
    // Separate offers: two commitHires. The first is identical to the bundle; the
    // second finds the pro already in slotHolders and costs nothing.
    const first = verdict({ slotHolders: [], isSubscriber: true, slotProjectCount: 0, monthCount: 0 });
    const second = verdict({ slotHolders: [PRO], isSubscriber: true, slotProjectCount: 0, monthCount: 1 });
    expect(bundle.monthCountDelta).toBe(1);
    expect(first.monthCountDelta + second.monthCountDelta).toBe(1);
  });
});

describe('monthCountFor', () => {
  it('reads the counter within the same month', () => {
    expect(monthCountFor({ monthKey: '2026-09', monthCount: 4 }, '2026-09')).toBe(4);
  });
  it('resets on a month rollover', () => {
    expect(monthCountFor({ monthKey: '2026-08', monthCount: 9 }, '2026-09')).toBe(0);
  });
  it('treats a missing or malformed subscription as 0', () => {
    expect(monthCountFor(null, '2026-09')).toBe(0);
    expect(monthCountFor(undefined, '2026-09')).toBe(0);
    expect(monthCountFor({ monthKey: '2026-09' }, '2026-09')).toBe(0);
    expect(monthCountFor({ monthKey: '2026-09', monthCount: 'x' }, '2026-09')).toBe(0);
  });
});

describe('atSlotCap / atMonthlyLimit boundaries', () => {
  it('atSlotCap fires at the cap, not before', () => {
    expect(atSlotCap(NON_SUBSCRIBER_SLOT_CAP - 1)).toBe(false);
    expect(atSlotCap(NON_SUBSCRIBER_SLOT_CAP)).toBe(true);
  });
  it('atMonthlyLimit fires at the limit, not before', () => {
    expect(atMonthlyLimit(SUBSCRIBER_MONTHLY_LIMIT - 1)).toBe(false);
    expect(atMonthlyLimit(SUBSCRIBER_MONTHLY_LIMIT)).toBe(true);
  });
});
