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
  exec?: string;
  deadline: string;
  location: string;
  status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: Timestamp;
  filledSlots: FilledSlot[];
  targetProfessionalId?: string | null;
  chatId?: string;
  reviewsCompleted?: boolean;
  reviewsPending?: string[];
  vibe?: string;
  budget?: string;
};

export type PriceOffer = {
  id: string;
  projectId: string;
  professionalId: string;
  category: string;
  subcategory: string;
  price: number;
  status: 'pending' | 'accepted' | 'rejected' | 'removed';
  bundleId?: string;
  createdAt: Timestamp;
};

export type RemovalRequest = {
  professionalId: string;
  requestedBy: string;
  status: 'pending' | 'accepted';
  createdAt: Timestamp;
};

export type BundleOffer = {
  id: string;
  projectId: string;
  professionalId: string;
  slots: Array<{ category: string; subcategory: string }>;
  individualTotal: number;
  bundlePrice: number;
  offerIds: string[];
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

export type MissionStatus = 'todo' | 'in_progress' | 'done';

export type Mission = {
  id: string;
  projectId: string;
  title: string;
  assignedTo: string[];
  status: MissionStatus;
  dueDate?: string;
  createdBy: string;
  createdAt: Timestamp;
};

export type Meeting = {
  id: string;
  projectId: string;
  title: string;
  date: string;
  time: string;
  location: string;
  invitedIds: string[];
  createdBy: string;
  createdAt: Timestamp;
};

export type PaymentRequestStatus = 'pending' | 'accepted' | 'rejected';

export type PaymentRequest = {
  id: string;
  projectId: string;
  fromUserId: string;
  toUserId: string;
  professionalId: string;
  currentAmount: number;
  proposedAmount: number;
  note?: string;
  status: PaymentRequestStatus;
  createdAt: Timestamp;
};
