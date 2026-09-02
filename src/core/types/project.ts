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
  //
  // LEGACY. The fee is per-PROFESSIONAL and lives at
  // `projects/{id}/fees/{professionalId}` (see ProjectFee). These project-level
  // fields are written by NOTHING as of the per-pro correction — they survive
  // only on pre-correction docs. Read `ProjectFee`; a MISSING fee doc means
  // 'exempt'. Do not treat anything below as authoritative for a new project.
  /** @deprecated legacy pre-per-pro-fee. Use ProjectFee.feeStatus. */
  feeStatus?: 'included' | 'owed' | 'exempt';
  /** @deprecated legacy pre-per-pro-fee. Use ProjectFee.feeRate. */
  feeRate?: number;
  /** Captured at hire; drives the auto-completion prompt (deadline or hire + default). */
  expectedEndDate?: Timestamp;
  /** @deprecated legacy pre-per-pro-fee. Use ProjectFee.feeLockedAt/-Amount. */
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
  /** @deprecated legacy pre-per-pro-fee. Use ProjectFee.feeDue. */
  feeDue?: number;
  /** @deprecated legacy pre-per-pro-fee. Use ProjectFee.feePaid. */
  feePaid?: boolean;
  feePaidAt?: Timestamp;
  /** Flat list of hired pro uids (mirrors filledSlots' professionalIds). Every pro
   *  ever hired, including ones who have since settled or left. */
  professionalIds?: string[];
  /** Pros who currently OCCUPY a slot on this project — the slot cap's source of
   *  truth, counted with `array-contains`. A pro leaves this array when their own
   *  fee settles (paid / included / cancelled / archived), independently of the
   *  others. Maintained by the lifecycle callables. */
  slotHolders?: string[];
  /** DERIVED and LEGACY-SHAPED: `slotHolders.length > 0`, i.e. "at least one pro
   *  is still unsettled". NOT authoritative for any individual pro — never gate a
   *  pro's slot on this, use `slotHolders` / ProjectFee.slotActive.
   *
   *  It exists solely so lifecycleCron's two range sweeps stay indexable: Firestore
   *  cannot express "slotHolders is non-empty" in a composite range query, so the
   *  boolean is kept in step with the array. Its only readers are
   *  functions/src/lifecycle/cron.ts (sweeps 1 and 3) and the two composite indexes
   *  serving them. */
  slotActive?: boolean;
  archivedUnconfirmedAt?: Timestamp;
  /** @deprecated legacy pre-per-pro-fee. Use ProjectFee.refundReviewPending. */
  refundReviewPending?: boolean;
};

/**
 * A single professional's fee on a single project, at
 * `projects/{projectId}/fees/{professionalId}` — the doc ID IS the pro's uid.
 *
 * Admin-SDK-written only. Locked at hire from THAT pro's subscription status, so
 * two pros on one project can owe different amounts (or one owe and one not).
 *
 * A MISSING fee doc means 'exempt' — that is the permanent fallback covering
 * every project created before the per-pro correction. Never infer a fee from the
 * project doc's legacy fields.
 */
export type ProjectFee = {
  professionalId: ID;
  /** 'included' = covered by THIS pro's subscription at THEIR hire; 'owed' = fee
   *  due on their own amount; 'exempt' = never charged or blocked. */
  feeStatus: 'included' | 'owed' | 'exempt';
  /** Snapshot of PLATFORM_FEE_RATE at this pro's hire (immutable, for display). */
  feeRate: number;
  /** This pro's own accepted value — their offer price, or their bundle's
   *  bundlePrice counted once. Captured at hire; topped up (never reduced) at
   *  completion if the agreed price rose, per spec §5. */
  baseAmount: number;
  /** round(baseAmount * feeRate). Set when completion is confirmed. */
  feeDue?: number;
  feePaid?: boolean;
  feePaidAt?: Timestamp;
  /** Early payment (spec §5): the amount locked on the day they paid early. */
  feeLockedAt?: Timestamp;
  feeLockedAmount?: number;
  /** Whether THIS pro still occupies a slot. Mirrors their membership of the
   *  project's `slotHolders`. */
  slotActive: boolean;
  /** Set when a project this pro already paid for is cancelled — admin decides
   *  the refund (§5, discretionary). */
  refundReviewPending?: boolean;
  hiredAt?: Timestamp;
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
  /** Which ROLE is being repriced. Required for non-bundle requests: a pro can
   *  hold two separate non-bundled roles on one project, and without this the
   *  reprice matched on projectId+professionalId alone and overwrote both. */
  category?: string;
  currentAmount: number;
  proposedAmount: number;
  note?: string;
  status: PaymentRequestStatus;
  createdAt: Timestamp;
};
