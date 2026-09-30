import type { SlotUsage } from '../services/slotsService';

/**
 * Whether the slot cap stops this professional taking work on `projectId`.
 *
 * The client mirror of the server's hireConsumesNewSlot + atSlotCap: a slot is
 * one PROJECT, not one role. A professional already on this project (it is in
 * their slot usage) takes another role on it without a new slot, so the cap
 * never blocks it. Unknown usage (still loading) is not a block — the hire
 * callable enforces the cap regardless.
 */
export function slotGuardBlocks(usage: SlotUsage | null | undefined, projectId: string): boolean {
  if (usage?.atCap !== true) return false;
  return !usage.projects.some((p) => p.id === projectId);
}
