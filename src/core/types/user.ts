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
  /** True once the user confirmed they are 18+. */
  ageConfirmed?: boolean;
  /** Unix ms timestamp of the age confirmation. */
  ageConfirmedAt?: number | null;
  /** Chat ids the user has silenced. Read by the onNewCommunityMessage trigger
   *  before creating a notification, so a mute suppresses the in-app bell as
   *  well as the push. Written by muteChat/unmuteChat. */
  mutedChats?: string[];
  /**
   * Mentions waiting for this user, written by the message triggers.
   *
   * SEPARATE FROM unreadCount on purpose: an unread count means "activity", a
   * mention means "someone needs you". Community channels never bump
   * unreadCount at all, so a pill derived from it would never appear there.
   *
   * Keyed by chatId AND channelId, so a mention in one channel is not cleared
   * by opening another in the same community. `messageId` is what
   * jump-to-mention scrolls to.
   *
   * Rules let the owner only SHRINK this list; the trigger (Admin SDK) is the
   * only thing that adds to it.
   */
  pendingMentions?: {
    chatId: ID;
    channelId: ID | null;
    messageId: ID;
    at?: Timestamp | null;
  }[];
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
