import { callFunction } from '@core/firebase/functions';

/**
 * The professional's half of the completion flow.
 *
 * The client's half — `confirmCompletion` — is called from project-details
 * directly; these are the two calls only a hired professional can make.
 */

/**
 * TEMPORARY — NO CALLER IN THIS BUILD. Kept only because the server alias is
 * kept: installed builds still call `requestCompletion`, and this binding dies
 * on the same day that alias does.
 *
 * Ask the client to confirm the project is finished.
 *
 * The client is prompted, and reminded on days 3 and 6. If they never answer, the
 * project goes to admin review — it is NOT auto-confirmed, because confirming on
 * the strength of silence marks work delivered that nobody agreed was delivered.
 */
export const requestCompletion = callFunction<{ projectId: string }, { ok: boolean }>(
  'requestCompletion',
);

/**
 * Dispute a completion the client has already confirmed.
 *
 * Protection, not a veto: the project stays completed, slots stay free and
 * reviews stay published. It marks the fee record and puts the project in front
 * of a human.
 */
export const disputeFeeByPro = callFunction<
  { projectId: string; reason?: string },
  { ok: boolean }
>('disputeFeeByPro');

/**
 * The professional marks their OWN engagement finished.
 *
 * The primary completion trigger since Phase 4. The client has already paid them
 * outside the app, so asking the client to confirm bought the client nothing and
 * left the flow waiting on the one party with no reason to act; the professional
 * has reasons — reviews and capacity — and `completionDueAt` covers them not
 * acting either.
 *
 * Completes ONE engagement, not the project: everyone else's stands where it was,
 * and the project closes only once every engagement on it is terminal.
 */
export const markEngagementComplete = callFunction<
  { projectId: string },
  { ok: boolean }
>('markEngagementComplete');

export { canDispute, canMarkComplete } from '../utils/completion';
