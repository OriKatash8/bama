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
  chargeMaxAttempts: number;
  chargeRetryHours: number;
};

export const PAYMENTS_PRIVATE_PATH = 'config/paymentsPrivate';

/** Pure: pull the tester list out of the raw private doc. Anything unusable is []. */
export function parseTestUids(raw: unknown): string[] {
  const list = (raw as { paymentTestUids?: unknown } | null | undefined)?.paymentTestUids;
  return Array.isArray(list) ? list.filter((u): u is string => typeof u === 'string' && u.length > 0) : [];
}

const TTL_MS = 60_000;
let cache: { value: readonly string[]; at: number } | null = null;

async function readTestUids(): Promise<readonly string[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  let value: readonly string[] = [];
  try {
    const snap = await db.doc(PAYMENTS_PRIVATE_PATH).get();
    value = parseTestUids(snap.exists ? snap.data() : null);
  } catch (err) {
    // Fail closed: no testers means the fake provider runs for nobody.
    console.error('[payments] reading paymentsPrivate failed, using no test uids', err);
  }
  cache = { value, at: Date.now() };
  return value;
}

export async function readPaymentsConfig(): Promise<PaymentsConfig> {
  const [config, paymentTestUids] = await Promise.all([readConfig(), readTestUids()]);
  return {
    paymentProvider: config.paymentProvider,
    paymentTestUids,
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
 */
export function isPaymentsEnabledFor(
  config: Pick<PaymentsConfig, 'paymentProvider' | 'paymentTestUids'>,
  uid: string,
  emulator: boolean = isEmulator(),
): boolean {
  switch (config.paymentProvider) {
    case 'grow': return true;
    case 'fake': return emulator || config.paymentTestUids.includes(uid);
    default: return false;
  }
}
