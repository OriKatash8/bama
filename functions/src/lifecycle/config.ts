import { db } from './helpers';
import { CONFIG_DEFAULTS, resolveConfig, type PricingConfig } from '../pricing';

/**
 * Runtime pricing config, at `config/pricing`. Admin-SDK-written, readable by any
 * signed-in user (the client must DISPLAY the rate, not invent it).
 *
 * No rate, cap or grace period is hardcoded in business logic any more: callers
 * read them from here. The constants in ../pricing are the FALLBACK, used when
 * the document is missing, unreachable, or carries an unusable value — and the
 * pure shape and merge logic live there too, so they can be tested without
 * Firestore.
 */
export { CONFIG_DEFAULTS, resolveConfig, feeRateOf, type PricingConfig } from '../pricing';

export const CONFIG_DOC_PATH = 'config/pricing';

// Function instances stay warm between invocations, so a short TTL is what makes
// a console edit take effect without a redeploy. 60s is the worst-case staleness.
const TTL_MS = 60_000;
let cache: { value: PricingConfig; at: number } | null = null;

/** Read the runtime config, cached. Never throws — a failure yields defaults. */
export async function readConfig(): Promise<PricingConfig> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  let value = CONFIG_DEFAULTS;
  try {
    const snap = await db.doc(CONFIG_DOC_PATH).get();
    value = resolveConfig(snap.exists ? snap.data() : null);
  } catch (err) {
    // Surfaced, never swallowed: running on defaults is correct behaviour but it
    // is not the intended one, and it must be visible in the logs.
    console.error('[config] readConfig failed — using defaults', err);
  }
  cache = { value, at: Date.now() };
  return value;
}

/** Test seam — drops the cache so a caller can observe a fresh read. */
export function __resetConfigCache(): void {
  cache = null;
}
