# BAMA — Pricing & Project Lifecycle: Settled Decisions

Status: decided, ready to build. Supersedes earlier drafts where they conflict.
Related: `bama-pricing-enforcement-spec.md`, `bama-payments-accountant-brief.md`

---

## 1. Core model

BAMA is a broker/facilitator. Money for services flows **directly client ↔ pro**. BAMA never holds funds.

BAMA charges the **professional only**, a platform fee of **3% of project value**, triggered **only on client-confirmed completion**.

Collection is not done by invoicing or chasing. It is done by **gating**: an unpaid completed project keeps occupying a slot, and the review stays unpublished. The pro pays in order to get back to work and to get their review.

All rates, caps, and grace periods are **config values**. Never hardcoded.

---

## 2. Two modes

### 2.1 Non-subscriber

| Rule | Value |
|---|---|
| Fee | 3% of project value |
| Fee trigger | Client-confirmed completion |
| Open slots | 2 |
| Blocked when | Trying to open a 3rd project |
| Unblock by | Paying the fee on one existing project |

The first two projects are effectively free — there is **no separate welcome-credit field**. The model's own shape is the welcome gift: a new pro can run two projects without paying anything. The fee only becomes unavoidable when they want a third slot, or when they want their review published.

### 2.2 Subscriber

| Rule | Value |
|---|---|
| Price | ₪80 / month, ₪800 / year |
| Label in UI | Launch pricing (`מחיר השקה`) |
| Free projects | 10 per **calendar month** |
| Reset | 1st of each calendar month |
| Annual plan | Also 10 per month — NOT 120 per year |
| Over the limit | **Hard stop.** Cannot open project 11. Must wait for reset |
| Slot cap | Not applicable — subscribers have no 2-slot gate |

Future option (not now): a higher-priced 20-project plan.

Subscriber and non-subscriber are two clean modes. No mixed states.

---

## 3. Fee status is locked at creation

**Rule:** a project's fee status is determined **when the project group chat is created**, based on subscription status at that moment, and is **immutable thereafter**.

Consequences, all intended:

- Subscriber opens a project, then cancels their subscription → project stays free.
- Non-subscriber opens a project, then subscribes → that project still owes 3%.
- The pro can never be surprised by a charge appearing later.

The project card must show fee status **from day one**, e.g. `כלול במנוי` or `עמלה: ₪90`. It never changes.

Known, accepted exploit: subscribe for one month, open 10 projects, cancel. Self-limiting (requires 10 real client hires in one month, which the pro does not control). Watch for the subscribe → burst → cancel pattern and handle manually. Do not build a rule for it yet.

---

## 4. Project lifecycle

1. **Pro is hired** → project group chat created → slot taken → fee status locked and displayed.
2. **Work happens** → client pays pro directly, off-platform. BAMA is not involved.
3. **Completion confirmed** → fee becomes due. Slot stays occupied.
4. **Pro pays** → invoice issued → slot frees → review publishes.

### 4.1 Who triggers completion

- **Pro requests it** (they want the review) → client gets confirm/dispute prompt.
- **Client marks it done** (they want to leave a review).
- **The app asks.** Projects carry an expected end date from hiring. A few days after it passes, prompt the client: `האם הפרויקט הסתיים?`

The third path is the important one — it is the only path that does not depend on the pro raising their hand.

### 4.2 Timeouts

| Situation | Behavior |
|---|---|
| Pro requested, client silent | Auto-confirm after 7 days. Reminders at day 3 and 6 |
| Nobody responds at all | After ~45 days past end date: archive as unconfirmed. No fee, slot frees, no reviews |
| Client disputes / says it didn't happen | Admin review. **Slot stays occupied throughout** |

### 4.3 Cancellation

Either side cancels before completion → **no fee, slot frees immediately**. A pro must never pay for work that earned them nothing.

### 4.4 Anti-abuse

- Silence costs the pro a slot. Avoiding confirmation to dodge the fee burns capacity for 45 days.
- A pro cannot accept new work while holding an unconfirmed project past its end date, until they respond to the prompt.
- Track unconfirmed-to-confirmed ratio per pro as a moderation signal.
- Disputes must **not** free the slot, or disputing becomes the cheapest way to keep working without paying.

---

## 5. Early payment

A non-subscriber may pay the fee on a project **before it completes**, to free a slot. Entry point: project detail screen, next to the "update price" button.

| Rule | Behavior |
|---|---|
| Amount | Locked at the project price on the payment date |
| Price rises later | Delta settled at completion (top-up only) |
| Price falls later | No refund |
| Project later cancelled | Refund is **discretionary and manual** — pro contacts support, admin decides |

Refunds must be described in the תקנון as discretionary, **not as a right**. Log every one — if the volume becomes weekly rather than monthly, revisit and automate.

---

## 6. Reviews

The review lock is the second collection lever, and it is the one that reaches pros who are not currently trying to take new work.

| Rule | Behavior |
|---|---|
| When written | Client writes it when marking the project complete |
| When published | After the project is complete AND the chat is closed AND (non-subscriber) the fee is paid |
| Visible to pro before publish | **Nothing.** No stars, no text, no preview. Only `ממתין לפרסום` |
| Effect on rating | **None** until published |
| Never paid | Publishes anyway after **60 days** |
| Client-facing wording | `הביקורת תפורסם עם סגירת הפרויקט` — no mention that the pro owes money |
| Pro's review of the client | Publishes immediately, not gated |

**Why the pro must see nothing:** if they could see the rating, a 5-star review would make them pay and a 2-star review would make them hide it forever. Bad reviews would be the ones that stay buried, corrupting every rating on the platform. Blind payment is the only version where the incentive points the right way.

**Why 60 days:** the client wrote it in good faith. Permanently suppressing reviews on unpaid projects gives determined pros a way to erase bad feedback.

Note: a brand-new pro is not blocked after project one (they still have a free slot), but their first review **is** held. So the first fee request arrives at project one either way — at the moment goodwill is highest. This is deliberate.

---

## 7. UI requirements

**Chat list card** — role-aware. Same conversation, two renders:
- Pro: `הפרויקט הושלם — לחץ לתשלום`
- Client: `הפרויקט הושלם — השאר ביקורת` (no mention of any fee)

**Project detail** — fee status badge from creation; pay button next to "update price".

**Subscriber counter** — visible at all times, e.g. `7/10 פרויקטים החודש`. Nobody should discover the limit by hitting it.

**Blocked state** — clear banner explaining what frees a slot.

**Subscription screen** — the 10/month limit stated up front, prices labeled as launch pricing.

All strings via i18next. No hardcoded text. RTL-safe (no hardcoded left/right).

---

## 8. Known risks, accepted

- **Non-reporting.** If nobody confirms completion, no fee is ever due. Mitigated by client-side confirmation (the client has no incentive to hide it), auto-prompts, and a fee small enough that hiding isn't worth the effort.
- **Subscriber hard stop.** A subscriber who hits 10 mid-month has no path forward — worse friction than a free user, at the moment leakage is most tempting. If this shows up in practice, the fix is an overflow option (pay 3% on project 11), not a bigger plan.
- **Subscriber self-selection.** Nobody doing 1 project/month buys ₪80. Expect subscribers to be the busiest pros — the ones who'd otherwise pay ₪300–400 in fees. Deliberate, but don't be surprised by the numbers.
- **Take-rate increases.** Raise revenue in **layers** (optional paid features), not by moving the 3%. Base-rate hikes hit everyone at once, including pros who got nothing new, and are the main cause of supply churn at marketplaces.

---

## 9. Build order

1. Data model + state machine (project fee status, subscription doc + monthly counter, slot enforcement, completion/confirmation flow, review hold). Test with a fake "mark as paid" button.
2. UI — mockups after the states exist, not before.
3. Cardcom wiring — last, and small.
