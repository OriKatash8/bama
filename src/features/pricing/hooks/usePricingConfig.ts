import { useEffect, useState } from 'react';
import {
  listenToPricingConfig, PRICING_CONFIG_DEFAULTS, type PricingConfig,
} from '../services/configService';

/**
 * The live pricing config, for any component that needs to render a rate, a cap
 * or a window. Starts on the fallback defaults so nothing ever renders a blank
 * or a zero while the first snapshot is in flight.
 *
 * ONE shared listener for the whole app, refcounted: this hook is used by the
 * dashboard, the blocked sheet and the balance screen, and three independent
 * onSnapshot subscriptions to the same document would be three times the reads
 * for identical data.
 */
let shared: PricingConfig = PRICING_CONFIG_DEFAULTS;
let unsubscribe: (() => void) | null = null;
let refs = 0;
const listeners = new Set<(c: PricingConfig) => void>();

function subscribe(fn: (c: PricingConfig) => void): () => void {
  listeners.add(fn);
  refs += 1;
  if (!unsubscribe) {
    unsubscribe = listenToPricingConfig((config) => {
      shared = config;
      listeners.forEach((l) => l(config));
    });
  }
  return () => {
    listeners.delete(fn);
    refs -= 1;
    if (refs <= 0) {
      unsubscribe?.();
      unsubscribe = null;
      refs = 0;
    }
  };
}

export function usePricingConfig(): PricingConfig {
  const [config, setConfig] = useState<PricingConfig>(shared);
  useEffect(() => subscribe(setConfig), []);
  return config;
}
