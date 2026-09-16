import { hireConsumesNewSlot, atSlotCap } from '../pricing';

/**
 * The slot-cap decision, taken from reads made INSIDE the hire transaction.
 *
 * `loadAndEnforce` used to be the only check, and it runs before the transaction:
 * two clients hiring the same professional onto two DIFFERENT projects at the same
 * moment both counted `slotHolders array-contains proId` below the cap, both
 * committed, and the professional ended up over it. Nothing errored.
 *
 * The server SDK can read a query inside a transaction (the "transactions cannot
 * query" limit belongs to the client SDK). A read in a server transaction takes a
 * lock, so a concurrent hire that adds this professional to another project's
 * `slotHolders` conflicts with this one; Firestore aborts the loser and re-runs
 * its whole transaction function, which calls this again with a fresh count.
 *
 * Both reads are passed in rather than performed here so the decision stays pure
 * and testable: `readCount` is the only thing that touches Firestore, and it is
 * only called when the hire would actually take a new slot.
 */
export async function slotCapBlocksHire(args: {
  /** `slotHolders` from the project snapshot read by THIS transaction. */
  freshSlotHolders: readonly string[] | undefined;
  proId: string;
  cap: number;
  /** Runs the cap query through the transaction (`tx.get(query)`) and returns its size. */
  readCount: () => Promise<number>;
}): Promise<boolean> {
  // A second role on a project this pro already holds a slot on takes nothing.
  // Decided from the FRESH project: a concurrent hire of the same pro onto this
  // same project may have just added them.
  if (!hireConsumesNewSlot(args.freshSlotHolders, args.proId)) return false;
  return atSlotCap(await args.readCount(), args.cap);
}
