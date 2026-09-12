import { db, feesCol, type FeeDoc } from './helpers';
import * as admin from 'firebase-admin';

type Update = admin.firestore.UpdateData<admin.firestore.DocumentData>;

/**
 * The project's completion state, DERIVED from the engagements underneath it.
 *
 * This is the whole of the rule, in one place, deliberately. Every path that can
 * move an engagement — hire, confirm, withdraw, cancel, dispute, the cron — calls
 * `applyDerivedProjectState` afterwards rather than reasoning about the project
 * itself. Inlining it per call site is how the project and its engagements drift.
 *
 * The project-level fields are now a CACHE. They are still written, still read by
 * the noticeboard, the chat list and the offers screens, and still the thing
 * `canHireOnStatus` gates on — but nothing decides anything from them that is not
 * recomputable from the engagements. Removing them is a later commit, once the
 * read paths are confirmed.
 *
 * NOT ATOMIC with the batch that moved the engagement, and that is a deliberate
 * trade. A cache that lags by one round trip is recoverable — the next call to
 * any path re-derives it, and a repair script can rebuild every project from its
 * engagements. Making it atomic would mean folding a collection read into every
 * lifecycle transaction, and Firestore transactions cannot query.
 */

/** Statuses that mean this engagement will not change again by itself. */
const TERMINAL = new Set(['completed', 'withdrawn', 'cancelled']);

/** Statuses that mean nothing is owed and nothing is expected. A project may
 *  complete around them; they are not "done work", they are "not work". */
const NON_CHARGING = new Set(['withdrawn', 'cancelled']);

export type DerivedProjectState = {
  /** True when every engagement is terminal and none is disputed. */
  isComplete: boolean;
  /** Why not, when not — for the caller's logs, not for storage. */
  reason: string;
  /** max() of the engagements' own windows that are still open at `now`, or null
   *  when none are. Display only: each engagement's own field is authoritative,
   *  and `disputeFeeByPro` reads that one. */
  disputeWindowEndsAt: admin.firestore.Timestamp | null;
  /** True when ANY engagement needs a human. */
  adminReviewPending: boolean;
  /** State for the project-level cache. 'requested' exists ONLY so lifecycleCron
   *  sweep 2 can still find this project with its existing composite index. */
  completionState: 'none' | 'requested' | 'confirmed';
  /**
   * min() of the open end-requests' `requestedAt`, or null when none is open.
   *
   * MIN, and the field three lines above takes MAX — read together they look
   * like an inconsistency, so: a dispute window must survive until the LAST one
   * closes, or somebody loses a right they were given. A reminder sweep must
   * surface this project as soon as the OLDEST request goes stale, or the
   * professional who has been waiting longest is the one who waits longer.
   * Opposite directions, same principle: neither may be cut short.
   */
  endRequestedAt: admin.firestore.Timestamp | null;
};

/**
 * Pure. No Firestore, so the whole table is unit-testable.
 *
 * An empty engagement list is NOT complete. A project with no one hired has not
 * finished; it has not started, and `canHireOnStatus` must keep letting people
 * onto it.
 */
export function deriveProjectState(
  engagements: readonly Pick<
    FeeDoc, 'engagementStatus' | 'disputeWindowEndsAt' | 'adminReviewPending' | 'completion'
  >[],
  now: number = Date.now(),
): DerivedProjectState {
  const openWindows = engagements
    .map((e) => e.disputeWindowEndsAt)
    .filter((ts): ts is admin.firestore.Timestamp => !!ts && ts.toMillis() > now);
  const disputeWindowEndsAt = openWindows.length
    ? openWindows.reduce((a, b) => (a.toMillis() >= b.toMillis() ? a : b))
    : null;
  const adminReviewPending = engagements.some((e) => e.adminReviewPending === true);

  const openRequests = engagements
    .filter((e) => e.engagementStatus === 'end_requested_by_pro'
      || e.engagementStatus === 'end_requested_by_client')
    .map((e) => e.completion?.requestedAt)
    .filter((ts): ts is admin.firestore.Timestamp => !!ts);
  const endRequestedAt = openRequests.length
    ? openRequests.reduce((a, b) => (a.toMillis() <= b.toMillis() ? a : b))
    : null;

  const base = { disputeWindowEndsAt, adminReviewPending, endRequestedAt };

  if (engagements.length === 0) {
    return { ...base, isComplete: false, reason: 'no engagements', completionState: 'none' as const };
  }

  // A dispute holds the project open however many others have finished. It is
  // checked before the terminal sweep because 'disputed' is not terminal and the
  // distinction is the point: a disputed engagement is unfinished business.
  const disputed = engagements.filter((e) => e.engagementStatus === 'disputed');
  if (disputed.length > 0) {
    return {
      ...base,
      isComplete: false,
      reason: `${disputed.length} engagement(s) disputed`,
      completionState: endRequestedAt ? ('requested' as const) : ('none' as const),
    };
  }

  const open = engagements.filter((e) => !TERMINAL.has(e.engagementStatus ?? 'hired'));
  if (open.length > 0) {
    return {
      ...base,
      isComplete: false,
      reason: `${open.length} engagement(s) still open`,
      completionState: endRequestedAt ? ('requested' as const) : ('none' as const),
    };
  }

  // Every engagement is terminal. Note this includes the case where they are ALL
  // withdrawn or cancelled — nobody delivered anything, and the project is still
  // finished in the sense that nothing more will happen on it.
  const delivered = engagements.filter((e) => !NON_CHARGING.has(e.engagementStatus ?? ''));
  return {
    ...base,
    isComplete: true,
    reason: delivered.length > 0
      ? `all ${engagements.length} terminal, ${delivered.length} delivered`
      : `all ${engagements.length} terminal, none delivered`,
    completionState: 'confirmed' as const,
  };
}

/**
 * Read this project's engagements, derive, and write the cache onto the project.
 *
 * Call AFTER the batch that moved an engagement has committed. Never sets a
 * project back from 'cancelled' — cancellation is a decision about the project
 * itself, not a roll-up of its engagements, and `statusTransitionAllowed` in the
 * rules treats both terminal states as one-way.
 */
export async function applyDerivedProjectState(projectId: string): Promise<DerivedProjectState> {
  const [projSnap, feesSnap] = await Promise.all([
    db.doc(`projects/${projectId}`).get(),
    feesCol(projectId).get(),
  ]);
  const project = projSnap.data();
  const engagements = feesSnap.docs.map((d) => d.data() as FeeDoc);
  const derived = deriveProjectState(engagements);

  if (!project) return derived;

  const update: Update = {
    adminReviewPending: derived.adminReviewPending,
    disputeWindowEndsAt: derived.disputeWindowEndsAt,
  };

  // The project-level `completion` object, written HERE AND NOWHERE ELSE.
  //
  // `remindedDays` is deliberately absent. It used to live here as one array for
  // the whole project, so reminding one professional marked the day sent for
  // everyone; it now lives on each engagement. `requestedAt` is the min() of the
  // open requests purely so lifecycleCron sweep 2's existing composite index
  // still selects this project — the sweep then decides per engagement.
  const prior = (project.completion ?? {}) as { confirmedAt?: unknown; source?: unknown };
  const completion: Record<string, unknown> = { state: derived.completionState };
  if (derived.endRequestedAt) completion.requestedAt = derived.endRequestedAt;
  if (prior.source) completion.source = prior.source;
  if (derived.completionState === 'confirmed') {
    completion.confirmedAt = prior.confirmedAt ?? admin.firestore.FieldValue.serverTimestamp();
  }
  update.completion = completion;

  // 'cancelled' is a statement about the project, not a roll-up. Leave it.
  if (project.status !== 'cancelled') {
    if (derived.isComplete && project.status !== 'completed') {
      update.status = 'completed';
      update.completedAt = admin.firestore.FieldValue.serverTimestamp();
      // Completion is what frees capacity, for everyone, whatever is owed.
      update.slotHolders = [];
      update.slotActive = false;
    } else if (!derived.isComplete && project.status === 'completed') {
      // A re-hire onto a completed project, or a dispute raised after the fact,
      // reopens it. The rules forbid a CLIENT making this transition; the Admin
      // SDK is not subject to them, and the derivation is the authority now.
      update.status = 'open';
    }
  }

  await projSnap.ref.update(update);
  return derived;
}

// ── reminders ───────────────────────────────────────────────────────────────

export type ReminderAction =
  | { proId: string; kind: 'remind'; day: number }
  | { proId: string; kind: 'escalate' };

/**
 * Which engagements on this project need a reminder or an escalation right now.
 *
 * Pure, and separate from the sweep, because the interesting behaviour is what
 * happens when the project-level cache that SELECTED this project is already
 * stale. applyDerivedProjectState is deliberately not atomic, so between the
 * cache being written and the cron reading it another engagement can have moved.
 *
 * The rule that makes staleness safe: the cache picks the project, the ENGAGEMENT
 * decides the action. Nothing here reads the project's `completion` at all.
 *
 * - an engagement that is no longer end-requested yields nothing, however stale
 *   the cache that selected it;
 * - each engagement is judged on its OWN requestedAt, never on the project's
 *   min();
 * - `remindedDays` is per engagement, so one professional's day-3 reminder does
 *   not suppress another's.
 */
export function remindersDueFor(
  engagements: readonly { professionalId?: string; engagementStatus?: string;
    adminReviewPending?: boolean;
    completion?: { requestedAt?: { toMillis(): number }; remindedDays?: number[] } }[],
  now: number,
  reminderDays: readonly number[],
  autoConfirmDays: number,
): ReminderAction[] {
  const out: ReminderAction[] = [];
  const DAY = 86400_000;

  for (const e of engagements) {
    if (e.engagementStatus !== 'end_requested_by_pro'
      && e.engagementStatus !== 'end_requested_by_client') continue;

    const requestedAt = e.completion?.requestedAt?.toMillis();
    if (typeof requestedAt !== 'number' || !Number.isFinite(requestedAt)) continue;
    const proId = e.professionalId;
    if (!proId) continue;

    const age = now - requestedAt;

    // Past the auto-confirm horizon: hand it to a human. Silence never confirms
    // a completion, so this escalates rather than completing anything.
    if (age >= autoConfirmDays * DAY) {
      if (e.adminReviewPending !== true) out.push({ proId, kind: 'escalate' });
      continue;
    }

    const reminded = e.completion?.remindedDays ?? [];
    for (const day of reminderDays) {
      if (age >= day * DAY && !reminded.includes(day)) out.push({ proId, kind: 'remind', day });
    }
  }
  return out;
}
