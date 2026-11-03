import { notify } from '../lifecycle/helpers';
import { langOf, type Lang } from '../lifecycle/feeOverdue';

/**
 * Pushes about the automatic charge. Same convention as the overdue notices (both
 * languages, picked by users/{uid}.language, Hebrew when absent) and the same
 * 'charge_failed' type, which is already ESSENTIAL (cannot be muted) and routed
 * to /settings/payment. The fee is always "עמלת תיווך" / "brokerage fee".
 */
export type ChargeNoticeKind = 'charge_retry' | 'charge_needs_card' | 'charge_no_card' | 'charge_exhausted';

const TEXT: Record<ChargeNoticeKind, Record<Lang, (amount: number) => string>> = {
  charge_retry: {
    he: (a) => `החיוב של עמלת התיווך בסך ₪${a} נכשל. ננסה שוב בקרוב.`,
    en: (a) => `Charging your ₪${a} brokerage fee failed. We'll try again soon.`,
  },
  charge_needs_card: {
    he: (a) => `לא הצלחנו לחייב את עמלת התיווך בסך ₪${a}. יש להוסיף כרטיס אחר.`,
    en: (a) => `We couldn't charge your ₪${a} brokerage fee. Please add a different card.`,
  },
  charge_no_card: {
    he: (a) => `עמלת התיווך בסך ₪${a} מוכנה לחיוב. יש להוסיף כרטיס תשלום.`,
    en: (a) => `Your ₪${a} brokerage fee is ready to be charged. Please add a payment card.`,
  },
  charge_exhausted: {
    he: (a) => `החיוב של עמלת התיווך בסך ₪${a} נכשל מספר פעמים. נציג יצור איתך קשר.`,
    en: (a) => `Charging your ₪${a} brokerage fee failed several times. We'll be in touch.`,
  },
};

export async function sendChargeNotice(
  kind: ChargeNoticeKind, proId: string, projectId: string, amount: number,
): Promise<void> {
  const lang = await langOf(proId);
  await notify({
    userId: proId,
    title: 'BAMA',
    message: TEXT[kind][lang](amount),
    data: { type: 'charge_failed', projectId },
  });
}

export const __NOTICE_TEXT = TEXT;

/**
 * Link-mode pushes. Their own essential type, 'fee_link', routed to
 * /settings/payment, where the fee row carries the "pay now" button (or the "add
 * a phone number" prompt).
 */
export type LinkNoticeKind = 'link_ready' | 'link_needs_phone';

const LINK_TEXT: Record<LinkNoticeKind, Record<Lang, (amount: number) => string>> = {
  link_ready: {
    he: (a) => `עמלת התיווך – ${a} ₪, לחץ לתשלום`,
    en: (a) => `Your brokerage fee – ₪${a}. Tap to pay.`,
  },
  link_needs_phone: {
    he: (a) => `כדי לשלם את עמלת התיווך (${a} ₪) יש להוסיף מספר טלפון נייד`,
    en: (a) => `To pay your ₪${a} brokerage fee, please add a mobile phone number.`,
  },
};

export async function sendLinkNotice(
  kind: LinkNoticeKind, proId: string, projectId: string, amount: number,
): Promise<void> {
  const lang = await langOf(proId);
  await notify({
    userId: proId,
    title: 'BAMA',
    message: LINK_TEXT[kind][lang](amount),
    data: { type: 'fee_link', projectId },
  });
}

export const __LINK_NOTICE_TEXT = LINK_TEXT;
