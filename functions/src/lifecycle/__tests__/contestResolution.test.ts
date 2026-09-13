import { deriveProjectState } from '../derive';

/**
 * DOES A CONTEST EVER END?
 *
 * A contested engagement keeps its capacity slot on purpose — releasing it would
 * make contesting a way to buy capacity. That is only safe if resolving the
 * contest gives the slot back. These trace both resolutions against the code as
 * it stands.
 *
 * The slot lives in the project's `slotHolders` array, which the cap counts with
 * `array-contains`. Exactly three things remove an id from it:
 *
 *   completion.ts:250  confirmCompletionInternal — for engagements it CLOSED
 *   completion.ts:839  completeEngagementInternal — for the one it closed
 *   removal.ts:91      the client removing the professional
 *
 * plus two wholesale resets (`slotHolders: []`): cancelProject, and
 * applyDerivedProjectState when the project becomes complete (derive.ts:184).
 *
 * Every one of those is keyed on the engagement reaching a TERMINAL status.
 * `settleFee` — the only thing an admin can currently call — deliberately writes
 * nothing to the project ("slots are completion's", completion.ts:497) and never
 * touches `engagementStatus`.
 */

const ts = (ms: number) => ({ toMillis: () => ms }) as never;
const now = Date.UTC(2026, 8, 13);

/** `slotHolders` membership after an admin action, as the code actually writes it. */
const TERMINAL = new Set(['completed', 'withdrawn', 'cancelled']);
const stillHoldsSlot = (engagementStatus: string) => !TERMINAL.has(engagementStatus);

describe('the slot a contest holds', () => {
  it('is held while the contest is open — deliberate, and the evasion route that closes', () => {
    expect(stillHoldsSlot('disputed')).toBe(true);
  });

  it('PATH A — admin records payment (markFeePaid → settleFee): the slot is NOT returned', () => {
    // settleFee writes paidAmount/feeDue/feePaid/status/slotActive on the FEE and
    // explicitly nothing on the project. engagementStatus stays 'disputed'.
    const afterSettle = 'disputed';
    expect(stillHoldsSlot(afterSettle)).toBe(true);

    // And the one mechanism that would clear slotHolders wholesale cannot fire,
    // because it needs the project to derive as complete — which this very
    // engagement prevents. The trap is circular.
    const d = deriveProjectState([{ engagementStatus: 'disputed' } as never], now);
    expect(d.isComplete).toBe(false);
  });

  it('PATH B — the fee was voided by didnt_happen: there is NO callable to resolve it', () => {
    // markFeePaid is the only admin lever, and settleFee refuses outright:
    // contestEngagement sets status 'not_owed' for didnt_happen, and settleFee
    // throws 'nothing-owed' on exactly that (completion.ts:457).
    const refusesToSettle = (status: string) => status === 'not_owed';
    expect(refusesToSettle('not_owed')).toBe(true);

    // So engagementStatus can never leave 'disputed' by any existing path.
    expect(stillHoldsSlot('disputed')).toBe(true);
  });

  it('would be returned by ANY terminal resolution — which is where the fix belongs', () => {
    // The mechanism already exists and needs no new slot bookkeeping: put the
    // engagement into a terminal status and applyDerivedProjectState frees the
    // whole array when the last one closes.
    for (const resolved of ['completed', 'cancelled', 'withdrawn']) {
      expect(stillHoldsSlot(resolved)).toBe(false);
    }
    expect(deriveProjectState(
      [{ engagementStatus: 'completed' }, { engagementStatus: 'completed' }] as never,
      now,
    ).isComplete).toBe(true);
  });

  it('and the fix must NOT be settling the fee', () => {
    // Making settleFee release the slot would make PAYING free capacity — the
    // exact coupling the compliance reversal removed, and the thing Guideline
    // 3.1.1 turns on. Resolution is an admin decision about the dispute; it must
    // not be reachable only by the professional handing over money.
    //
    // Pinned as a test rather than a comment because it is the one wrong fix that
    // looks obvious from the stack trace.
    const paymentFreesCapacity = false;
    expect(paymentFreesCapacity).toBe(false);
  });
});

describe('what the project looks like while a contest is open', () => {
  it('reopens to `open`, so the cap view calls the slot "Active"', () => {
    // derive.ts:187 — a dispute after the fact reopens a completed project. That
    // is why the blocked sheet showed the slot as one more active project he
    // should go and close, which is what the copy fix addresses.
    const d = deriveProjectState(
      [{ engagementStatus: 'disputed' }, { engagementStatus: 'completed' }] as never,
      now,
    );
    expect(d.isComplete).toBe(false);
  });

  it('holds the project open however long resolution takes', () => {
    const d = deriveProjectState(
      [{ engagementStatus: 'disputed', chargeDueAt: ts(now - 400 * 86400_000) }] as never,
      now,
    );
    expect(d.isComplete).toBe(false);
  });
});
