import { canDispute, canMarkComplete } from '../completion';
import type { ProjectFee } from '@core/types/project';

const ts = (ms: number) => ({ seconds: Math.floor(ms / 1000), nanoseconds: 0 });
type DisputeInput = Pick<
  ProjectFee, 'engagementStatus' | 'chargeDueAt' | 'disputeWindowEndsAt'
>;
const engagement = (over: Partial<DisputeInput> = {}): DisputeInput => ({
  engagementStatus: 'completed',
  chargeDueAt: ts(2_000_000_000) as never,
  ...over,
});

/**
 * Mirrors the server guard, which reads `contestWindowEndsAt()`. If these
 * disagree the button either appears when the callable will refuse, or hides
 * while it would accept.
 *
 * It takes an ENGAGEMENT, not a project: the window is per engagement now, and
 * the project-level field is a roll-up that describes somebody else's deadline
 * as often as this professional's.
 */
describe('canDispute', () => {
  it('allows a contest inside the window', () => {
    expect(canDispute(engagement(), 1_999_999_000)).toBe(true);
  });

  it('allows it exactly on the deadline', () => {
    expect(canDispute(engagement(), 2_000_000_000)).toBe(true);
  });

  it('refuses one millisecond after', () => {
    expect(canDispute(engagement(), 2_000_000_001)).toBe(false);
  });

  it.each(['hired', 'end_requested_by_pro', 'disputed', 'withdrawn', 'cancelled'] as const)(
    'refuses while the engagement is %s — nothing is completed to contest',
    (engagementStatus) => {
      expect(canDispute(engagement({ engagementStatus }), 1_000)).toBe(false);
    },
  );

  it('refuses when there is no engagement at all', () => {
    expect(canDispute(null, 1_000)).toBe(false);
    expect(canDispute(undefined, 1_000)).toBe(false);
  });

  it('falls back to disputeWindowEndsAt on records from before the collapse', () => {
    // The two fields meant the same thing for one commit. New engagements carry
    // chargeDueAt; these older ones still carry the predecessor, and both the
    // client and the server read them through one accessor so they cannot
    // disagree about which window applies.
    const old = engagement({ chargeDueAt: undefined, disputeWindowEndsAt: ts(2_000_000_000) as never });
    expect(canDispute(old, 1_999_999_000)).toBe(true);
    expect(canDispute(old, 2_000_000_001)).toBe(false);
  });

  it('prefers chargeDueAt when a record carries both', () => {
    expect(canDispute(
      engagement({
        chargeDueAt: ts(2_000_000_000) as never,
        disputeWindowEndsAt: ts(1_000_000_000) as never,
      }),
      1_999_999_000,
    )).toBe(true);
  });

  it('defers to the server when no window was stamped at all', () => {
    expect(canDispute(
      engagement({ chargeDueAt: undefined, disputeWindowEndsAt: undefined }), 1_000,
    )).toBe(false);
  });
});

/**
 * Mirrors `completeEngagementInternal`'s guard, which refuses only when the
 * engagement is already terminal. If these drift the button either appears when
 * the callable will refuse, or hides while it would accept.
 */
describe('canMarkComplete', () => {
  const eng = (engagementStatus?: string) => ({ engagementStatus } as never);

  it('allows a hired engagement', () => {
    expect(canMarkComplete(eng('hired'))).toBe(true);
  });

  it('reads a missing status as hired — the pre-Phase-1 records', () => {
    // Thousands of fee documents predate `engagementStatus`. The server and the
    // derivation both default them to 'hired'; a UI that defaulted the other way
    // would leave every one of them with no way to complete.
    expect(canMarkComplete(eng(undefined))).toBe(true);
  });

  it('allows one the CLIENT has asked to end', () => {
    expect(canMarkComplete(eng('end_requested_by_client'))).toBe(true);
  });

  it.each(['completed', 'withdrawn', 'cancelled'] as const)(
    'refuses %s — the server calls it terminal and would reject the call',
    (status) => expect(canMarkComplete(eng(status))).toBe(false),
  );

  it('refuses while the professional has an end request of their own open', () => {
    // The server would accept it — `end_requested_by_pro` is not in its TERMINAL
    // set — but offering "I finished my part" beside their own pending request
    // to leave asks them to contradict themselves in one screen.
    expect(canMarkComplete(eng('end_requested_by_pro'))).toBe(false);
  });

  it('refuses a DISPUTED engagement, deliberately narrower than the server', () => {
    // The server's TERMINAL set excludes 'disputed', so the callable would let a
    // re-completion through. That contest is in front of an admin; offering to
    // complete around it is incoherent. Narrower than the server is the safe
    // direction — the reverse shows a button the callable then refuses.
    expect(canMarkComplete(eng('disputed'))).toBe(false);
  });

  it('refuses when there is no engagement at all', () => {
    expect(canMarkComplete(null)).toBe(false);
    expect(canMarkComplete(undefined)).toBe(false);
  });
});
