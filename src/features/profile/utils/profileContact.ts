import { containsContactDetails } from '@utils/contactFilter';
import type { EquipmentItem } from '@core/types/user';

/**
 * Equipment is capped: firestore.rules checks each list position by hand (rules
 * cannot loop), and one request may evaluate at most 1000 expressions — a
 * clean list of 25 was already denied on the emulator. 15 leaves room for the
 * bio and priceList checks in the same save.
 * MIRROR of EQUIPMENT_MAX in firestore.rules (equipmentOk) — KEEP IN SYNC.
 */
export const EQUIPMENT_MAX = 15;

/**
 * Which public profile fields carry a phone number or an email address
 * (Terms §6.8 — no contact details before hire). `equipmentIndexes` point into the list as given.
 */
export function profileContactErrors(p: {
  bio: string;
  equipment: (string | EquipmentItem)[];
}): { bio: boolean; equipmentIndexes: number[]; any: boolean } {
  const bio = containsContactDetails(p.bio ?? '');
  const equipmentIndexes = p.equipment.flatMap((item, i) =>
    containsContactDetails(typeof item === 'string' ? item : item?.name ?? '') ? [i] : [],
  );
  return { bio, equipmentIndexes, any: bio || equipmentIndexes.length > 0 };
}

/** Thrown by useProfile.save when the profile carries contact details. */
export class ProfileContactError extends Error {
  constructor() {
    super('profile-contains-contact');
    this.name = 'ProfileContactError';
  }
}
