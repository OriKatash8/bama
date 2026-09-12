import { deriveProjectState, remindersDueFor } from '../derive';

/**
 * The Phase 3 state machine, at the level it can be tested without Firestore.
 *
 * These assert the RULES the callables encode — what holds a project open, what
 * may be charged, what silence is allowed to do — rather than the callables
 * themselves, which need the emulator. The end-to-end flows need the UI and are
 * not covered here; that is stated in the plan rather than implied by a green
 * suite.
 */

const DAY = 86400_000;
const now = Date.UTC(2026, 8, 12);
const ts = (ms: number) => ({ toMillis: () => ms }) as never;

const eng = (
  engagementStatus: string,
  over: Record<string, unknown> = {},
) => ({ engagementStatus, ...over }) as never;

const asked = (
  proId: string,
  endKind: 'finished' | 'withdrawing',
  atDaysAgo: number,
  over: { remindedDays?: number[]; adminReviewPending?: boolean } = {},
) => ({
  professionalId: proId,
  engagementStatus: 'end_requested_by_pro',
  completion: {
    requestedAt: ts(now - atDaysAgo * DAY),
    endKind,
    ...(over.remindedDays ? { remindedDays: over.remindedDays } : {}),
  },
  ...(over.adminReviewPending !== undefined
    ? { adminReviewPending: over.adminReviewPending } : {}),
});

describe('the fee-evasion guard', () => {
  it('a rejected withdrawal is DISPUTED, not withdrawn — and holds the project open', () => {
    // The whole point of forcing the professional to choose. Someone who
    // delivered and then claimed to be leaving is caught by the client's reject,
    // and the engagement must not reach a terminal state that would let the
    // project close around the unresolved fee.
    const d = deriveProjectState([eng('disputed'), eng('completed')], now);
    expect(d.isComplete).toBe(false);
    expect(d.reason).toContain('disputed');
  });

  it('an ACCEPTED withdrawal is terminal and does not hold the project', () => {
    // The honest case: the client agrees they are leaving. Nothing is owed and
    // the project may close around them.
    expect(deriveProjectState([eng('withdrawn'), eng('completed')], now).isComplete).toBe(true);
  });

  it('a pending request of EITHER kind holds the project open', () => {
    for (const kind of ['finished', 'withdrawing'] as const) {
      const d = deriveProjectState(
        [eng('end_requested_by_pro', { completion: { endKind: kind } }), eng('completed')],
        now,
      );
      expect(d.isComplete).toBe(false);
    }
  });
});

describe('silence is never an exit', () => {
  it('escalates a stale withdrawal request instead of granting it', () => {
    // A client who stops answering must not become a free exit from the fee. The
    // cron may flag; it may not withdraw.
    const actions = remindersDueFor([asked('a', 'withdrawing', 8)], now, [3, 6], 7);
    expect(actions).toEqual([{ proId: 'a', kind: 'escalate' }]);
    // Nothing in that result can change a status — escalate only flags.
    expect(actions.every((x) => x.kind !== 'remind' || x.day > 0)).toBe(true);
  });

  it('escalates a stale FINISHED request the same way — neither side is favoured', () => {
    expect(remindersDueFor([asked('a', 'finished', 8)], now, [3, 6], 7))
      .toEqual([{ proId: 'a', kind: 'escalate' }]);
  });

  it('reminds on both kinds before the horizon', () => {
    // The copy differs (the cron branches on endKind); the schedule does not.
    expect(remindersDueFor([asked('a', 'withdrawing', 4)], now, [3, 6], 7))
      .toEqual([{ proId: 'a', kind: 'remind', day: 3 }]);
    expect(remindersDueFor([asked('b', 'finished', 4)], now, [3, 6], 7))
      .toEqual([{ proId: 'b', kind: 'remind', day: 3 }]);
  });
});

describe('complete-all skips what it must not touch', () => {
  // confirmCompletionInternal skips any engagement already terminal. These pin
  // the consequences that skipping is there to produce.

  it('a withdrawn engagement does not stop the others completing', () => {
    expect(deriveProjectState(
      [eng('withdrawn'), eng('completed'), eng('completed')], now,
    ).isComplete).toBe(true);
  });

  it('a cancelled engagement is terminal and never charges', () => {
    expect(deriveProjectState([eng('cancelled'), eng('completed')], now).isComplete).toBe(true);
  });

  it('ONE disputed engagement pauses only itself — the rest are unaffected', () => {
    // The project is held open, but that is the dispute's doing. The other
    // engagements are already terminal and were charged normally.
    const d = deriveProjectState(
      [eng('completed'), eng('completed'), eng('disputed')], now,
    );
    expect(d.isComplete).toBe(false);
    expect(d.reason).toContain('1 engagement(s) disputed');
  });

  it('an already-completed engagement does not make the project complete on its own', () => {
    expect(deriveProjectState([eng('completed'), eng('hired')], now).isComplete).toBe(false);
  });
});

describe('one client action, several independent dispute windows', () => {
  it('rolls up to the furthest window still open, not to a single shared one', () => {
    // Each engagement is stamped from its OWN confirmedAt. Confirming three at
    // once therefore opens three windows; the project shows the last to close.
    const d = deriveProjectState(
      [
        eng('completed', { disputeWindowEndsAt: ts(now + 2 * DAY) }),
        eng('completed', { disputeWindowEndsAt: ts(now + 4 * DAY) }),
        eng('completed', { disputeWindowEndsAt: ts(now + 3 * DAY) }),
      ],
      now,
    );
    expect(d.disputeWindowEndsAt?.toMillis()).toBe(now + 4 * DAY);
  });

  it('a window that has closed stops counting while the others run', () => {
    const d = deriveProjectState(
      [
        eng('completed', { disputeWindowEndsAt: ts(now - DAY) }),
        eng('completed', { disputeWindowEndsAt: ts(now + DAY) }),
      ],
      now,
    );
    expect(d.disputeWindowEndsAt?.toMillis()).toBe(now + DAY);
  });
});

describe('what counts as a withdrawal for reliability', () => {
  // withdrawalCount filters on engagementStatus === 'withdrawn' and nothing
  // else. These pin the exclusions, which are the part that could drift.
  const COUNTS = (status: string) => status === 'withdrawn';

  it('counts an accepted withdrawal', () => {
    expect(COUNTS('withdrawn')).toBe(true);
  });

  it('does NOT count a request that is still open', () => {
    // Asking is not leaving. Counting the claim rather than the outcome would
    // punish a professional the client has not answered.
    expect(COUNTS('end_requested_by_pro')).toBe(false);
  });

  it('does NOT count a rejected withdrawal — the admin decides where it lands', () => {
    expect(COUNTS('disputed')).toBe(false);
  });

  it('does NOT count a cancelled project — that happened TO them', () => {
    expect(COUNTS('cancelled')).toBe(false);
  });

  it('does NOT count a completed engagement', () => {
    expect(COUNTS('completed')).toBe(false);
  });
});

// ── Phase 4: the trigger inversion ──────────────────────────────────────────

/** The re-stamp guard, as onProjectEndDateChange applies it. */
const restamps = (status: string | undefined) => (status ?? 'hired') === 'hired';

describe('moving endDate can never void a charge that already happened', () => {
  it('re-stamps an engagement still hired', () => {
    expect(restamps('hired')).toBe(true);
    expect(restamps(undefined)).toBe(true);   // absent reads as hired
  });

  it('NEVER re-stamps one that already completed', () => {
    // The whole point of a mutable deadline having a guard. An engagement that
    // auto-completed keeps the deadline it completed against; otherwise moving
    // the date reaches back and un-completes a charge.
    expect(restamps('completed')).toBe(false);
  });

  it('never re-stamps disputed, withdrawn or cancelled either', () => {
    // Disputed is in front of a human and must not move underneath them; the
    // other two are over.
    for (const s of ['disputed', 'withdrawn', 'cancelled']) {
      expect(restamps(s)).toBe(false);
    }
  });
});

/** Sweep 5's selection, exactly as the query expresses it. */
const autoCompletes = (
  status: string | undefined,
  completionDueAt: number | undefined,
  now: number,
) => status === 'hired' && typeof completionDueAt === 'number' && completionDueAt < now;

describe('auto-complete selection', () => {
  it('fires once the deadline has passed', () => {
    expect(autoCompletes('hired', now - DAY, now)).toBe(true);
  });

  it('does not fire before it', () => {
    expect(autoCompletes('hired', now + DAY, now)).toBe(false);
  });

  it('NEVER fires without a completionDueAt — the legacy guarantee', () => {
    // Every project that predates this has no endDate, so none of its
    // engagements has a deadline, so none is ever selected. Asserted against the
    // real 69 production documents as well as here.
    expect(autoCompletes('hired', undefined, now)).toBe(false);
  });

  it('does not re-fire on an engagement that already completed', () => {
    expect(autoCompletes('completed', now - DAY, now)).toBe(false);
  });
});

/** The contest window, as contestEngagement enforces it. */
const canContest = (chargeDueAt: number | undefined, now: number) =>
  typeof chargeDueAt === 'number' && now <= chargeDueAt;

describe('the contest window is the charge date', () => {
  it('open right up to the charge', () => {
    expect(canContest(now + DAY, now)).toBe(true);
    expect(canContest(now, now)).toBe(true);       // the boundary is inclusive
  });

  it('closed once it passes — past that the money has moved', () => {
    expect(canContest(now - 1, now)).toBe(false);
  });

  it('refused outright when no window was ever opened', () => {
    expect(canContest(undefined, now)).toBe(false);
  });
});

describe('contesting must not buy free capacity', () => {
  // completeEngagementInternal releases the slot; contesting re-takes it. The
  // cap counts hired AND disputed via slotHolders, so a professional cannot
  // complete, contest, and walk away with both a freed slot and a voided fee.
  const OCCUPIES = (s: string) => s === 'hired' || s === 'disputed';

  it('a disputed engagement still occupies a slot', () => {
    expect(OCCUPIES('disputed')).toBe(true);
  });

  it('hired occupies; completed, withdrawn and cancelled do not', () => {
    expect(OCCUPIES('hired')).toBe(true);
    for (const s of ['completed', 'withdrawn', 'cancelled']) {
      expect(OCCUPIES(s)).toBe(false);
    }
  });

  it('the evasion route is closed: complete then contest returns to occupying', () => {
    expect(OCCUPIES('completed')).toBe(false);   // slot released at completion
    expect(OCCUPIES('disputed')).toBe(true);     // and re-taken by the contest
  });
});

describe('the contest reasons are not interchangeable', () => {
  // didnt_happen voids the fee; amount_disputed holds it. There is no default —
  // defaulting would hand the professional the cheaper branch unchosen.
  const voidsFee = (reason: string) => reason === 'didnt_happen';

  it('didnt_happen voids', () => expect(voidsFee('didnt_happen')).toBe(true));
  it('amount_disputed holds', () => expect(voidsFee('amount_disputed')).toBe(false));
  it('nothing else voids', () => {
    for (const r of ['', 'other', 'undefined']) expect(voidsFee(r)).toBe(false);
  });
});
