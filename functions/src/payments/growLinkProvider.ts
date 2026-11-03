import { defineSecret } from 'firebase-functions/params';
import type { LinkFeeInput, LinkProvider } from './types';

/**
 * Grow payment links through Make. BAMA never holds Grow credentials: it POSTs to
 * a Make webhook, Make runs "Create Payment Link" and answers on the same request.
 *
 * Declared only, never created in this change. A secret that is declared but unset
 * fails `firebase deploy` for every function that binds it, so these are bound only
 * by the functions that need them (see feeChargeCron, paymentLinkConfirm).
 */
export const MAKE_CREATE_LINK_URL = defineSecret('MAKE_CREATE_LINK_URL');
export const MAKE_SHARED_SECRET = defineSecret('MAKE_SHARED_SECRET');

/** Make allows ~40s on a webhook response; stay well inside the cron's 300s. */
export const MAKE_TIMEOUT_MS = 25_000;
export const SECRET_HEADER = 'X-Bama-Secret';

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Pure: the exact body Make receives. Kept separate so the contract is testable. */
export function buildMakeRequest(input: LinkFeeInput): Record<string, unknown> {
  return {
    requestId: input.requestId,
    feeKey: input.feeKey,
    projectId: input.projectId,
    proId: input.proId,
    amount: input.amount,
    currency: input.currency,
    description: input.description,
    payer: {
      fullName: input.payer.fullName,
      phone: input.payer.phone,
      ...(input.payer.email ? { email: input.payer.email } : {}),
    },
    customField1: input.feeKey,
  };
}

/** Pure: validate Make's reply. Anything but { ok:true, url, paymentLinkProcessId } throws. */
export function parseMakeResponse(raw: unknown): { url: string; processId: string } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const url = r.url;
  const id = r.paymentLinkProcessId;
  if (r.ok === false) throw new Error(`make: ${String(r.error ?? 'rejected')}`);
  if (typeof url !== 'string' || !/^https:\/\//.test(url)) throw new Error('make: missing or non-https url');
  const processId = typeof id === 'number' ? String(id) : id;
  if (typeof processId !== 'string' || !processId) throw new Error('make: missing paymentLinkProcessId');
  return { url, processId };
}

export function makeGrowLinkProvider(deps: {
  getUrl: () => string;
  getSecret: () => string;
  fetchFn: FetchLike;
}): LinkProvider {
  return {
    name: 'grow_link',
    async createPaymentLink(input) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), MAKE_TIMEOUT_MS);
      try {
        const res = await deps.fetchFn(deps.getUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', [SECRET_HEADER]: deps.getSecret() },
          body: JSON.stringify(buildMakeRequest(input)),
          signal: ctl.signal,
        });
        if (!res.ok) throw new Error(`make: http ${res.status}`);
        return parseMakeResponse(await res.json());
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export const growLinkProvider: LinkProvider = makeGrowLinkProvider({
  getUrl: () => MAKE_CREATE_LINK_URL.value(),
  getSecret: () => MAKE_SHARED_SECRET.value(),
  fetchFn: (url, init) => fetch(url, init) as ReturnType<FetchLike>,
});
