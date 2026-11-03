import { db } from '../lifecycle/helpers';
import { readConfig } from '../lifecycle/config';
import type { PaymentProviderName } from '../pricing';

/** True under the Functions emulator, where the fake provider may run for anyone. */
export function isEmulator(): boolean {
  return process.env.FUNCTIONS_EMULATOR === 'true';
}

/**
 * What the payment layer reads: the public master switch plus the server-only
 * tester list. `paymentTestUids` lives in config/paymentsPrivate (rules: no
 * client access) so the app can never learn who the testers are.
 */
export type PaymentsConfig = {
  paymentProvider: PaymentProviderName;
  paymentTestUids: readonly string[];
  /** Who may be given a payment link. Private doc, default 'testers'. */
  paymentLinkAudience: LinkAudience;
  chargeMaxAttempts: number;
  chargeRetryHours: number;
};

export type LinkAudience = 'testers' | 'all';

export const PAYMENTS_PRIVATE_PATH = 'config/paymentsPrivate';

/** Pure: pull the tester list out of the raw private doc. Anything unusable is []. */
export function parseTestUids(raw: unknown): string[] {
  const list = (raw as { paymentTestUids?: unknown } | null | undefined)?.paymentTestUids;
  return Array.isArray(list) ? list.filter((u): u is string => typeof u === 'string' && u.length > 0) : [];
}

/** Pure: only the exact string 'all' widens the audience; anything else is 'testers'. */
export function parseLinkAudience(raw: unknown): LinkAudience {
  return (raw as { paymentLinkAudience?: unknown } | null | undefined)?.paymentLinkAudience === 'all'
    ? 'all'
    : 'testers';
}

const TTL_MS = 60_000;
type Private = { uids: readonly string[]; audience: LinkAudience };
let cache: { value: Private; at: number } | null = null;

async function readPrivate(): Promise<Private> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  // Fail closed: no testers, and the narrow audience.
  let value: Private = { uids: [], audience: 'testers' };
  try {
    const snap = await db.doc(PAYMENTS_PRIVATE_PATH).get();
    const raw = snap.exists ? snap.data() : null;
    value = { uids: parseTestUids(raw), audience: parseLinkAudience(raw) };
  } catch (err) {
    console.error('[payments] reading paymentsPrivate failed, using no test uids', err);
  }
  cache = { value, at: Date.now() };
  return value;
}

export async function readPaymentsConfig(): Promise<PaymentsConfig> {
  const [config, priv] = await Promise.all([readConfig(), readPrivate()]);
  return {
    paymentProvider: config.paymentProvider,
    paymentTestUids: priv.uids,
    paymentLinkAudience: priv.audience,
    chargeMaxAttempts: config.chargeMaxAttempts,
    chargeRetryHours: config.chargeRetryHours,
  };
}

/** Test seam. */
export function __resetPaymentsConfigCache(): void {
  cache = null;
}

/**
 * THE per-user gate, used by getProvider, getMyPaymentMethod's `enabled` and the
 * test-only callables, so they can never disagree.
 *
 *   'none'  -> never.
 *   'grow'  -> everyone.
 *   'fake'  -> only a listed tester, or anyone under the emulator. In production
 *              the fake provider can therefore never touch a real pro's fee.
 *   'grow_link' -> a listed tester, or everyone once paymentLinkAudience is 'all'.
 *   'fake_link' -> like 'fake'.
 */
export function isPaymentsEnabledFor(
  config: Pick<PaymentsConfig, 'paymentProvider' | 'paymentTestUids'> &
    Partial<Pick<PaymentsConfig, 'paymentLinkAudience'>>,
  uid: string,
  emulator: boolean = isEmulator(),
): boolean {
  switch (config.paymentProvider) {
    case 'grow': return true;
    case 'grow_link':
      return config.paymentLinkAudience === 'all' || config.paymentTestUids.includes(uid);
    case 'fake':
    case 'fake_link': return emulator || config.paymentTestUids.includes(uid);
    default: return false;
  }
}
