import type { ProjectFee } from '@core/types/project';
import { outstandingFee } from './fee';

/**
 * Does this engagement belong on the professional's balance screen?
 *
 * IT IS A QUESTION ABOUT LIFECYCLE, NOT ABOUT AN AMOUNT. The screen used to
 * filter on `owed > 0`, which is an amount standing in for a state, and it hid
 * exactly the two engagements that most need to be visible:
 *
 *  - a CONTESTED one, because `didnt_happen` zeroes the fee — so raising an issue
 *    made the row vanish from the money screen at the moment the professional
 *    most needed to see that something was open and being looked at;
 *  - a COMPLETED one still inside its charge window, because `feeDue` may be
 *    settled or zero while a charge is still scheduled against it.
 *
 * Rows that show for a reason other than an amount contribute nothing to the
 * total — the headline figure stays "what you owe" — so each one has to say why
 * it is there, or a ₪0 line reads as a bug.
 */
export function showsOnBalance(
  fee: ProjectFee | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!fee) return false;
  if (outstandingFee(fee) > 0) return true;

  // In front of a human. Whatever the amount currently reads as, this is open
  // business and the professional is owed sight of it.
  if (fee.engagementStatus === 'disputed') return true;

  if (fee.engagementStatus === 'completed') {
    // `chargeDueAt` is the window; `disputeWindowEndsAt` is its predecessor on
    // records written before the two collapsed. Same precedence as the server's
    // contestWindowEndsAt() and the client's canDispute().
    const endsAt = fee.chargeDueAt ?? fee.disputeWindowEndsAt;
    if (endsAt?.seconds) return now <= endsAt.seconds * 1000;
  }

  return false;
}

/**
 * What this row's status line should say, beyond its amount.
 *
 * `disputed` — in front of a human. Reads `engagementStatus` FIRST, not the older
 * `status` settlement enum: a contest writes `engagementStatus: 'disputed'` and,
 * for `didnt_happen`, `status: 'not_owed'`, so a reader keyed on `status` alone
 * would never see a new contest and the row would sit there at ₪0 with no
 * explanation. `status === 'disputed'` stays as the fallback because records
 * from the pre-Phase-4 dispute path carry only that.
 *
 * `pending_charge` — completed and still inside its window, whatever the amount.
 * The date is the one fact this row can give that the amount cannot.
 *
 * `null` — an ordinary outstanding row, which explains itself.
 */
export function balanceRowNote(
  fee: ProjectFee | null | undefined,
  now: number = Date.now(),
): 'disputed' | 'pending_charge' | null {
  if (!fee) return null;
  if (fee.engagementStatus === 'disputed' || fee.status === 'disputed') return 'disputed';
  if (fee.engagementStatus === 'completed') {
    const endsAt = fee.chargeDueAt ?? fee.disputeWindowEndsAt;
    if (endsAt?.seconds && now <= endsAt.seconds * 1000) return 'pending_charge';
  }
  return null;
}

/**
 * Why one of this professional's capacity slots is occupied.
 *
 * THE POINT IS 'under_review'. A contested engagement deliberately keeps holding
 * its slot — releasing it would let a professional contest their way to free
 * capacity, which is the evasion route `contestEngagement` re-takes the slot to
 * close. But the cap view presented that slot as one more project he was failing
 * to close, under copy telling him a slot frees when a project is completed or
 * cancelled. He cannot do either: it is waiting on a BAMA decision. The state is
 * correct; saying he should act on it is not.
 *
 * Read from HIS OWN engagement, never from the project's `adminReviewPending`
 * roll-up — that flag is true when ANY engagement on the project is in review,
 * including another professional's, which is both none of his business and not
 * the reason his slot is held.
 */
export function slotReason(
  project: { status?: string } | null | undefined,
  myEngagement: Pick<ProjectFee, 'engagementStatus'> | null | undefined,
): 'under_review' | 'completed' | 'active' {
  if (myEngagement?.engagementStatus === 'disputed') return 'under_review';
  if (project?.status === 'completed') return 'completed';
  return 'active';
}

/**
 * Where this professional's OWN engagement stands.
 *
 * The question the chat list and the row copy actually need, and the one they
 * were not asking. They read the PROJECT's status instead — a roll-up over
 * everyone — and a contest reopens a completed project (derive.ts:187), so a
 * professional who raised an issue silently stopped being "on a completed
 * project" and the row changed character underneath them.
 *
 * `unknown` is a real answer and not an error: a fee document that does not exist
 * means exempt, or a record from before engagements existed. Callers fall back to
 * the project only in that case, because it is the only signal there is.
 */
export type EngagementStanding = 'open' | 'finished' | 'under_review' | 'ended' | 'unknown';

export function engagementStanding(
  fee: Pick<ProjectFee, 'engagementStatus'> | null | undefined,
): EngagementStanding {
  if (!fee) return 'unknown';
  switch (fee.engagementStatus ?? 'hired') {
    case 'disputed': return 'under_review';
    case 'completed': return 'finished';
    case 'withdrawn':
    case 'cancelled': return 'ended';
    default: return 'open';
  }
}

/**
 * Did this professional actually PAY, on work that is still running? (§5)
 *
 * "Actually paid" means money was recorded — `feePaid` or `status: 'paid'`, both
 * written by settleFee. It is NOT `outstandingFee(fee) === 0`, and that
 * difference is the whole bug: a `didnt_happen` contest sets `feeDue: 0` and
 * `status: 'not_owed'` without anyone paying anything, so an amount-shaped test
 * stamped a "Paid" pill on a voided fee that is still in front of an admin.
 *
 * `feeStatus === 'owed'` stays: exempt and legacy 'included' records never owed
 * anything, so "paid early" is meaningless for them.
 */
export function feePaidEarly(
  fee: Pick<ProjectFee, 'feeStatus' | 'feePaid' | 'status' | 'engagementStatus'> | null | undefined,
): boolean {
  if (!fee) return false;
  if (fee.feeStatus !== 'owed') return false;
  if (!(fee.feePaid === true || fee.status === 'paid')) return false;
  return engagementStanding(fee) === 'open';
}
