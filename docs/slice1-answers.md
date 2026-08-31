# Slice 1 — Investigation Answers

Answers to four questions asked before continuing the pricing/lifecycle build.
State as of commit `9e7156d` (lifecycle functions committed but unwired and untypechecked).

---

## 1. `filledSlots` write sites

### Command

The literal command fails under zsh — `(eval):1: no matches found: --include=*.ts`.
The globs need quoting:

```
grep -rn "filledSlots" src/ --include="*.ts" --include="*.tsx"
```

### Raw output

```
src/core/types/project.ts:97:  filledSlots: FilledSlot[];
src/core/types/project.ts:136:  /** Flat list of hired pro uids (mirrors filledSlots' professionalIds) so the
src/app/(professional)/(tabs)/dashboard/index.tsx:214:            if (!(project.filledSlots ?? []).some((s) => s.professionalId === currentUserId)) {
src/app/(client)/(tabs)/home/index.tsx:93:  const [filledSlots, setFilledSlots] = useState<FilledSlot[]>([]);
src/app/(client)/(tabs)/home/index.tsx:96:    for (const f of filledSlots) m[f.category] = (m[f.category] ?? 0) + 1;
src/app/(client)/(tabs)/home/index.tsx:98:  }, [filledSlots]);
src/app/(client)/(tabs)/home/index.tsx:153:        setFilledSlots(project.filledSlots ?? []);
src/features/offers/hooks/useAcceptBundleOffer.ts:79:      // slots don't both claim the same specialized slot), then add them to filledSlots.
src/features/offers/hooks/useAcceptBundleOffer.ts:83:          getDocument<{ crewSlots?: CrewRequestSlot[]; filledSlots?: FilledSlot[] }>(`projects/${bundle.projectId}`),
src/features/offers/hooks/useAcceptBundleOffer.ts:89:        const running: FilledSlot[] = [...(proj?.filledSlots ?? [])];
src/features/offers/hooks/useAcceptBundleOffer.ts:109:        filledSlots: arrayUnion(...filledEntries),
src/features/offers/hooks/useAcceptOffer.ts:14:    getDocument<{ crewSlots?: CrewRequestSlot[]; filledSlots?: FilledSlot[] }>(`projects/${projectId}`),
src/features/offers/hooks/useAcceptOffer.ts:20:  return assignFilledCapability(proj?.crewSlots ?? [], proj?.filledSlots ?? [], roleSkills, category);
src/features/offers/hooks/useAcceptOffer.ts:78:      // Step 3: add professional to project filledSlots (with the capability slot they fill)
src/features/offers/hooks/useAcceptOffer.ts:94:          filledSlots: arrayUnion(filled) as unknown,
src/features/offers/hooks/useAcceptOffer.ts:96:        console.log('[useAcceptOffer] step 3 ok — filledSlots updated on project', offer.projectId);
src/features/offers/hooks/useAcceptOffer.ts:98:        console.error('[useAcceptOffer] step 3 FAILED (filledSlots arrayUnion)', e);
src/app/(client)/(tabs)/chats/project-details.tsx:227:        ...new Set((projectData.filledSlots ?? []).map((s) => s.professionalId)),
src/app/(client)/(tabs)/chats/project-details.tsx:328:    console.log('[ReviewFlow] project.reviewsCompleted:', project.reviewsCompleted, 'filledSlots:', project.filledSlots?.length ?? 0);
src/app/(client)/(tabs)/chats/project-details.tsx:348:    const uniqueProfIds = [...new Set((project.filledSlots ?? []).map((s) => s.professionalId))];
src/app/(client)/(tabs)/chats/project-details.tsx:549:        project.filledSlots,
src/app/(client)/(tabs)/chats/project-details.tsx:743:  const filledSlots: FilledSlot[] = project.filledSlots ?? [];
src/app/(client)/(tabs)/chats/project-details.tsx:746:    filledSlots.reduce<Record<string, { professionalId: string; roles: string[] }>>(
src/app/(client)/(tabs)/chats/project-details.tsx:801:  const isTeamMember = (project.filledSlots ?? []).some((s) => s.professionalId === currentUserId);
src/app/(client)/(tabs)/chats/project-details.tsx:819:    ...filledSlots
src/app/(client)/(tabs)/chats/project-details.tsx:922:          const uniqueProfCount = new Set(filledSlots.map(s => s.professionalId)).size;
src/app/(client)/(tabs)/chats/project-details.tsx:953:          filledSlots.reduce<Record<string, { professionalId: string; roles: string[] }>>(
src/app/(client)/(tabs)/chats/project-details.tsx:999:        {filledSlots.length === 0 && !clientUser && (
src/features/offers/hooks/__tests__/useAcceptOffer.test.ts:41:  it('accept: sets accepted offer status and updates project filledSlots', async () => {
src/features/offers/hooks/__tests__/useAcceptOffer.test.ts:51:        filledSlots: expect.anything(),
src/features/chat/services/removalService.ts:53:  // Remove all their filledSlots entries from the project
src/features/chat/services/removalService.ts:55:  batch.update(doc(db, 'projects', projectId), { filledSlots: updatedSlots });
src/features/projects/components/DirectProjectSheet.tsx:151:        filledSlots: [],
src/features/crew/components/ProjectRequestCard.tsx:81:  const filledCount = request.filledSlots?.length ?? 0;
src/features/crew/components/ProjectRequestCard.tsx:234:              const filled = request.filledSlots?.find(
src/features/crew/hooks/__tests__/useProjectRequests.test.ts:50:      location: '', status: 'open' as const, filledSlots: [],
src/features/crew/hooks/__tests__/useProjectRequests.test.ts:55:      location: '', status: 'open' as const, filledSlots: [],
src/features/crew/hooks/__tests__/useProjectRequests.test.ts:67:  it('submit calls addDocument with the correct shape (no budget, has filledSlots)', async () => {
src/features/crew/hooks/__tests__/useProjectRequests.test.ts:85:        filledSlots: [],
src/features/noticeboard/hooks/__tests__/getVacantSlots.test.ts:12:  filledSlots: { category: string; professionalId: string; requiredCapability?: string }[]
src/features/noticeboard/hooks/__tests__/getVacantSlots.test.ts:24:    filledSlots,
src/features/noticeboard/hooks/__tests__/getVacantSlots.test.ts:79:  const proj = (crewSlots: unknown[], filledSlots: unknown[] = []): ProjectRequest =>
src/features/noticeboard/hooks/__tests__/getVacantSlots.test.ts:80:    ({ ...makeRequest([], []), crewSlots, filledSlots } as unknown as ProjectRequest);
src/features/crew/hooks/useProjectRequests.ts:47:        filledSlots: [],
src/features/crew/data/categories.ts:141: * is persisted as these legacy strings (on projects, offers, filledSlots, CATEGORY_QUESTION_MAP),
src/features/noticeboard/matching.ts:36:  filledSlots?: FilledSlot[];
src/features/noticeboard/matching.ts:40:      const filled = (request.filledSlots ?? []).filter((f) => sameSlotKind(f, slot)).length;
src/features/noticeboard/matching.ts:79:  filledSlots: FilledSlot[],
src/features/noticeboard/matching.ts:83:  const vacant = getVacantSlots({ crewSlots, filledSlots })
src/features/reviews/components/ReviewFlowGate.tsx:40:        const filledSlots = project.filledSlots ?? [];
src/features/reviews/components/ReviewFlowGate.tsx:41:        const uniqueProfIds = [...new Set(filledSlots.map((s) => s.professionalId))];
src/features/reviews/components/ReviewFlowGate.tsx:55:          const roles = filledSlots
```

### Write sites — 5 total, 3 break

| file:line | kind of write | breaks under client-write block? |
|---|---|---|
| `src/features/offers/hooks/useAcceptOffer.ts:94` | `updateDocument` + `arrayUnion` on `projects/{id}` | **Breaks** |
| `src/features/offers/hooks/useAcceptBundleOffer.ts:109` | `batch.update` + `arrayUnion(...N)` on `projects/{id}` | **Breaks** |
| `src/features/chat/services/removalService.ts:55` | `batch.update` with a filtered array on `projects/{id}` | **Breaks** |
| `src/features/projects/components/DirectProjectSheet.tsx:151` | `addDocument('projects', …)` with `filledSlots: []` | Safe (create) |
| `src/features/crew/hooks/useProjectRequests.ts:47` | `addDocument('projects', …)` with `filledSlots: []` | Safe (create) |

Every other hit is a read.

**Detail on the three that break:**

- **`useAcceptOffer.ts:94`** — this is step 3 of a 4-step non-atomic sequence, and
  it `throw`s on failure. Steps 1–2 (offer → `accepted`) have already committed and
  step 4 (chat creation) never runs, so a rules denial leaves a half-accepted offer
  with no project slot and no chat.

- **`useAcceptBundleOffer.ts:109`** — larger blast radius. It sits inside the same
  `writeBatch` as the bundle accept, the constituent offer accepts, and the
  competing-offer rejections. Batches are atomic, so a denial on this single line
  rolls back **the entire bundle accept**.

- **`removalService.ts:55`** — also inside a batch, alongside the chat `members`
  `arrayRemove`, the offers → `removed`, and the `removalRequests` status update;
  all roll back together. Note this is a slot-*freeing* path, not a slot-taking one,
  so it needs its own server-side callable — the hire callable does not cover it.

**Create-site caveat:** both create sites are safe only if the rule guards `update`
alone. A `create` rule that rejects `filledSlots` in `request.resource.data` breaks
both.

**Collateral:** `src/features/offers/hooks/__tests__/useAcceptOffer.test.ts:41,51`
asserts on the `filledSlots` update and will fail once the hook is rewired to a callable.

---

## 2. Bundle-accept path

Yes — fully separate from the single-offer path. It is
`src/features/offers/hooks/useAcceptBundleOffer.ts`, function `acceptBundle(bundle)`.
It shares nothing with `useAcceptOffer` except the `assignFilledCapability` helper
(`src/features/noticeboard/matching.ts`) and the chat service.

**Inside one `writeBatch`:**

- `bundleOffers/{bundle.id}` → `status: 'accepted'`
- `priceOffers/{each of bundle.offerIds}` → `status: 'accepted'`
- competing `priceOffers` (same project + category, `pending`, not in the bundle) → `status: 'rejected'`
- competing `bundleOffers` (same project, `pending`, sharing any category) → `status: 'rejected'`
- `projects/{projectId}` → `filledSlots: arrayUnion(...filledEntries)` — **N entries at once**, one per bundle slot

**Outside the batch (non-atomic, failures only logged):**

- `createProjectGroup(...)` then `updateDocument('projects/{id}', { chatId })`, or
- `addMemberToGroup(chatId, professionalId)` if the project already has a `chatId`

**Two implications for the fee model:**

1. It adds **multiple** filled slots in one shot from a single pro, so a unified
   `hireProfessional` callable must accept an array of slots, not one.
2. Chat creation — which per §3 of `bama-pricing-model-decisions.md` is the moment
   fee status gets locked — sits outside the atomic boundary and swallows its own
   errors in a `try/catch`. A project can end up with filled slots and no chat, and
   therefore no locked fee status.

---

## 3. Firebase emulator

**Yes, configured.**

`firebase.json` declares: auth `9099`, firestore `8080`, storage `9199`,
functions `5001`, database `9000`, UI `4000`.
`.firebaserc` default project is `bama-dev` (also `bama-staging`, `bama-prod`).

**Start command:**

```
firebase emulators:start
```

`firebase-tools` v15.23.0 is installed globally at `/usr/local/bin/firebase` — it is
*not* a devDependency, and there is no npm script for it. `package.json` scripts are
only `start`, `android`, `ios`, `web`, `lint`, `test`.

**Two gaps:**

- No `connectFirestoreEmulator` / `connectAuthEmulator` / `connectFunctionsEmulator`
  anywhere in `src/`, so the app never points at the emulators.
- `@firebase/rules-unit-testing` is not installed, so there is currently no way to
  write automated firestore.rules tests.

---

## 4. `functions/src/lifecycle/reviews.ts`

A single `onDocumentCreated('reviews/{reviewId}')` trigger, ~26 lines, exported as
`onReviewCreate`. On every new review document:

1. If `published` is already a boolean → **return without writing.** The client's
   value is trusted as-is.
2. Otherwise compute `hold`, which is `true` only when
   `(review.kind ?? 'client_to_pro') === 'client_to_pro'`
   **and** `projects/{review.projectId}.feeStatus === 'owed'`.
3. Merge-write back either `{ published: false }` (held) or
   `{ published: true, visibleAt: serverTimestamp() }`.

### Confirmation

Both behaviours you asked about are correct, with `kind` defaulting to
`client_to_pro` when the field is absent:

- **`pro_to_client` → publishes immediately.** The `kind` check short-circuits before
  the project lookup, so it never reads `feeStatus` at all.
- **`client_to_pro` on an `owed` project → held**, `published: false`, no `visibleAt`.

### Four caveats before wiring this up

1. **The trust-the-client escape hatch is wide open.** `firestore.rules:233-237`
   allows any authenticated user to create a review whose `reviewerId` matches their
   uid, with no field validation at all:

   ```
   match /reviews/{reviewId} {
     allow read: if isAuth();
     allow create: if isAuth() && request.resource.data.reviewerId == request.auth.uid;
     allow update, delete: if false;  // reviews are immutable
   }
   ```

   A pro who writes their own review doc with `published: true` bypasses the hold
   entirely, because step 1 returns early without checking. The rule must reject
   `published` in `request.resource.data` (or force it to `false`) for this function
   to actually be a backstop.

2. **No writer sets `published` today.** `src/features/reviews/components/ReviewFlow.tsx:113`
   writes `projectId, professionalId, reviewerId, authorId, authorName, rating, text,
   body, createdAt` — no `published`, no `kind`. So every review created today falls
   through to the server default, which is the intended path.

3. **There is no `pro_to_client` write site anywhere in `src/`.** That branch is
   untested by construction.

4. **Nothing reads `published`.** All rating queries use
   `queryByField<Review>('reviews', 'professionalId', …)` with no `published` filter:
   `src/features/profile/hooks/useProfile.ts:44`,
   `src/features/crew/hooks/useSearchProfessionals.ts:44`,
   `src/features/crew/hooks/useUnifiedSearch.ts:51`, and both
   `browse/profile/[userId].tsx:83`. A held review still counts toward the displayed
   rating, which defeats the lever described in §6 of the decisions doc.

### Deployment status

`functions/src/index.ts` contains 7 `export *` lines (`./auth`, `./bookings`,
`./notifications`, `./claude`, `./video`, `./moderation`, `./system`) — none of them
`./lifecycle/*`. Nothing in `functions/src/lifecycle/` currently deploys.
