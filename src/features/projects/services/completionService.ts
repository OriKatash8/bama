import { callFunction } from '@core/firebase/functions';

/**
 * The professional's half of the completion flow.
 *
 * The client's half — `confirmCompletion` — is called from project-details
 * directly; these are the two calls only a hired professional can make.
 */

/**
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

export { canDispute } from '../utils/completion';
