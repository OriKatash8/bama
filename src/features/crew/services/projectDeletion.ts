import { callFunction } from '@core/firebase/functions';

const deleteProjectFn = callFunction<
  { projectId: string },
  { ok: boolean; alreadyGone?: boolean; deleted?: { priceOffers: number; bundleOffers: number; fees: number } }
>('deleteProject');

/**
 * Delete a project together with the data that depends on it, so nothing is
 * orphaned once the project is gone: its priceOffers, its bundleOffers, its
 * per-professional fee docs, and its group chat.
 *
 * The cascade runs SERVER-SIDE (`deleteProject` callable). It used to issue raw
 * client deletes, which the rules deny for offers and can never permit for fee
 * docs — so it would have reported success while orphaning all of it. Orphaned
 * accepted offers are not harmless either: `computeProAmount` prices the platform
 * fee off them.
 *
 * The callable REFUSES to delete a project that has hired anyone
 * ('cannot-delete-hired-project'). Ending a hired project is `cancelProject`,
 * which frees the slots without destroying the fee record.
 */
export async function deleteProjectAndOffers(projectId: string, _chatId?: string): Promise<void> {
  await deleteProjectFn({ projectId });
}
