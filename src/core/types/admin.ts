import type { ID, Timestamp } from './common';

/** The type of enforcement an admin took. */
export type AdminActionType = 'warn' | 'suspend' | 'unsuspend' | 'clear_warning';

/**
 * Append-only record of an admin enforcement action, kept as evidence.
 * Written ONLY by the moderateUser callable via the Admin SDK — never from a
 * client. Rules forbid client create/update/delete; admins may read.
 */
export type AdminAction = {
  id: ID;
  action: AdminActionType;
  /** Admin who performed the action. */
  actorId: ID;
  actorName: string;
  targetUserId: ID;
  targetUserName: string;
  /** Denormalized email at action time (recorded for warn/suspend). */
  targetUserEmail?: string;
  /** Restatable reason. Required for `warn` and `suspend`. */
  reason: string;
  /** Originating report, if the action was taken from a report. */
  reportId?: string;
  createdAt: Timestamp;
};
