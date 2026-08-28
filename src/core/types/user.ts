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
};

export type ClientProfile = {
  userId: ID;
  companyName: string | null;
  bio: string | null;
  projectCount: number;
};

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
  equipment: string[];
  priceList: PriceEntry[];
  /** True once the pro has saved a profile meeting the minimum requirements
   *  (name + at least one role). Absent/false ⇒ first-time / not completed. */
  proProfileCompleted?: boolean;
};
