import type { LinkProviderName, PaymentProviderName } from '../pricing';

/**
 * The seam between BAMA's fee-charging logic and whichever gateway holds the
 * cards. Everything outside this folder's provider files (claim, settle, retry,
 * webhook idempotency) is provider-agnostic and only talks to this interface.
 *
 * Card details never touch BAMA: the pro enters them on the provider's hosted
 * page and BAMA stores only the token it gets back.
 */

export type { PaymentProviderName, LinkProviderName };

export type FailureClass = 'final' | 'retryable';

export type ChargeInput = {
  token: string;
  /** Whole shekels, exactly `feeDue` at claim time. */
  amount: number;
  currency: 'ILS';
  /** `${projectId}_${proId}_${attempt}`: the same key must never charge twice. */
  idempotencyKey: string;
  description: string;
  proId: string;
  projectId: string;
};

export type ChargeResult = {
  outcome: 'succeeded' | 'failed' | 'pending';
  providerRef?: string;
  failureCode?: string;
  /** 'final': stop using this token (expired, stolen). 'retryable': try later. */
  failureClass?: FailureClass;
};

export type CardDetails = {
  token: string;
  last4: string;
  brand: string;
  expMonth: number;
  expYear: number;
};

/** A verified, parsed provider callback. `providerEventId` is the idempotency key. */
export type WebhookEvent =
  | ({
      type: 'charge';
      providerEventId: string;
      /** Matches the key the charge was sent with. */
      idempotencyKey: string;
    } & ChargeResult)
  | {
      type: 'card_saved';
      providerEventId: string;
      uid: string;
      card: CardDetails;
    };

/** The slice of an Express request a provider needs; structural so tests can fake it. */
export type WebhookRequest = {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  rawBody?: Buffer;
};

export interface PaymentProvider {
  readonly name: Exclude<PaymentProviderName, 'none' | LinkProviderName>;
  /** A hosted page where the pro saves a card (token only, no charge). */
  createCardSaveSession(uid: string): Promise<{ url: string; sessionId: string }>;
  chargeToken(input: ChargeInput): Promise<ChargeResult>;
  /** Null when the request is not authentic or not understood. Never throws on bad input. */
  verifyAndParseWebhook(req: WebhookRequest): Promise<WebhookEvent | null>;
  /**
   * What happened to a charge sent with this key, or null if the provider has
   * no record of it. Used to settle a claim left in 'charging' by a crash; the
   * alternative, charging again, could bill twice.
   */
  lookupCharge?(idempotencyKey: string): Promise<ChargeResult | null>;
}

export type LinkFeeInput = {
  /** `${projectId}_${proId}`: echoed back by Make as Custom Field 1. */
  feeKey: string;
  /** One per creation attempt, so Make can dedupe a retried request. */
  requestId: string;
  projectId: string;
  proId: string;
  /** Whole shekels, exactly `feeDue` when the link is created. */
  amount: number;
  currency: 'ILS';
  description: string;
  payer: { fullName: string; phone: string; email?: string };
};

/**
 * The link-style seam: instead of charging a stored token, ask the gateway for a
 * single-use hosted payment link and let the pro pay on it. The result arrives
 * later through paymentLinkConfirm, never from this call.
 */
export interface LinkProvider {
  readonly name: LinkProviderName;
  /** Throws on any failure; the caller releases its claim and retries next run. */
  createPaymentLink(input: LinkFeeInput): Promise<{ url: string; processId: string }>;
}
