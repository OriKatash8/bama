import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { feeRef, requireAuth, type FeeDoc } from '../lifecycle/helpers';
import { assertVerifiedEmail } from '../auth/verifiedEmail';
import { readPaymentsConfig, type PaymentsConfig } from './guard';
import { getLinkProvider } from './getProvider';
import { MAKE_CREATE_LINK_URL, MAKE_SHARED_SECRET } from './growLinkProvider';
import { runLinkIssue, type LinkDeps } from './link';
import { isLinkLive } from './linkLogic';

/**
 * "Pay now": the professional asks for his fee's payment link without waiting for
 * the contest window to end.
 *
 * It is NOT a second way of making links. It runs runLinkIssue — the same
 * transactional claim the cron uses — so one fee still has one link, a live link is
 * reused (no Make call), a changed amount supersedes, and a cron sweep racing this
 * tap cannot produce a second link: whoever commits the claim first wins and the
 * other sees `claim-held` / `link-live`.
 *
 * Paying early accepts the amount. Nothing here settles anything; a payment still
 * arrives only through paymentLinkConfirm. Contesting is closed once it is paid
 * (contestEngagement) and a contested fee is refused here.
 */
export type PayNowResult =
  | { status: 'ready'; url: string }
  /** Another request is creating the link right now; the fee row updates when done. */
  | { status: 'pending' }
  | { status: 'needs_phone' }
  /** Make failed or the fee is in a state the cron owns; try again later. */
  | { status: 'unavailable' };

const liveUrl = (fee: FeeDoc | undefined): string | null => {
  if (!fee || fee.chargeState !== 'awaiting_payment' || !isLinkLive(fee)) return null;
  const url = fee.paymentLink?.url;
  return typeof url === 'string' && url.startsWith('https://') ? url : null;
};

export async function requestPaymentLinkNow(
  projectId: string, proId: string, config: PaymentsConfig,
  now: number = Date.now(), deps: LinkDeps = {},
): Promise<PayNowResult> {
  const provider = deps.provider !== undefined
    ? deps.provider
    : getLinkProvider(config, { professionalId: proId });
  if (!provider) throw new HttpsError('failed-precondition', 'payments-disabled');

  const read = async () => {
    const snap = await feeRef(projectId, proId).get();
    return snap.exists ? (snap.data() as FeeDoc) : undefined;
  };
  const fee = await read();
  if (!fee || fee.feeStatus !== 'owed') throw new HttpsError('failed-precondition', 'not-owed');
  if (fee.engagementStatus === 'disputed' || fee.adminReviewPending === true) {
    throw new HttpsError('failed-precondition', 'contested');
  }
  if (fee.engagementStatus !== 'completed') throw new HttpsError('failed-precondition', 'not-completed');
  if (fee.feePaid === true || fee.status === 'paid' || fee.status === 'not_owed') {
    throw new HttpsError('failed-precondition', 'not-owed');
  }
  if (!(typeof fee.feeDue === 'number' && fee.feeDue > 0)) {
    throw new HttpsError('failed-precondition', 'nothing-due');
  }

  // A tap on an existing link is not a request for a new one.
  const existing = liveUrl(fee);
  if (existing) return { status: 'ready', url: existing };

  const res = await runLinkIssue(
    projectId, proId, config, now, { ...deps, provider }, { early: true, source: 'user' },
  );
  switch (res.status) {
    case 'created': return { status: 'ready', url: res.url };
    case 'needs_phone': return { status: 'needs_phone' };
    case 'skipped': {
      if (res.reason === 'link-live') {
        const url = liveUrl(await read());
        return url ? { status: 'ready', url } : { status: 'unavailable' };
      }
      // Someone (the cron, a double tap) is creating it right now.
      if (res.reason === 'claim-held') return { status: 'pending' };
      return { status: 'unavailable' };
    }
    default: return { status: 'unavailable' };
  }
}

export const requestMyPaymentLinkNow = onCall(
  { region: 'europe-west1', secrets: [MAKE_CREATE_LINK_URL, MAKE_SHARED_SECRET] },
  async (request): Promise<PayNowResult> => {
    const uid = requireAuth(request.auth?.uid);
    assertVerifiedEmail(request);
    const projectId = request.data?.projectId;
    if (typeof projectId !== 'string' || !projectId) {
      throw new HttpsError('invalid-argument', 'projectId required');
    }
    // The fee is always the CALLER's own: fees/{uid}. There is no proId argument.
    return requestPaymentLinkNow(projectId, uid, await readPaymentsConfig());
  },
);
