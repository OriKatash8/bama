# Notice Board Professional Category Filtering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Filter the professional notice board so each professional only sees projects that need at least one role category matching their skill set.

**Architecture:** Add a pure `filterByProfessionalCategories` function to `useNoticeboard.ts` and update its signature to accept the professional's categories. The dashboard screen composes `useProfile` and `useNoticeboard`, derives unique categories from the profile, and combines both loading states — no JSX changes needed.

**Tech Stack:** React Native / Expo, TypeScript, Firebase Firestore, Jest

## Global Constraints

- Filtering is client-side — no Firestore schema or index changes.
- Match on `category` string only (not subcategory).
- OR logic: professional sees a project if they match any one of its required categories.
- Empty categories array → return empty notices array (no notices shown).
- Follow existing patterns: pure functions exported alongside hook, tests in `__tests__/` sibling folder, `jest.mock` at top of test file before imports.

---

### Task 1: Add `filterByProfessionalCategories` and update `useNoticeboard`

**Files:**
- Modify: `src/features/noticeboard/hooks/useNoticeboard.ts`
- Test: `src/features/noticeboard/hooks/__tests__/getVacantSlots.test.ts`

**Interfaces:**
- Produces:
  - `filterByProfessionalCategories(requests: ProjectRequest[], categories: string[]): ProjectRequest[]` — exported pure function
  - `useNoticeboard(professionalCategories: string[]): { requests: ProjectRequest[]; isLoading: boolean }` — updated hook signature

- [ ] **Step 1: Write the failing tests**

Open `src/features/noticeboard/hooks/__tests__/getVacantSlots.test.ts`. Add this block after the existing `describe('getVacantSlots', ...)` block (keep all existing tests unchanged):

```ts
import { getVacantSlots, filterByProfessionalCategories } from '../useNoticeboard';
```

Replace the existing import line (line 6):
```ts
import { getVacantSlots } from '../useNoticeboard';
```
with:
```ts
import { getVacantSlots, filterByProfessionalCategories } from '../useNoticeboard';
```

Then append this `describe` block at the end of the file:

```ts
describe('filterByProfessionalCategories', () => {
  function makeProject(categories: string[]): ProjectRequest {
    return makeRequest(
      categories.map(cat => ({ category: cat, subcategory: 'Any', quantity: 1 })),
      []
    );
  }

  it('returns empty array when categories is empty', () => {
    const projects = [makeProject(['Video Editor'])];
    expect(filterByProfessionalCategories(projects, [])).toEqual([]);
  });

  it('shows project when professional matches the only required category', () => {
    const projects = [makeProject(['Video Editor'])];
    expect(filterByProfessionalCategories(projects, ['Video Editor'])).toEqual(projects);
  });

  it('hides project when professional does not match any required category', () => {
    const projects = [makeProject(['Photographer'])];
    expect(filterByProfessionalCategories(projects, ['Video Editor'])).toEqual([]);
  });

  it('shows project when professional matches any one of multiple required categories', () => {
    const projects = [makeProject(['Photographer', 'Video Editor'])];
    expect(filterByProfessionalCategories(projects, ['Video Editor'])).toEqual(projects);
  });

  it('hides project when professional matches none of multiple required categories', () => {
    const projects = [makeProject(['Photographer', 'Director'])];
    expect(filterByProfessionalCategories(projects, ['Video Editor'])).toEqual([]);
  });

  it('hides project whose only matching category slot is already fully booked', () => {
    const proj = makeRequest(
      [{ category: 'Video Editor', subcategory: 'Music', quantity: 1 }],
      [{ category: 'Video Editor', subcategory: 'Music', professionalId: 'pro1' }]
    );
    expect(filterByProfessionalCategories([proj], ['Video Editor'])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest src/features/noticeboard/hooks/__tests__/getVacantSlots.test.ts --no-coverage
```

Expected: the new `filterByProfessionalCategories` block fails with `filterByProfessionalCategories is not a function` (or similar). The existing `getVacantSlots` tests still pass.

- [ ] **Step 3: Implement `filterByProfessionalCategories` and update `useNoticeboard`**

Replace the entire contents of `src/features/noticeboard/hooks/useNoticeboard.ts` with:

```ts
import { useState, useEffect } from 'react';
import { subscribeToCollection, where } from '@core/firebase/firestore';
import type { ProjectRequest, CrewRequestSlot } from '@core/types/project';

export function getVacantSlots(request: ProjectRequest): CrewRequestSlot[] {
  return request.crewSlots
    .map(slot => {
      const filled = (request.filledSlots ?? []).filter(
        f => f.category === slot.category && f.subcategory === slot.subcategory
      ).length;
      return { ...slot, quantity: slot.quantity - filled };
    })
    .filter(slot => slot.quantity > 0);
}

export function filterByProfessionalCategories(
  requests: ProjectRequest[],
  categories: string[]
): ProjectRequest[] {
  if (categories.length === 0) return [];
  return requests.filter(r =>
    getVacantSlots(r).some(slot => categories.includes(slot.category))
  );
}

export function useNoticeboard(professionalCategories: string[]) {
  const [requests, setRequests] = useState<ProjectRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    return subscribeToCollection<ProjectRequest>(
      'projects',
      (data) => {
        const sorted = [...data].sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
        const vacant = sorted.filter(r => getVacantSlots(r).length > 0);
        setRequests(filterByProfessionalCategories(vacant, professionalCategories));
        setIsLoading(false);
      },
      where('status', '==', 'open')
    );
  }, [professionalCategories]);

  return { requests, isLoading };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx jest src/features/noticeboard/hooks/__tests__/getVacantSlots.test.ts --no-coverage
```

Expected: all tests pass, including both `getVacantSlots` and `filterByProfessionalCategories` blocks.

- [ ] **Step 5: Commit**

```bash
git add src/features/noticeboard/hooks/useNoticeboard.ts src/features/noticeboard/hooks/__tests__/getVacantSlots.test.ts
git commit -m "feat: add filterByProfessionalCategories to useNoticeboard"
```

---

### Task 2: Update `DashboardScreen` to pass professional categories

**Files:**
- Modify: `src/app/(professional)/(tabs)/dashboard/index.tsx`

**Interfaces:**
- Consumes:
  - `useProfile(): { profile: ProfessionalProfile | null; isLoading: boolean }` — from `@features/profile/hooks/useProfile`
  - `useNoticeboard(professionalCategories: string[]): { requests: ProjectRequest[]; isLoading: boolean }` — updated signature from Task 1
- Produces: nothing (leaf screen component)

- [ ] **Step 1: Update the dashboard screen**

Replace the entire contents of `src/app/(professional)/(tabs)/dashboard/index.tsx` with:

```tsx
import { useState, useMemo } from 'react';
import { View, Text, Image, FlatList, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { Screen } from '@components/layout/Screen';
import { NoticeBoardCard } from '@features/noticeboard/components/NoticeBoardCard';
import { ProjectDetailModal } from '@features/noticeboard/components/ProjectDetailModal';
import { useNoticeboard } from '@features/noticeboard/hooks/useNoticeboard';
import { useProfile } from '@features/profile/hooks/useProfile';
import { useUiStore } from '@core/stores/uiStore';
import { useTheme } from '@core/hooks/useTheme';
import type { ProjectRequest } from '@core/types/project';

export default function DashboardScreen() {
  const { profile, isLoading: profileLoading } = useProfile();

  const categories = useMemo(
    () => [...new Set((profile?.skills ?? []).map(s => s.category))],
    [profile?.skills]
  );

  const { requests, isLoading: boardLoading } = useNoticeboard(categories);
  const isLoading = profileLoading || boardLoading;

  const { showToast } = useUiStore();
  const colors = useTheme();

  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<ProjectRequest | null>(null);
  const [selectedView, setSelectedView] = useState<'details' | 'bid'>('details');

  const visible = requests.filter((r) => !dismissed.has(r.id));

  function dismiss(id: string) {
    setDismissed((prev) => new Set([...prev, id]));
    if (selected?.id === id) setSelected(null);
  }

  function handleApply(request: ProjectRequest) {
    showToast('Offer submitted!', 'success');
    dismiss(request.id);
  }

  const gradientText = Platform.OS === 'web' ? ({
    background: 'linear-gradient(to right, #004aad, #cb6ce6)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  } as any) : {};

  return (
    <Screen scrollable={false}>
      <View style={styles.bamaWrap}>
        <Image source={require('../../../../../assets/images/bama-logo.png')} style={styles.bamaLogo} resizeMode="contain" />
      </View>

      <View style={styles.header}>
        <Text style={[styles.heading, { color: colors.text }, gradientText]}>Notice Board</Text>
        {!isLoading && <Text style={[styles.count, { color: colors.textMuted }]}>{visible.length} open project{visible.length === 1 ? '' : 's'}</Text>}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#cb6ce6" />
        </View>
      ) : visible.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={[styles.emptyText, { color: colors.textSec }]}>No open projects right now</Text>
          <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>Check back later for new opportunities</Text>
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <NoticeBoardCard
              request={item}
              onPress={() => { setSelectedView('details'); setSelected(item); }}
              onApply={() => { setSelectedView('details'); setSelected(item); }}
              onMakeOffer={() => { setSelectedView('bid'); setSelected(item); }}
              onDismiss={() => dismiss(item.id)}
              isApplying={false}
            />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      <ProjectDetailModal
        request={selected}
        onClose={() => setSelected(null)}
        onApply={() => selected && handleApply(selected)}
        onDismiss={() => selected && dismiss(selected.id)}
        isApplying={false}
        initialView={selectedView}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  bamaWrap: { alignItems: 'center', width: '100%', paddingTop: 16 },
  bamaLogo: { width: 1040, height: 520 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  heading: { fontSize: 24, fontWeight: '800' },
  count: { fontSize: 13, fontWeight: '500' },
  list: { paddingVertical: 8, paddingBottom: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyIcon: { fontSize: 48, marginBottom: 8 },
  emptyText: { fontSize: 17, fontWeight: '600' },
  emptySubtext: { fontSize: 14 },
});
```

- [ ] **Step 2: Run the full test suite to confirm nothing is broken**

```bash
npx jest --no-coverage
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/(professional)/(tabs)/dashboard/index.tsx
git commit -m "feat: filter notice board by professional skill categories"
```
