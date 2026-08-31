import { callFunction } from '@core/firebase/functions';

const cancelProjectFn = callFunction<
  { projectId: string },
  { ok: boolean; refundReviewPending: boolean }
>('cancelProject');

/**
 * Soft-cancel a project (the client's "delete" action). Instead of hard-deleting
 * — which the security rules forbid for offers/chats anyway — this marks the
 * project `cancelled` and archives its group chat with reason `cancelled`.
 *
 * The result: the client stops seeing it in My Projects (filtered by status),
 * while professionals keep a READ-ONLY chat with a "Cancelled" badge and a
 * delete (leave) button in their chat list.
 *
 * Both writes now happen inside the `cancelProject` callable's batch: `status`
 * and `cancelledAt` are server-only fields, and cancelling must also free the
 * slot (`slotActive: false`) and flag an early-paid fee for manual refund — none
 * of which the old client-side batch did. `chatId` is ignored; the callable
 * reads it off the project.
 */
export async function cancelProject(projectId: string, chatId?: string): Promise<void> {
  void chatId; // resolved server-side — kept for call-site compatibility
  await cancelProjectFn({ projectId });
}
