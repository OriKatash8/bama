# Noticeboard Vacancy Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide fully-booked projects from the noticeboard and prevent professionals from bidding on already-filled roles.

**Architecture:** Add a pure `getVacantSlots` helper to `useNoticeboard.ts`, use it to filter the project list in the hook, and pass vacant slots into the bid modal and card role count. No Firestore changes — `filledSlots` is already delivered by the existing real-time subscription.

**Tech Stack:** React Native, TypeScript, Expo Router, Firestore (via existing `subscribeToCollection`)

---

## File Map

| File | Change |
|---|---|
| `src/features/noticeboard/hooks/useNoticeboard.ts` | Export `getVacantSlots`; filter fully-booked projects |
| `src/features/noticeboard/hooks/__tests__/getVacantSlots.test.ts` | New — unit tests for `getVacantSlots` |
| `src/features/noticeboard/components/ProjectDetailModal.tsx` | Use `getVacantSlots` when initialising bid entries |
| `src/features/noticeboard/components/NoticeBoardCard.tsx` | Use `getVacantSlots` for role count |

---

### Task 1: Add `getVacantSlots` helper and filter projects in `useNoticeboard`

**Files:**
- Modify: `src/features/noticeboard/hooks/useNoticeboard.ts`
- Create: `src/features/noticeboard/hooks/__tests__/getVacantSlots.test.ts`

- [ ] **Step 1: Write failing tests for `getVacantSlots`**

Create `src/features/noticeboard/hooks/__tests__/getVacantSlots.test.ts`:

```ts
import { getVacantSlots } from '../useNoticeboard';
import type { ProjectRequest } from '@core/types/project';

function makeRequest(
  crewSlots: { category: string; subcategory: string; quantity: number }[],
  filledSlots: { category: string; subcategory: string; professionalId: string }[]
): ProjectRequest {
  return {
    id: 'proj1',
    clientId: 'client1',
    title: 'Test',
    description: '',
    date: '2026-07-01',
    location: 'NYC',
    status: 'open',
    createdAt: { seconds: 0, nanoseconds: 0 },
    crewSlots,
    filledSlots,
  };
}

describe('getVacantSlots', () => {
  it('returns all slots when none are filled', () => {
    const req = makeRequest(
      [{ category: 'Video', subcategory: 'DP', quantity: 2 }],
      []
    );
    expect(getVacantSlots(req)).toEqual([
      { category: 'Video', subcategory: 'DP', quantity: 2 },
    ]);
  });

  it('reduces quantity by the number of filled entries for that slot', () => {
    const req = makeRequest(
      [{ category: 'Video', subcategory: 'DP', quantity: 3 }],
      [
        { category: 'Video', subcategory: 'DP', professionalId: 'pro1' },
        { category: 'Video', subcategory: 'DP', professionalId: 'pro2' },
      ]
    );
    expect(getVacantSlots(req)).toEqual([
      { category: 'Video', subcategory: 'DP', quantity: 1 },
    ]);
  });

  it('excludes a slot when it is fully filled', () => {
    const req = makeRequest(
      [{ category: 'Video', subcategory: 'DP', quantity: 1 }],
      [{ category: 'Video', subcategory: 'DP', professionalId: 'pro1' }]
    );
    expect(getVacantSlots(req)).toEqual([]);
  });

  it('only counts filledSlots that match both category and subcategory', () => {
    const req = makeRequest(
      [
        { category: 'Video', subcategory: 'DP', quantity: 1 },
        { category: 'Audio', subcategory: 'Mixer', quantity: 1 },
      ],
      [{ category: 'Video', subcategory: 'DP', professionalId: 'pro1' }]
    );
    expect(getVacantSlots(req)).toEqual([
      { category: 'Audio', subcategory: 'Mixer', quantity: 1 },
    ]);
  });

  it('returns empty array when every slot is fully filled', () => {
    const req = makeRequest(
      [
        { category: 'Video', subcategory: 'DP', quantity: 1 },
        { category: 'Audio', subcategory: 'Mixer', quantity: 1 },
      ],
      [
        { category: 'Video', subcategory: 'DP', professionalId: 'pro1' },
        { category: 'Audio', subcategory: 'Mixer', professionalId: 'pro2' },
      ]
    );
    expect(getVacantSlots(req)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
npx jest src/features/noticeboard/hooks/__tests__/getVacantSlots.test.ts --no-coverage
```

Expected: FAIL — `getVacantSlots` is not exported from `useNoticeboard`.

- [ ] **Step 3: Implement `getVacantSlots` and update `useNoticeboard`**

Replace the entire content of `src/features/noticeboard/hooks/useNoticeboard.ts` with:

```ts
import { useState, useEffect } from 'react';
import { subscribeToCollection, where } from '@core/firebase/firestore';
import type { ProjectRequest, CrewRequestSlot } from '@core/types/project';

export function getVacantSlots(request: ProjectRequest): CrewRequestSlot[] {
  return request.crewSlots
    .map(slot => {
      const filled = request.filledSlots.filter(
        f => f.category === slot.category && f.subcategory === slot.subcategory
      ).length;
      return { ...slot, quantity: slot.quantity - filled };
    })
    .filter(slot => slot.quantity > 0);
}

export function useNoticeboard() {
  const [requests, setRequests] = useState<ProjectRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    return subscribeToCollection<ProjectRequest>(
      'projects',
      (data) => {
        const sorted = [...data].sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
        setRequests(sorted.filter(r => getVacantSlots(r).length > 0));
        setIsLoading(false);
      },
      where('status', '==', 'open')
    );
  }, []);

  return { requests, isLoading };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```
npx jest src/features/noticeboard/hooks/__tests__/getVacantSlots.test.ts --no-coverage
```

Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/noticeboard/hooks/useNoticeboard.ts src/features/noticeboard/hooks/__tests__/getVacantSlots.test.ts
git commit -m "feat: add getVacantSlots helper and filter fully-booked projects from noticeboard"
```

---

### Task 2: Use vacant slots in the bid modal

**Files:**
- Modify: `src/features/noticeboard/components/ProjectDetailModal.tsx`

- [ ] **Step 1: Import `getVacantSlots` and update `openBid`**

In `src/features/noticeboard/components/ProjectDetailModal.tsx`, add the import at the top:

```ts
import { getVacantSlots } from '@features/noticeboard/hooks/useNoticeboard';
```

Then replace the `openBid` function (currently lines 33–38):

```ts
function openBid() {
  setBids(
    getVacantSlots(request!).map((s) => ({ ...s, selected: false, price: '' }))
  );
  setView('bid');
}
```

The `quantity` on each bid entry will now reflect remaining vacancies (e.g. 1 instead of 3 when 2 of 3 are filled). The existing bid row label `{b.category} · {b.quantity} needed` automatically shows the correct remaining count with no further changes needed.

- [ ] **Step 2: Run the full test suite to check for regressions**

```
npx jest --no-coverage
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/features/noticeboard/components/ProjectDetailModal.tsx
git commit -m "feat: bid modal shows only vacant slots"
```

---

### Task 3: Show vacant role count on the notice board card

**Files:**
- Modify: `src/features/noticeboard/components/NoticeBoardCard.tsx`

- [ ] **Step 1: Import `getVacantSlots` and update the role count**

In `src/features/noticeboard/components/NoticeBoardCard.tsx`, add the import at the top:

```ts
import { getVacantSlots } from '@features/noticeboard/hooks/useNoticeboard';
```

Then replace line 13 (the `roleCount` calculation):

```ts
const roleCount = getVacantSlots(request).reduce((sum, s) => sum + s.quantity, 0);
```

The rest of the card is unchanged — `roleCount` is already used in the subtitle text `{roleCount} role{roleCount === 1 ? '' : 's'}`.

- [ ] **Step 2: Run the full test suite**

```
npx jest --no-coverage
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/features/noticeboard/components/NoticeBoardCard.tsx
git commit -m "feat: notice board card shows vacant role count only"
```
