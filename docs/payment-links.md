# Fee payment links (Grow via Make)

Fees are collected on single-use Grow payment links created and confirmed by two Make
scenarios. BAMA holds no Grow credentials, only two Make secrets. The token code
(`growProvider`, `chargeToken`, saved cards) stays dormant: it is the future upgrade.

Config: `config/pricing.paymentProvider` = `grow_link` (or `fake_link` for tests).
`config/paymentsPrivate.paymentLinkAudience` = `testers` (default) | `all`; testers are
`paymentTestUids`. Secrets (declared, NOT created): `MAKE_CREATE_LINK_URL`, `MAKE_SHARED_SECRET`.

## Flow
1. `feeChargeCron` (hourly): for a due fee (completed, contest window closed, owed, no live
   link) claims it transactionally, POSTs scenario 1, stores `paymentLink` + `paymentLinks/{processId}`,
   sets `chargeState: awaiting_payment`, pushes `fee_link` once.
2. No Israeli mobile on file (`users/{uid}/private/contact.phone`, +9725XXXXXXXX): `needs_phone`, one push, no link.
3. The pro taps "שלם עכשיו" and pays on Grow. Grow notifies Make (scenario 2), which approves the
   transaction, verifies it and forwards PAID notifications only to `paymentLinkConfirm`.
4. `paymentLinkConfirm` matches `paymentLinks/{processId}` (feeKey is a cross-check only), requires the
   exact amount, then `settleFee({source:'link'})`. Anything else is recorded for an admin and settles nothing.
5. Grow's `successUrl` is `https://<hosting>/pay-return`: a static page that only redirects to
   `bama://settings/payment`. It cannot settle anything.

A link is payable only while `paymentLink.amount === feeDue`. When `feeDue` changes the next sweep
supersedes it and makes a new one; a payment on a superseded/voided/settled fee is `linkReview` +
`chargeNeedsAdmin` (admin "Charge issues"), never a settlement.

## Contract: scenario 1, BAMA -> Make (create link)
`POST {MAKE_CREATE_LINK_URL}`, headers `Content-Type: application/json`, `X-Bama-Secret: {MAKE_SHARED_SECRET}`
```json
{
  "requestId": "uuid of this creation attempt",
  "feeKey": "<projectId>_<proId>",
  "projectId": "...", "proId": "...",
  "amount": 120, "currency": "ILS",
  "description": "עמלת תיווך – <project title>",
  "payer": { "fullName": "...", "phone": "0501234567", "email": "optional" },
  "customField1": "<feeKey>"
}
```
Make runs Grow "Create Payment Link" (sending mode none, sum = amount, payer from `payer`, Custom Field 1 =
`customField1`, notifyUrl = scenario 2 webhook, successUrl = `https://<hosting>/pay-return`) and answers the
same request ("Webhook response", within 25s), status 200:
```json
{ "ok": true, "url": "https://...", "paymentLinkProcessId": "<string or number>" }
```
Failure: any non-200, or `{ "ok": false, "error": "..." }`. BAMA retries on the next hourly run; after 5
failures it flags `link_create_failed`. Treat `requestId` as an idempotency key if you add a data store.

## Contract: scenario 2, Make -> BAMA (paid notifications only)
`POST https://europe-west1-<project>.cloudfunctions.net/paymentLinkConfirm`, headers
`Content-Type: application/json`, `X-Bama-Secret: {MAKE_SHARED_SECRET}`
```json
{
  "paymentLinkProcessId": "123",
  "feeKey": "<projectId>_<proId>",
  "amount": 120,
  "transactionId": "456",
  "asmachta": "789",
  "status": "paid"
}
```
`amount` is a NUMBER (parse Grow's string `data.sum`). `feeKey` may be `null`/`""`/omitted. Forward only
`data.statusCode == "2"`, after Approve Transaction and Get Payment Link Info.
Replies: `200 {"ok":true,"result":"settled"|"duplicate"|"needs_review"|"ignored"}` (treat any 200 as done),
`401` bad/missing secret, `400` malformed, `429` rate limited, `500` transient (safe to retry).
Idempotent per `transactionId`.

## Deploy checklist (not done)
1. Create both secrets (`firebase functions:secrets:set`). Without them `feeChargeCron` and `paymentLinkConfirm` fail to deploy.
2. Build the two Make scenarios to the contract above; set Grow's receipts in the Grow dashboard.
3. Deploy functions, rules, indexes (`paidBy` override) and Hosting (`npm run legal:deploy`, for `/pay-return`).
4. Remove the `paymentLinkConfirm` allowlist entry; record the deploy in `docs/deploy-ledger.json`.
5. `scripts/probe-payment-link-endpoint-prod.mjs --prod --url ...`
6. Set `paymentProvider: grow_link` with a tester uid; sandbox card 4580458045804580 (credit card only; Bit/Apple Pay/Google Pay are real money).
7. The return hop (`/pay-return` -> `bama://settings/payment`) can only be verified on a TestFlight/production build, not Expo Go.
