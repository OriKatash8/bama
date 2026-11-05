/**
 * Pure planning for scripts/admin-set-payment-link-config.mjs, so the rules that
 * keep link mode away from real users are unit-tested without touching Firestore.
 *
 * Writes only three keys: config/pricing.paymentProvider, and in
 * config/paymentsPrivate: paymentTestUids and paymentLinkAudience.
 */

export const PROVIDERS = ['none', 'grow_link'];   // fake_link is a test provider: never set in prod
export const AUDIENCES = ['testers', 'all'];
// Firebase Auth uids (custom ones too, e.g. demo-test1). No underscore: feeKey and the charge
// idempotency key are split on '_'.
const UID = /^[A-Za-z0-9][A-Za-z0-9-]{4,126}[A-Za-z0-9]$/;   // never starts with '-', so a flag can't pass as a uid
const MAX_TESTERS = 20;

/** "a,b" -> ['a','b']; null when the flag is absent; throws on a malformed uid. */
export function parseTesters(raw) {
  if (raw === undefined) return null;
  const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (list.length > MAX_TESTERS) throw new Error(`at most ${MAX_TESTERS} testers`);
  for (const u of list) if (!UID.test(u)) throw new Error(`"${u}" does not look like a Firebase uid`);
  if (new Set(list).size !== list.length) throw new Error('duplicate tester uid');
  return list;
}

/**
 * @param {{ provider?: string, audience?: string, testers?: string[] | null, allowAll?: boolean }} want
 * @param {{ pricing: object, priv: object | null }} current   the docs as read (priv null = missing)
 * @returns {{ errors: string[], pricingWrite: object | null, privWrite: object | null,
 *             after: { paymentProvider: string, paymentLinkAudience: string, paymentTestUids: string[] } }}
 */
export function planLinkConfig(want, current) {
  const errors = [];
  const curProvider = current.pricing.paymentProvider ?? 'none';
  const curAudience = current.priv?.paymentLinkAudience === 'all' ? 'all' : 'testers';
  const curTesters = Array.isArray(current.priv?.paymentTestUids) ? current.priv.paymentTestUids : [];

  if (!PROVIDERS.includes(curProvider)) {
    errors.push(`paymentProvider is ${JSON.stringify(curProvider)}; this script only moves between ${PROVIDERS.join(' / ')}`);
  }
  if (want.provider !== undefined && !PROVIDERS.includes(want.provider)) {
    errors.push(`--provider must be one of ${PROVIDERS.join(', ')} (got ${JSON.stringify(want.provider)})`);
  }
  if (want.audience !== undefined && !AUDIENCES.includes(want.audience)) {
    errors.push(`--audience must be one of ${AUDIENCES.join(', ')} (got ${JSON.stringify(want.audience)})`);
  }
  if (want.audience === 'all' && !want.allowAll) {
    errors.push('--audience all gives payment links to EVERY professional; add --allow-all if that is really the intent');
  }

  const provider = want.provider ?? curProvider;
  const audience = want.audience ?? curAudience;
  const testers = want.testers ?? curTesters;

  if (provider === 'grow_link' && audience === 'testers' && testers.length === 0) {
    errors.push('grow_link with audience testers needs at least one tester uid (--testers); otherwise it is on for nobody');
  }

  const privWrite = {};
  if (want.testers != null && JSON.stringify(testers) !== JSON.stringify(curTesters)) privWrite.paymentTestUids = testers;
  if (want.audience !== undefined && audience !== curAudience) privWrite.paymentLinkAudience = audience;
  if (current.priv === null && Object.keys(privWrite).length === 0 && provider === 'grow_link') {
    // First time the private doc is needed: write the safe defaults explicitly.
    privWrite.paymentTestUids = testers;
    privWrite.paymentLinkAudience = audience;
  }
  const pricingWrite = provider !== curProvider ? { paymentProvider: provider } : null;

  return {
    errors,
    pricingWrite,
    privWrite: Object.keys(privWrite).length ? privWrite : null,
    after: { paymentProvider: provider, paymentLinkAudience: audience, paymentTestUids: testers },
  };
}
