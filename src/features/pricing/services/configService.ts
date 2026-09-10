import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@core/firebase/config';
import { PRICING_CONFIG_DEFAULTS, resolvePricingConfig, type PricingConfig } from '../utils/config';

/**
 * Runtime pricing config at `config/pricing` — the single source for every rate,
 * cap and grace period the UI displays. Admin-SDK-written; any signed-in user may
 * read it.
 *
 * A LISTENER, not a fetch, so an edit in the Firestore console reaches a running
 * app with no rebuild and no redeploy. The shape, the defaults and the merge live
 * in ../utils/config so they can be tested without Firestore.
 */
export {
  PRICING_CONFIG_DEFAULTS, resolvePricingConfig, feeRateOf, type PricingConfig,
} from '../utils/config';

export const CONFIG_DOC_PATH = 'config/pricing';

export function listenToPricingConfig(
  callback: (config: PricingConfig) => void,
): () => void {
  return onSnapshot(
    doc(db, CONFIG_DOC_PATH),
    (snap) => callback(resolvePricingConfig(snap.exists() ? snap.data() : null)),
    (err) => {
      // Surfaced, never swallowed. A denial that silently looked like "the
      // configured values" is the exact shape catalogued in
      // docs/known-issues-silent-failures.md.
      console.error('[pricing] listenToPricingConfig failed:', err?.code, err);
      callback(PRICING_CONFIG_DEFAULTS);
    },
  );
}
