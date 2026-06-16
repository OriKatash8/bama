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

export type ProfessionalSkill = {
  category: string;
  subcategory: string;
};

export type ProfessionalProfile = {
  userId: ID;
  roles: MediaRole[];
  skills?: ProfessionalSkill[];
  bio: string;
  availability: 'available' | 'busy' | 'unavailable';
  rating: number;
  reviewCount: number;
  equipment: string[];
  priceList: PriceEntry[];
};
