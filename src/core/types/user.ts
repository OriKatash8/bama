import type { ID, Timestamp } from './common';
import type { MediaRole } from './media';
import type { PriceEntry } from './project';

export type ActiveMode = 'client' | 'professional';

export type User = {
  id: ID;
  email: string;
  displayName: string;
  photoURL: string | null;
  createdAt: Timestamp;
  /** Set true once the user completes the first-time client onboarding
   *  (profile photo + name). Absent/false ⇒ first-time. */
  clientOnboarded?: boolean;
  /** Current moderation state. Absent ⇒ active/in good standing. Written
   *  ONLY by the moderateUser callable (Admin SDK); clients cannot edit it. */
  moderation?: UserModeration;
  /** Unix ms timestamp of when the user accepted the terms. Null until accepted. */
  termsAcceptedAt?: number | null;
  /** Version string of the terms accepted, e.g. '1.0'. */
  termsVersion?: string;
};

/** Snapshot of the latest enforcement action against a user. `warned` is a
 *  non-blocking notice; `suspended` also disables the Firebase Auth account.
 *  `reason` is kept restatable so a suspended/warned user can see (and appeal)
 *  why. Cleared (field deleted) on unsuspend / clear_warning. */
export type UserModeration = {
  status: 'warned' | 'suspended';
  reason: string;
  actionId: ID;
  actorId: ID;
  actorName: string;
  at: Timestamp;
};

export type ClientProfile = {
  userId: ID;
  companyName: string | null;
  bio: string | null;
  projectCount: number;
};

/** A single piece of equipment on a professional profile. Older docs stored
 *  equipment as bare name strings; newer ones store this object. Read paths
 *  normalize both via normalizeEquipment(). */
export type EquipmentItem = { name: string; category: string };

export type ProfessionalProfile = {
  userId: ID;
  roles: MediaRole[];
  /**
   * Source of truth for role/subskill matching.
   * `role` = a RoleDef id (e.g. 'videographer'); `specializations` = subskill
   * ids (e.g. ['general','drone']).
   */
  roleSkills: Array<{ role: string; specializations: string[] }>;
  bio: string;
  availability: 'available' | 'busy';
  rating: number;
  reviewCount: number;
  /** Legacy docs hold bare strings; new docs hold EquipmentItem objects. */
  equipment: (string | EquipmentItem)[];
  priceList: PriceEntry[];
  /** True once the pro has saved a profile meeting the minimum requirements
   *  (name + at least one role). Absent/false ⇒ first-time / not completed. */
  proProfileCompleted?: boolean;
};
