import { containsPhoneNumber } from '@utils/contactFilter';
import type { EquipmentItem } from '@core/types/user';

/**
 * Equipment is capped: firestore.rules checks each list position by hand (rules
 * cannot loop), so the rule and the app agree on a maximum.
 * MIRROR of EQUIPMENT_MAX in firestore.rules (equipmentOk) — KEEP IN SYNC.
 */
export const EQUIPMENT_MAX = 30;

/**
 * Which public profile fields carry a phone number (Terms §6.8 — no contact
 * details before hire). `equipmentIndexes` point into the list as given.
 */
export function profileContactErrors(p: {
  bio: string;
  equipment: (string | EquipmentItem)[];
}): { bio: boolean; equipmentIndexes: number[]; any: boolean } {
  const bio = containsPhoneNumber(p.bio ?? '');
  const equipmentIndexes = p.equipment.flatMap((item, i) =>
    containsPhoneNumber(typeof item === 'string' ? item : item?.name ?? '') ? [i] : [],
  );
  return { bio, equipmentIndexes, any: bio || equipmentIndexes.length > 0 };
}

/** Thrown by useProfile.save when the profile carries a phone number. */
export class ProfileContactError extends Error {
  constructor() {
    super('profile-contains-phone');
    this.name = 'ProfileContactError';
  }
}
