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
  /** Client→pro reviews are HELD until the project closes + fee settled (or 60d);
   *  pro→client reviews publish immediately. Read paths treat a MISSING field as
   *  visible (`published != false`), so legacy reviews need no backfill — only a
   *  newly-held review is written with `published: false`. */
  published?: boolean;
  visibleAt?: Timestamp;
  kind?: 'client_to_pro' | 'pro_to_client';
};

export type CrewRequestSlot = {
  category: string;  // holds the role (RoleDef id) for now
  quantity: number;
  /** Required specialization id (e.g. 'drone'); undefined = general capability. */
  requiredCapability?: string;
};

export type FilledSlot = {
  category: string;
  professionalId: string;
  /** The capability slot this fill consumed (undefined = a general slot). Set at accept time. */
  requiredCapability?: string;
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
  roleAnswers?: Record<string, Record<string, string>>;
  /** Set client-side today when a project is completed/cancelled (were untyped). */
  completedAt?: Timestamp;
  cancelledAt?: Timestamp;

  // ── Pricing & lifecycle (Admin-SDK-written; locked at hire, immutable after) ──
  /** 'included' = covered by the pro's subscription at hire; 'owed' = 3% due;
   *  'exempt' = pre-pricing-model project (backfilled) — never charged or blocked. */
  feeStatus?: 'included' | 'owed' | 'exempt';
  /** Snapshot of PLATFORM_FEE_RATE at hire (immutable, for display). */
  feeRate?: number;
  /** Captured at hire; drives the auto-completion prompt (deadline or hire + default). */
  expectedEndDate?: Timestamp;
  /** Early payment (spec §5) — fields present now to avoid re-migrating later. */
  feeLockedAt?: Timestamp;
  feeLockedAmount?: number;
  /** Completion state machine. */
  completion?: {
    state: 'none' | 'requested' | 'confirmed' | 'disputed';
    source?: 'pro' | 'client' | 'auto';
    requestedBy?: ID;
    requestedAt?: Timestamp;
    confirmedAt?: Timestamp;
    /** Which reminder days (3/6) the cron already sent — idempotency marker. */
    remindedDays?: number[];
  };
  /** Set once the cron has sent the "did the project finish?" prompt (idempotency). */
  endDatePromptedAt?: Timestamp;
  /** 3% of project value, set when completion is confirmed. */
  feeDue?: number;
  feePaid?: boolean;
  feePaidAt?: Timestamp;
  /** Flat list of hired pro uids (mirrors filledSlots' professionalIds) so the
   *  slot cap can be counted with an array-contains query. Maintained at hire. */
  professionalIds?: string[];
  /** Occupies a slot from hire until settled (paid / cancelled / archived).
   *  UNDEFINED (pre-backfill) never counts toward the slot cap. */
  slotActive?: boolean;
  archivedUnconfirmedAt?: Timestamp;
  /** Set when a paid project is cancelled early — admin decides the refund (§5). */
  refundReviewPending?: boolean;
};

export type PriceOffer = {
  id: string;
  projectId: string;
  professionalId: string;
  category: string;
  subcategory?: string;
  price: number;
  status: 'pending' | 'accepted' | 'rejected' | 'removed';
  bundleId?: string;
  createdAt: Timestamp;
  /** Set when the professional edits a pending offer's price. */
  editedAt?: Timestamp;
  editCount?: number;
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
  slots: Array<{ category: string; subcategory?: string }>;
  individualTotal: number;
  bundlePrice: number;
  offerIds: string[];
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Timestamp;
  /** Set when the professional edits a pending bundle's price. */
  editedAt?: Timestamp;
  editCount?: number;
};

export type AcceptedMember = {
  professionalId: string;
  category: string;
  subcategory?: string;
  price: number;
  displayName: string;
};

export type MissionStatus = 'todo' | 'in_progress' | 'done';

export type Mission = {
  id: string;
  projectId: string;
  title: string;
  description?: string;
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
  description?: string;
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
  /** Set when the request is for a BUNDLE deal — repriced on bundleOffers/{bundleId}
   *  instead of the individual priceOffers. */
  bundleId?: string;
  currentAmount: number;
  proposedAmount: number;
  note?: string;
  status: PaymentRequestStatus;
  createdAt: Timestamp;
};
