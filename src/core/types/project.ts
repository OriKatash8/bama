import type { ID, Timestamp } from './common';
import type { MediaRole } from './media';

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type CrewSlot = {
  id: ID;
  role: MediaRole;
  professionalId: ID | null;
  status: 'open' | 'filled';
};

export type Project = {
  id: ID;
  clientId: ID;
  title: string;
  description: string;
  startDate: Timestamp;
  endDate: Timestamp;
  crew: CrewSlot[];
  status: 'draft' | 'open' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: Timestamp;
};

export type Booking = {
  id: ID;
  projectId: ID;
  clientId: ID;
  professionalId: ID;
  role: MediaRole;
  status: BookingStatus;
  rate: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type PriceEntry = {
  service: string;
  price: number;
};

export type Review = {
  id: ID;
  professionalId: ID;
  authorId: ID;
  authorName: string;
  rating: number;
  body: string;
  createdAt: Timestamp;
};

export type CrewRequestSlot = {
  category: string;
  subcategory: string;
  quantity: number;
};

export type FilledSlot = {
  category: string;
  subcategory: string;
  professionalId: string;
};

export type ProjectApplication = {
  id: ID;
  projectId: ID;
  professionalId: ID;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Timestamp;
};

export type ProjectRequest = {
  id: ID;
  clientId: ID;
  title: string;
  crewSlots: CrewRequestSlot[];
  description: string;
  date: string;
  location: string;
  status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: Timestamp;
  filledSlots: FilledSlot[];
};

export type PriceOffer = {
  id: string;
  projectId: string;
  professionalId: string;
  category: string;
  subcategory: string;
  price: number;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Timestamp;
};

export type AcceptedMember = {
  professionalId: string;
  category: string;
  subcategory: string;
  price: number;
  displayName: string;
};
