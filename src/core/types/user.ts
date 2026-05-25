import type { ID, Timestamp } from './common';
import type { MediaRole } from './media';
import type { PriceEntry } from './project';

export type UserRole = 'client' | 'professional';

export type User = {
  id: ID;
  email: string;
  displayName: string;
  photoURL: string | null;
  role: UserRole | null;
  createdAt: Timestamp;
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
  bio: string;
  availability: 'available' | 'busy' | 'unavailable';
  rating: number;
  reviewCount: number;
  equipment: string[];
  priceList: PriceEntry[];
};
