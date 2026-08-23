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
};

export type ClientProfile = {
  userId: ID;
  companyName: string | null;
  bio: string | null;
  projectCount: number;
};

/** @deprecated Phase 1 — replaced by ProfessionalProfile.roleSkills (kept until call sites migrate). */
export type ProfessionalSkill = {
  category: string;
};

export type ProfessionalProfile = {
  userId: ID;
  roles: MediaRole[];
  /** @deprecated Phase 1 — use roleSkills for matching (kept until call sites migrate). */
  skills?: ProfessionalSkill[];
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
};
