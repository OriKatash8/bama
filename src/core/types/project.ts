import type { ID, Timestamp } from './common';

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

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
  /** Legacy category string (ROLE_TO_LEGACY_CATEGORY), e.g. 'Video Photographer'
   *  — NOT the RoleDef id. `roleIdForCategory` maps it back. */
  category: string;
  quantity: number;
  /** Required specialization id (e.g. 'drone'); undefined = general capability.
   *  Never the string 'general' — normalize through `capabilityOf`. */
  requiredCapability?: string;
};

export type FilledSlot = {
  category: string;
  professionalId: string;
  /** The capability slot this fill consumed (undefined = a general slot). Set at accept time. */
  requiredCapability?: string;
};

export type ProjectRequest = {
  id: ID;
  clientId: ID;
  title: string;
  crewSlots: CrewRequestSlot[];
  description: string;
  exec?: string;
  deadline: string;
  /**
   * The real end date, as a Timestamp, and the thing automation runs on.
   *
   * `deadline` above stays exactly as it is — free text, either an ISO day or
   * the literal 'flexible' — because it is what the client typed and 69 live
   * projects carry it. This is set from the SAME picker when the answer is a
   * date, and left absent when it is 'flexible'.
   *
   * Absent means "never auto-completes", which is deliberately also what every
   * pre-existing project means. No backfill, no parsing `deadline` to guess one.
   */
  endDate?: Timestamp;
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
  /** Which end-date reminders (2/1 days out) the cron already sent. Per project:
   *  the date is the project's and the recipient is one person. */
  endDateRemindedDays?: number[];
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
  /** Deadline for a hired professional to dispute a confirmed completion.
   *  Stamped at confirmation from `config/pricing.disputeWindowDays`, so a later
   *  config edit cannot shorten a window someone was already given.
   *  The completion STANDS whether or not it is disputed, and whether or not the
   *  window expires — silence is not a veto. */
  disputeWindowEndsAt?: Timestamp;
  /** Set when something needs a human: a professional disputed a confirmed
   *  completion, or a completion request went unanswered. Server-only. */
  adminReviewPending?: boolean;
  adminReview?: {
    reason: 'fee_disputed' | 'completion_unanswered';
    proId?: ID | null;
    at?: Timestamp;
    note?: string;
  };
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
/** Settlement state of a fee record: where the money got to. Distinct from
 *  `feeStatus`, which says whether a fee was ever owed and is fixed at hire.
 *  NOTHING inside the app is gated on either — no slot, no review, no feature.
 *  Fee state decides exactly one thing, server-side: whether a professional past
 *  an invoice's grace period may take on NEW work (see feeBlocksNewHire). That is
 *  withheld real-world work, and no in-app payment can clear it. */
export type FeeSettlementStatus = 'pending' | 'paid' | 'disputed' | 'not_owed';

export type ProjectFee = {
  professionalId: ID;
  /** Denormalised so a collection-group read knows its project without walking
   *  ref.parent.parent. Absent on records written before this field existed. */
  projectId?: string;
  /** 'owed' = a fee is due on their own amount; 'exempt' = never charged;
   *  'included' = legacy, covered by a subscription that no longer exists. */
  feeStatus: 'included' | 'owed' | 'exempt';
  /** Settlement state. Absent on records written before this field existed —
   *  derive from `feePaid`/`feeDue` in that case. */
  status?: FeeSettlementStatus;
  /** Snapshot of the commission rate at this pro's hire, as a FRACTION (0.03).
   *  Captured from `config/pricing.feePercent` at hire and immutable after, so a
   *  later config change never alters a fee that was already agreed. */
  feeRate: number;
  /** This pro's own accepted value — their offer price, or their bundle's
   *  bundlePrice counted once. Captured at hire; topped up (never reduced) at
   *  completion if the agreed price rose, per spec §5. */
  baseAmount: number;
  /** What is still owed, stored NET of `paidAmount`. Set when completion is
   *  confirmed; absent before that, so pre-completion display must derive
   *  `max(round(baseAmount * feeRate), minFeeApplied) - paidAmount` itself. */
  feeDue?: number;
  /** Cumulative shekels already settled. Every amount derives from
   *  `outstanding = max(0, max(round(baseAmount * feeRate), minFeeApplied) - paidAmount)`,
   *  which covers §5's top-up rule, re-hire, the commission floor, and ordinary
   *  settlement without branching. Written by the server; absent means nothing
   *  paid yet. */
  paidAmount?: number;
  feePaid?: boolean;
  feePaidAt?: Timestamp;
  /** Early payment (spec §5): the amount locked on the day they paid early. */
  feeLockedAt?: Timestamp;
  feeLockedAmount?: number;
  /** Whether THIS pro still occupies a slot. Mirrors their membership of the
   *  project's `slotHolders`. Cleared by completion or cancellation — never by
   *  settling a fee. */
  slotActive: boolean;
  /** The commission FLOOR in force when this pro was hired (Terms 12.4.1), in whole
   *  shekels — snapshotted here exactly as `feeRate` is, so raising
   *  `config/pricing.minFeeAmount` later cannot reprice a project already agreed.
   *
   *  ABSENT on every record written before the floor existed, and read as 0 there.
   *  That is what makes the change need no backfill: an old fee floors at zero and
   *  its amount is arithmetically identical to what it always was. Read THIS, never
   *  the live config, when pricing an existing fee. */
  minFeeApplied?: number;
  /**
   * When this engagement auto-completes if the professional has not marked it.
   *
   * Stamped from the project's `endDate` at hire, and RE-STAMPED whenever the
   * client moves that date — but only while this engagement is still `hired`.
   * An engagement that already completed is never re-stamped, so moving the date
   * can never retroactively void a charge.
   *
   * Absent = never auto-completes. That is the state of every engagement on a
   * project with no `endDate`, including all 69 that predate this.
   */
  completionDueAt?: Timestamp;
  /**
   * When the fee for this engagement is charged, and until when the professional
   * may contest it. Set when the engagement completes, by either route.
   */
  chargeDueAt?: Timestamp;
  /** When an admin recorded that the payment demand went out. Admin-SDK-written
   *  only (`markDemandSent`); the professional can neither set nor clear it.
   *
   *  The arrears grace period counts from HERE, not from when the fee fell due:
   *  a professional who finishes a job on Tuesday must not be in arrears on
   *  Wednesday before anyone invoiced them. A fee with no `demandSentAt` never
   *  blocks anything, whatever its age or amount. */
  demandSentAt?: Timestamp;
  disputedAt?: Timestamp;
  disputeReason?: string;
  createdAt?: Timestamp;
  /** Set when a project this pro already paid for is cancelled — admin decides
   *  the refund (§5, discretionary). */
  refundReviewPending?: boolean;
  hiredAt?: Timestamp;

  // ── Engagement lifecycle ────────────────────────────────────────────────
  //
  // THIS DOCUMENT IS THE ENGAGEMENT. `projects/{projectId}/fees/{professionalId}`
  // was already per-(project, professional) and already carried `slotActive`,
  // `hiredAt`, `disputedAt` and `disputeReason` — a lifecycle in everything but
  // name. The fields below finish it rather than starting a parallel collection,
  // which would have orphaned listenToMyFees, the collection-group rules, the
  // composite index and nineteen Cloud Functions.
  //
  // Each field below has a project-level twin that is authoritative TODAY. The
  // twins stay until the completion machine moves over, then become derived.

  /** Where this ONE professional's engagement stands, independently of everyone
   *  else's on the same project.
   *
   *  'withdrawn' is not a completion: the professional left before the work
   *  closed, no fee is owed, and it is distinct from 'cancelled' (the whole
   *  project ended) and from 'completed' (the work was delivered). */
  engagementStatus?:
    | 'hired'
    | 'end_requested_by_pro'
    | 'end_requested_by_client'
    | 'completed'
    | 'withdrawn'
    | 'disputed'
    | 'cancelled';

  /** Per-engagement mirror of `ProjectRequest.completion`. `remindedDays` has to
   *  live here rather than on the project: the cron's idempotency guard is
   *  currently one array for everyone, so reminding one professional marks the
   *  day sent for all of them. */
  completion?: {
    state: 'none' | 'requested' | 'confirmed' | 'disputed';
    source?: 'pro' | 'client' | 'auto';
    requestedBy?: ID;
    requestedAt?: Timestamp;
    confirmedAt?: Timestamp;
    remindedDays?: number[];
    /**
     * WHICH end the professional asked for. The two outcomes are opposite — one
     * charges a fee and unlocks a review, the other charges nothing and frees a
     * slot — so the professional is made to choose, and the choice is recorded
     * here rather than inferred later.
     *
     * They share `engagementStatus: 'end_requested_by_pro'` because from the
     * project's point of view both are "waiting on the client"; nothing decides
     * from the status alone.
     */
    endKind?: 'finished' | 'withdrawing';
    /** Free text the professional gave with a withdrawal. Bounded server-side. */
    endReason?: string;
  };

  /**
   * WHY this engagement was released, when it was. Identical mechanics, two
   * different events: a professional removed by a client they stopped answering
   * is not the same as one who chose to leave, and the reliability count must
   * not bucket them together.
   */
  releaseReason?: 'client_removed' | 'pro_withdrew';

  /** This engagement's own dispute deadline, stamped at ITS confirmation. One
   *  client action closing several engagements opens several independent
   *  windows, which the single project-level field cannot express. */
  disputeWindowEndsAt?: Timestamp;

  /** Per-engagement admin escalation. The project-level pair cannot say WHICH
   *  professional is in dispute when two are. */
  adminReviewPending?: boolean;
  adminReview?: {
    reason: 'fee_disputed' | 'completion_unanswered' | 'withdrawal_rejected' | 'didnt_happen';
    at?: Timestamp;
    note?: string;
  };

  /** Per-engagement mirror of `ProjectRequest.endDatePromptedAt` — a single
   *  project field today, so the "did this end?" prompt fires once for the whole
   *  project however many professionals are on it. */
  endDatePromptedAt?: Timestamp;
};

/** See `PriceOffer.review`. */
export type OfferReview = 'pending' | 'confirmed';

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
  /**
   * The client's decision on this professional, once hired. Written by
   * `hireProfessional` as 'pending' on the offers it accepts, and moved to
   * 'confirmed' by the client's review card (server-only — outside the offer
   * rules' client allowlist, so neither party can write it).
   *
   * ABSENT means confirmed: every offer accepted before the review card existed
   * has no field, and those hires were never up for review.
   */
  review?: OfferReview;
  /** When `review` left 'pending'. */
  reviewedAt?: Timestamp;
};

export type RemovalRequest = {
  professionalId: string;
  requestedBy: string;
  /** In practice only 'pending' is ever observed. `freeSlot` DELETES the request
   *  document when the professional accepts, rather than marking it — a request
   *  left behind can never be cleared (clients cannot delete it) and would make
   *  a re-hired professional permanently un-removable. 'accepted' is retained
   *  only for documents written before that change. */
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
  /** Same as `PriceOffer.review`. Written on the bundle AND on each of its
   *  component offers, which are accepted together. */
  review?: OfferReview;
  reviewedAt?: Timestamp;
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
