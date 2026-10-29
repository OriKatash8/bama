import { MAX_REMOVAL_FRACTION, MIN_ITEMS_FOR_REMOVAL_GUARD } from './config';
import type { RentalItem } from './types';

/**
 * Items the store no longer lists: every stored item whose id was not seen in
 * this sync and that is still active or visible. This — not lastSeenAt — is how
 * removals are detected; an already-inactive item is not written again.
 */
export function goneFromStore(
  existing: Map<string, Pick<RentalItem, 'active' | 'visible'>>,
  seenIds: Set<string>,
): string[] {
  const out: string[] = [];
  for (const [id, it] of existing) {
    if (!seenIds.has(id) && (it.active || it.visible)) out.push(id);
  }
  return out;
}

/** Whether hiding `gone` of `live` items is a suspicious mass removal (see MAX_REMOVAL_FRACTION). */
export function isMassRemoval(gone: number, live: number): boolean {
  return live >= MIN_ITEMS_FOR_REMOVAL_GUARD && gone > live * MAX_REMOVAL_FRACTION;
}

/** Thrown before any write when a sync would hide most of a catalogue; "Sync now" can retry with force. */
export class MassRemovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MassRemovalError';
  }
}
