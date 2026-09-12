import { deriveProjectState, remindersDueFor } from '../derive';

const DAY = 86400_000;
const now = Date.UTC(2026, 8, 12);
const ts = (ms: number) => ({ toMillis: () => ms }) as never;
const e = (engagementStatus: string, over: Record<string, unknown> = {}) =>
  ({ engagementStatus, ...over }) as never;

describe('deriveProjectState — the project rolls up from its engagements', () => {
  it('is NOT complete with no engagements', () => {
    // A project nobody is hired on has not finished; it has not started. If this
    // returned complete, canHireOnStatus would slam the door on every new project.
    const d = deriveProjectState([], now);
    expect(d.isComplete).toBe(false);
    expect(d.reason).toBe('no engagements');
  });

  it('is complete only when EVERY engagement is terminal', () => {
    expect(deriveProjectState([e('completed'), e('completed')], now).isComplete).toBe(true);
    expect(deriveProjectState([e('completed'), e('hired')], now).isComplete).toBe(false);
    expect(deriveProjectState([e('completed'), e('end_requested_by_pro')], now).isComplete).toBe(false);
    expect(deriveProjectState([e('completed'), e('end_requested_by_client')], now).isComplete).toBe(false);
  });

  it('counts withdrawn and cancelled as terminal — they do not block completion', () => {
    expect(deriveProjectState([e('completed'), e('withdrawn')], now).isComplete).toBe(true);
    expect(deriveProjectState([e('completed'), e('cancelled')], now).isComplete).toBe(true);
  });

  it('completes a project where EVERYONE withdrew, and says nobody delivered', () => {
    const d = deriveProjectState([e('withdrawn'), e('withdrawn')], now);
    expect(d.isComplete).toBe(true);
    expect(d.reason).toContain('none delivered');
  });

  it('ONE dispute holds the project open however many others finished', () => {
    const d = deriveProjectState([e('completed'), e('completed'), e('disputed')], now);
    expect(d.isComplete).toBe(false);
    expect(d.reason).toContain('disputed');
  });

  it('reports disputed even when every other engagement is terminal', () => {
    // 'disputed' is not in the terminal set, so the open-count branch would also
    // catch it — but the reason has to say WHY, and "still open" would be wrong.
    expect(deriveProjectState([e('disputed')], now).reason).toContain('disputed');
  });

  it('treats a missing engagementStatus as open, never as terminal', () => {
    // Fail safe: an engagement written by a path that forgot the field must hold
    // the project open rather than silently completing it.
    expect(deriveProjectState([e(undefined as never)], now).isComplete).toBe(false);
  });
});

describe('disputeWindowEndsAt — max of the OPEN windows, display only', () => {
  it('takes the furthest window still open', () => {
    const d = deriveProjectState(
      [
        e('completed', { disputeWindowEndsAt: ts(now + 2 * DAY) }),
        e('completed', { disputeWindowEndsAt: ts(now + 5 * DAY) }),
      ],
      now,
    );
    expect(d.disputeWindowEndsAt?.toMillis()).toBe(now + 5 * DAY);
  });

  it('ignores windows that have already closed', () => {
    const d = deriveProjectState(
      [
        e('completed', { disputeWindowEndsAt: ts(now - DAY) }),
        e('completed', { disputeWindowEndsAt: ts(now + DAY) }),
      ],
      now,
    );
    expect(d.disputeWindowEndsAt?.toMillis()).toBe(now + DAY);
  });

  it('is null when every window has closed', () => {
    const d = deriveProjectState([e('completed', { disputeWindowEndsAt: ts(now - DAY) })], now);
    expect(d.disputeWindowEndsAt).toBeNull();
  });

  it('is null when no engagement has one', () => {
    expect(deriveProjectState([e('hired')], now).disputeWindowEndsAt).toBeNull();
  });
});

describe('adminReviewPending — any engagement raises it', () => {
  it('is true when one engagement needs a human', () => {
    expect(deriveProjectState([e('completed'), e('disputed', { adminReviewPending: true })], now)
      .adminReviewPending).toBe(true);
  });

  it('is false when none does', () => {
    expect(deriveProjectState([e('completed'), e('completed')], now).adminReviewPending).toBe(false);
  });

  it('is reported independently of completeness', () => {
    // A flagged engagement on an otherwise-finished project still needs the flag
    // surfaced, even though the dispute already holds isComplete false.
    const d = deriveProjectState([e('disputed', { adminReviewPending: true })], now);
    expect(d.isComplete).toBe(false);
    expect(d.adminReviewPending).toBe(true);
  });
});

// ── the project cache's completion state ──────────────────────────────────────

describe('completionState + endRequestedAt — the cron cache', () => {
  const req = (proId: string, at: number, over: Record<string, unknown> = {}) =>
    e('end_requested_by_pro', {
      professionalId: proId,
      completion: { requestedAt: ts(at) },
      ...over,
    });

  it('surfaces as requested while any end-request is open', () => {
    // Without this the project is invisible to sweep 2 and the reminder never
    // fires — the break that made option A necessary.
    expect(deriveProjectState([req('a', now)], now).completionState).toBe('requested');
  });

  it('takes the MIN request, not the max — the oldest waiter sets the clock', () => {
    const d = deriveProjectState([req('a', now - 5 * DAY), req('b', now - DAY)], now);
    expect(d.endRequestedAt?.toMillis()).toBe(now - 5 * DAY);
  });

  it('is the OPPOSITE direction to disputeWindowEndsAt, deliberately', () => {
    // Same two engagements, both fields, opposite ends. This test exists so the
    // asymmetry is pinned rather than "corrected" later.
    const d = deriveProjectState(
      [
        req('a', now - 5 * DAY, { disputeWindowEndsAt: ts(now + DAY) }),
        req('b', now - DAY, { disputeWindowEndsAt: ts(now + 5 * DAY) }),
      ],
      now,
    );
    expect(d.endRequestedAt?.toMillis()).toBe(now - 5 * DAY);   // min
    expect(d.disputeWindowEndsAt?.toMillis()).toBe(now + 5 * DAY); // max
  });

  it('falls back to none once every request is answered', () => {
    expect(deriveProjectState([e('completed'), e('hired')], now).completionState).toBe('none');
  });

  it('is confirmed only when the whole project rolls up', () => {
    expect(deriveProjectState([e('completed'), e('withdrawn')], now).completionState).toBe('confirmed');
  });
});

// ── the stale-cache window ────────────────────────────────────────────────────

describe('remindersDueFor — the cache selects, the engagement decides', () => {
  const REMIND = [3, 6];
  const AUTO = 7;
  const req = (
    proId: string,
    at: number,
    over: { remindedDays?: number[]; adminReviewPending?: boolean } = {},
  ) => ({
    professionalId: proId,
    engagementStatus: 'end_requested_by_pro',
    completion: {
      requestedAt: ts(at),
      ...(over.remindedDays ? { remindedDays: over.remindedDays } : {}),
    },
    ...(over.adminReviewPending !== undefined
      ? { adminReviewPending: over.adminReviewPending }
      : {}),
  });

  it('STALE-LOW: judges each engagement on its own timestamp, not the cache min', () => {
    // The project was selected because the cache said requestedAt = now-6d,
    // taken from A. A has since been confirmed by another path. B is still
    // requested, but only 4 days old.
    const actions = remindersDueFor(
      [
        { professionalId: 'a', engagementStatus: 'completed', completion: { requestedAt: ts(now - 6 * DAY) } },
        req('b', now - 4 * DAY),
      ],
      now, REMIND, AUTO,
    );
    // A is terminal: nothing, however stale the cache that selected the project.
    expect(actions.filter((x) => x.proId === 'a')).toEqual([]);
    // B is judged on ITS OWN 4 days — day 3 only, not day 6.
    expect(actions).toEqual([{ proId: 'b', kind: 'remind', day: 3 }]);
  });

  it('STALE-LATE: a request opened DURING the lag window is judged on its own, earlier, timestamp', () => {
    // The direction min() can go stale that produces no visible error, only a
    // late reminder. The cache was stamped from B at T1. A then opened an
    // EARLIER request at T0 inside the lag window before the derivation re-ran,
    // so projects/{id}.completion.requestedAt now points LATER than the oldest
    // open request — and the outer query is a range filter on exactly that field.
    //
    // Consequence worth naming: the project surfaces to sweep 2 late, by however
    // long the lag is. It self-heals, because requestCompletion calls
    // applyDerivedProjectState immediately after committing, so the window is one
    // round trip. What must NOT happen is A being judged on the stale T1 once the
    // project is selected — that would compound a scheduling lag into a wrong
    // decision.
    const T1 = now - 2 * DAY;     // B, the value the cache holds
    const T0 = now - 6 * DAY;     // A, older, opened during the lag
    const actions = remindersDueFor([req('b', T1), req('a', T0)], now, REMIND, AUTO);

    // A is 6 days old on its OWN clock: both reminder days are due.
    expect(actions.filter((x) => x.proId === 'a')).toEqual([
      { proId: 'a', kind: 'remind', day: 3 },
      { proId: 'a', kind: 'remind', day: 6 },
    ]);
    // B is 2 days old: nothing yet. Had either been judged on the other's
    // timestamp, A would be silently under-reminded or B over-reminded.
    expect(actions.filter((x) => x.proId === 'b')).toEqual([]);
  });

  it('STALE-HIGH: does nothing at all when every engagement has gone terminal', () => {
    // The cron selected a project whose work finished between the cache write
    // and the sweep. It must do nothing rather than something wrong.
    expect(remindersDueFor(
      [
        { professionalId: 'a', engagementStatus: 'completed', completion: { requestedAt: ts(now - 9 * DAY) } },
        { professionalId: 'b', engagementStatus: 'withdrawn', completion: { requestedAt: ts(now - 9 * DAY) } },
      ],
      now, REMIND, AUTO,
    )).toEqual([]);
  });

  it('IDEMPOTENCY IS PER ENGAGEMENT — the bug the project-level array had', () => {
    // A was already reminded on day 3. Under the old single project-level
    // remindedDays that suppressed B's day-3 reminder too. It must not.
    const actions = remindersDueFor(
      [
        req('a', now - 4 * DAY, { remindedDays: [3] }),
        req('b', now - 4 * DAY),
      ],
      now, REMIND, AUTO,
    );
    expect(actions).toEqual([{ proId: 'b', kind: 'remind', day: 3 }]);
  });

  it('escalates past the auto-confirm horizon instead of confirming', () => {
    expect(remindersDueFor([req('a', now - 8 * DAY)], now, REMIND, AUTO))
      .toEqual([{ proId: 'a', kind: 'escalate' }]);
  });

  it('does not re-escalate one already flagged', () => {
    expect(remindersDueFor(
      [req('a', now - 8 * DAY, { adminReviewPending: true })], now, REMIND, AUTO,
    )).toEqual([]);
  });

  it('emits both due days when a request skipped a sweep', () => {
    // The cron missed a day; day 3 and day 6 are both owed and neither is
    // recorded. Both fire rather than only the latest.
    expect(remindersDueFor([req('a', now - 6 * DAY)], now, REMIND, AUTO))
      .toEqual([{ proId: 'a', kind: 'remind', day: 3 }, { proId: 'a', kind: 'remind', day: 6 }]);
  });

  it('ignores an end-request with no timestamp rather than reminding on NaN', () => {
    expect(remindersDueFor(
      [{ professionalId: 'a', engagementStatus: 'end_requested_by_pro', completion: {} }],
      now, REMIND, AUTO,
    )).toEqual([]);
  });
});
