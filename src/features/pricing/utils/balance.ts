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
