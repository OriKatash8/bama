import { deriveProjectState } from '../derive';

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
