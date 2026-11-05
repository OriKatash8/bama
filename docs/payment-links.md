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
`POST {MAKE_CREATE_LINK_URL}`, headers `Content-Type: application/json`, `x-make-apikey: {MAKE_SHARED_SECRET}`
and `X-Bama-Secret: {MAKE_SHARED_SECRET}` (same value). Turn on API-key auth in Make's custom webhook
(header `x-make-apikey`): Make then rejects a call without it, so the scenario needs no filter.
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
Make runs Grow "Create Payment Link" (Payment Type = Payments, Custom Payments, Payments Number = 1;
sending mode none, sum = amount, payer from `payer`, Custom Field 1 =
`customField1`, notifyUrl = scenario 2 webhook, successUrl = `https://<hosting>/pay-return`) and answers the
same request ("Webhook response", within 25s), status 200:
```json
{ "ok": true, "url": "https://...", "paymentLinkProcessId": "<string or number>" }
```
VAT Exempt was rejected by the shared sandbox merchant; retest on the live merchant.
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
Idempotent per `transactionId`. Confirmed with a real sandbox payment: Grow re-sends the same
`transactionId` about every 5 minutes (seen 3 times) until Make approves the transaction, so Make may
forward the same payment more than once; the second and later get `duplicate`.

Grow's notification, as seen in the sandbox: `data.statusCode` "2", `data.sum` a string ("6"),
`data.transactionId`, `data.transactionToken` (for Approve Transaction), `data.paymentLinkProcessId`,
`data.asmachta`, and `data.customFields.cField1` (our feeKey, returned correctly). One variant also carries
`productData` and `invoice_*` fields; the core fields are the same. Map `cField1` to `feeKey`.

## Deploy runbook (NOT yet run; every step needs its own go)

Deploy base is `main`: this branch contains `origin/main` (merge `baef1d15`), so it has the live Round A/B
rentals. Never deploy from a branch that lacks `src/features/rentals/`, `functions/src/rentals/` and
`functions/src/payments/charge.ts`. Use a clean worktree of the exact commit, `--non-interactive`, no `--force`,
functions by name only.

**Pre-flight (read-only):** `node scripts/check-deploy-drift.mjs --project bama-af0a0` shows no drift;
`node scripts/deploy-rules.mjs --dry` shows ONLY the added `paymentLinks` and `paymentLinkIssues` matches.

1. Secrets, created by the operator (values never pass through Claude or logs):
   `firebase functions:secrets:set MAKE_SHARED_SECRET --project bama-af0a0` and
   `firebase functions:secrets:set MAKE_CREATE_LINK_URL --project bama-af0a0` (paste at the hidden prompt, no pipe).
   Same value as `x-make-apikey` (scenario 1) and `X-Bama-Secret` (scenario 2). Check existence without printing:
   `gcloud secrets list --project bama-af0a0 --filter="name~MAKE_"` (never `secrets:access`).
2. `npm run deploy:rules` (read the diff, type `yes`).
3. `firebase deploy --only firestore:indexes --project bama-af0a0 --non-interactive` (adds the `fees.paidBy` override; wait for READY).
4. Functions, one command:
   `firebase deploy --only functions:paymentLinkConfirm,functions:adminListPaymentLinks,functions:feeChargeCron,functions:adminListChargeIssues,functions:adminAcknowledgeChargeIssue,functions:getMyPaymentMethod,functions:lifecycleCron,functions:onNotificationCreate --project bama-af0a0 --non-interactive`
   - `lifecycleCron` MUST be in it and deployed before the provider is switched: an older deployment reads `grow_link`
     as `none` and turns the legacy stub sweep on for everyone.
   - `onNotificationCreate` carries `fee_link` in its essential list (so muting cannot hide the pay push).
   - `markFeePaid` and `paymentWebhook` are deliberately not redeployed.
5. `npm run legal:deploy` (publishes `/pay-return`); expect `https://bama-af0a0.web.app/pay-return` to return 200.
6. Verify and record: drift check (functions 81 -> 83), `--record-functions --only <the 8 names>`, rows in
   `docs/production-deploys.md`, remove the `paymentLinkConfirm` entry from `scripts/deploy-drift-allowlist.json`
   (`paymentWebhook` stays), `scripts/probe-payment-link-endpoint-prod.mjs --prod --url ...`,
   `probe-payment-lockdown-prod.mjs --prod`, `probe-rental-rules.mjs --prod`.
7. Provider stays `none` until here (parity). Then, dry run first:
   `node scripts/admin-set-payment-link-config.mjs --prod --provider grow_link --audience testers --testers <uid>`
   then the same line with `--apply`. Find the uid in Firebase Console > Authentication > Users ("User UID").
8. End-to-end (sandbox card 4580458045804580, credit card only; Make scenario 2 switched ON):
   `node scripts/seed-payment-link-test.mjs --prod --uid <uid>` (dry run), then `--apply`. No phone on the account first:
   expect `needs_phone` and one push. Add a mobile (+9725...) in Settings > Phone. Run the sweep now instead of waiting
   an hour: `gcloud scheduler jobs run firebase-schedule-feeChargeCron-europe-west1 --location europe-west1 --project bama-af0a0`
   (confirm the name with `gcloud scheduler jobs list` first). Expect `awaiting_payment`, a `paymentLink`, the push, "שלם עכשיו";
   pay; expect `feePaid`, `paidBy: 'link'`, `providerRef` = Grow's transactionId, `paymentEvents/link_<tx>` processed, and the
   admin "Payment links" tab under Paid. Then `seed-payment-link-test.mjs ... --cleanup` (dry run, then `--apply`).
   Tested on web (localhost:8081 reads `.env`, which names `bama-af0a0`, unless `EXPO_PUBLIC_USE_EMULATORS=1` is set);
   the `/pay-return` -> app hop can only be verified on a TestFlight/production build.
9. The return hop, `/pay-return` -> `bama://settings/payment`, is checked later on TestFlight.

**Rollback, fastest first:** `admin-set-payment-link-config.mjs --prod --provider none --apply` (instant; links already
issued stay payable and `paymentLinkConfirm` still settles them: it ignores the provider switch on purpose); turn Make
scenario 1 off (scenario 2 stays on until nothing is outstanding); redeploy the same function names from the previous
`main` tip, config flipped to `none` FIRST (an old `lifecycleCron` + `grow_link` re-enables the stub sweep); rules, index
and hosting are additive/inert and can stay. A fee left `awaiting_payment` is ignored by old code and can be settled by
hand with `markFeePaid`.
