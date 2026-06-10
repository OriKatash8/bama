# Client Home & Crew Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the client Crew and Bookings tabs with a Home tab featuring a crew-builder flow — clients pick production roles, fill in project details, and submit a request that professionals will see on their side.

**Architecture:** Static `CREW_CATEGORIES` data drives an accordion UI. A local `useCrewBuilder` hook owns basket state; `useProjectRequests` reads/writes the Firestore `projects/` collection. Three stacked screens (Dashboard → Builder → Details) live under a single Home tab using Expo Router's Stack-inside-Tab pattern.

**Tech Stack:** React Native, Expo Router v4 (SDK 56), Firestore, TypeScript, `@testing-library/react-native`, Jest (`preset: jest-expo`)

---

## File Map

**Create:**
- `src/features/crew/data/categories.ts` — static CREW_CATEGORIES record
- `src/features/crew/hooks/useCrewBuilder.ts` — local basket state (no Firestore)
- `src/features/crew/hooks/__tests__/useCrewBuilder.test.ts`
- `src/features/crew/hooks/useProjectRequests.ts` — Firestore read/write
- `src/features/crew/hooks/__tests__/useProjectRequests.test.ts`
- `src/features/crew/components/SubCategoryRow.tsx`
- `src/features/crew/components/CategoryItem.tsx`
- `src/features/crew/components/CategoryAccordion.tsx`
- `src/features/crew/components/CrewBasket.tsx`
- `src/features/crew/components/ProjectRequestCard.tsx`
- `src/features/crew/components/ProjectDetailsForm.tsx`
- `src/app/(client)/(tabs)/home/_layout.tsx` — Stack for the Home tab
- `src/app/(client)/(tabs)/home/index.tsx` — Dashboard screen
- `src/app/(client)/(tabs)/home/builder.tsx` — Step 1: crew selection
- `src/app/(client)/(tabs)/home/details.tsx` — Step 2: project details

**Modify:**
- `src/core/types/project.ts` — add `CrewRequestSlot`, `ProjectRequest`
- `src/core/firebase/firestore.ts` — add `addDocument`, export `where`
- `src/app/(client)/(tabs)/_layout.tsx` — remove crew/bookings, add home
- `src/features/crew/hooks/index.ts` — export new hooks
- `src/features/crew/components/index.ts` — export new components

**Delete:**
- `src/app/(client)/(tabs)/crew/index.tsx`
- `src/app/(client)/(tabs)/bookings/index.tsx`

---

### Task 1: Add `CrewRequestSlot` and `ProjectRequest` types

**Files:**
- Modify: `src/core/types/project.ts`

The existing `CrewSlot` uses `MediaRole` enum and is a different concept (professional assignment). These new types are for the client's crew request (free-form category strings, quantity-based).

- [ ] **Step 1: Add types to the bottom of `src/core/types/project.ts`**

Append after the last export in the file:

```ts
export type CrewRequestSlot = {
  category: string;
  subcategory: string;
  quantity: number;
};

export type ProjectRequest = {
  id: ID;
  clientId: ID;
  crewSlots: CrewRequestSlot[];
  description: string;
  date: string;
  location: string;
  budget: number;
  status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: Timestamp;
};
```

- [ ] **Step 2: Commit**

```bash
git add src/core/types/project.ts
git commit -m "feat: add CrewRequestSlot and ProjectRequest types"
```

---

### Task 2: Add `addDocument` helper and export `where` from Firestore module

**Files:**
- Modify: `src/core/firebase/firestore.ts`

`where` is already imported (used by `queryByField`) but not exported. Features must not import from `firebase/firestore` directly.

- [ ] **Step 1: Add `addDoc` to the import at the top of `src/core/firebase/firestore.ts`**

Replace the existing import block:

```ts
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  getDocs,
  onSnapshot,
  addDoc,
  where,
  type QueryConstraint,
  type DocumentData,
} from 'firebase/firestore';
```

- [ ] **Step 2: Add `addDocument` function and export `where` at the bottom of `src/core/firebase/firestore.ts`**

Append after `queryByField`:

```ts
export async function addDocument<T extends DocumentData>(
  collectionPath: string,
  data: T
): Promise<string> {
  const ref = await addDoc(collection(db, collectionPath), data);
  return ref.id;
}

export { where };
```

- [ ] **Step 3: Commit**

```bash
git add src/core/firebase/firestore.ts
git commit -m "feat: add addDocument helper and export where from firestore module"
```

---

### Task 3: Add categories data file

**Files:**
- Create: `src/features/crew/data/categories.ts`

- [ ] **Step 1: Create `src/features/crew/data/categories.ts`**

```ts
export const CREW_CATEGORIES: Record<string, string[]> = {
  'Video Photographer': [
    'Music Video', 'Event', 'Fashion', 'Food', 'Product', 'Sports',
    'Concert', 'Documentary', 'Drone', 'Social Media', 'Other',
  ],
  'Still Photographer': [
    'Fashion', 'Product', 'Food', 'Portrait', 'Corporate Headshot',
    'Event', 'Concert', 'Party', 'Sports', 'Real Estate', 'Nature',
    'Journalism', 'Other',
  ],
  'Editor': [
    'Video Editor', 'Photo Editor', 'Colorist', 'Sound Editor', 'Animator',
    'VFX Artist', 'CGI Specialist', 'Effects Designer', 'Subtitle Creator',
    'TikTok/Reels Editor', 'YouTube Editor',
  ],
  'Graphic Designer': [
    'Graphic Designer', 'Cover Art', 'Logo Designer', 'Poster Designer',
    'Illustrator', 'UI/UX Designer', 'Presentation Designer',
    'Branding Specialist', 'Animator', 'Motion Graphics',
  ],
  'AI Specialist': ['AI Images', 'AI Videos'],
  'Social Media': [
    'Social Media Manager', 'Content Creator', 'Campaign Manager',
    'TikToker', 'Reels Creator', 'Instagram Manager', 'YouTube Expert',
    'SEO Specialist', 'Copywriter', 'Digital Marketer',
  ],
  'Studio & Audio': [
    'Recording Studio', 'Music Producer', 'Songwriter', 'Composer',
    'Backup Singer', 'Rapper', 'DJ', 'Guitarist', 'Pianist', 'Drummer',
    'Violinist', 'Saxophonist', 'Voiceover Artist', 'Dubbing Artist',
    'Beatmaker', 'Studio Technician',
  ],
  'Lighting Tech': ['Studio/Commercial', 'Event', 'Stage/Concert', 'Gaffer', 'Other'],
  'Sound Recordist': [
    'Field Recordist (Film/TV)', 'Live Event Sound Tech',
    'Post-Production Mixer', 'Podcast/Interview Tech', 'Other',
  ],
};
```

- [ ] **Step 2: Commit**

```bash
git add src/features/crew/data/categories.ts
git commit -m "feat: add CREW_CATEGORIES static data"
```

---

### Task 4: Build `useCrewBuilder` hook (TDD)

**Files:**
- Create: `src/features/crew/hooks/__tests__/useCrewBuilder.test.ts`
- Create: `src/features/crew/hooks/useCrewBuilder.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/features/crew/hooks/__tests__/useCrewBuilder.test.ts`:

```ts
import { renderHook, act } from '@testing-library/react-native';
import { useCrewBuilder } from '../useCrewBuilder';

describe('useCrewBuilder', () => {
  it('starts with empty slots and totalCount 0', () => {
    const { result } = renderHook(() => useCrewBuilder());
    expect(result.current.slots).toEqual([]);
    expect(result.current.totalCount).toBe(0);
  });

  it('addSlot adds a new slot with quantity 1', () => {
    const { result } = renderHook(() => useCrewBuilder());
    act(() => { result.current.addSlot('Editor', 'Video Editor'); });
    expect(result.current.slots).toEqual([
      { category: 'Editor', subcategory: 'Video Editor', quantity: 1 },
    ]);
    expect(result.current.totalCount).toBe(1);
  });

  it('addSlot increments quantity when same category+subcategory already exists', () => {
    const { result } = renderHook(() => useCrewBuilder());
    act(() => {
      result.current.addSlot('Editor', 'Video Editor');
      result.current.addSlot('Editor', 'Video Editor');
    });
    expect(result.current.slots).toHaveLength(1);
    expect(result.current.slots[0].quantity).toBe(2);
    expect(result.current.totalCount).toBe(2);
  });

  it('addSlot creates a separate slot for a different subcategory', () => {
    const { result } = renderHook(() => useCrewBuilder());
    act(() => {
      result.current.addSlot('Editor', 'Video Editor');
      result.current.addSlot('Editor', 'Photo Editor');
    });
    expect(result.current.slots).toHaveLength(2);
  });

  it('removeSlot decrements quantity by 1', () => {
    const { result } = renderHook(() => useCrewBuilder());
    act(() => {
      result.current.addSlot('Editor', 'Video Editor');
      result.current.addSlot('Editor', 'Video Editor');
      result.current.removeSlot('Editor', 'Video Editor');
    });
    expect(result.current.slots[0].quantity).toBe(1);
  });

  it('removeSlot removes the slot when quantity reaches 0', () => {
    const { result } = renderHook(() => useCrewBuilder());
    act(() => {
      result.current.addSlot('Editor', 'Video Editor');
      result.current.removeSlot('Editor', 'Video Editor');
    });
    expect(result.current.slots).toHaveLength(0);
    expect(result.current.totalCount).toBe(0);
  });

  it('reset clears all slots', () => {
    const { result } = renderHook(() => useCrewBuilder());
    act(() => {
      result.current.addSlot('Editor', 'Video Editor');
      result.current.addSlot('Still Photographer', 'Fashion');
    });
    act(() => { result.current.reset(); });
    expect(result.current.slots).toEqual([]);
    expect(result.current.totalCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest --watchAll=false src/features/crew/hooks/__tests__/useCrewBuilder.test.ts
```

Expected: FAIL — `Cannot find module '../useCrewBuilder'`

- [ ] **Step 3: Write the implementation**

Create `src/features/crew/hooks/useCrewBuilder.ts`:

```ts
import { useState } from 'react';
import type { CrewRequestSlot } from '@core/types/project';

export function useCrewBuilder() {
  const [slots, setSlots] = useState<CrewRequestSlot[]>([]);

  const totalCount = slots.reduce((sum, s) => sum + s.quantity, 0);

  function addSlot(category: string, subcategory: string) {
    setSlots((prev) => {
      const existing = prev.find(
        (s) => s.category === category && s.subcategory === subcategory
      );
      if (existing) {
        return prev.map((s) =>
          s.category === category && s.subcategory === subcategory
            ? { ...s, quantity: s.quantity + 1 }
            : s
        );
      }
      return [...prev, { category, subcategory, quantity: 1 }];
    });
  }

  function removeSlot(category: string, subcategory: string) {
    setSlots((prev) => {
      const slot = prev.find(
        (s) => s.category === category && s.subcategory === subcategory
      );
      if (!slot) return prev;
      if (slot.quantity === 1) {
        return prev.filter(
          (s) => !(s.category === category && s.subcategory === subcategory)
        );
      }
      return prev.map((s) =>
        s.category === category && s.subcategory === subcategory
          ? { ...s, quantity: s.quantity - 1 }
          : s
      );
    });
  }

  function reset() {
    setSlots([]);
  }

  return { slots, totalCount, addSlot, removeSlot, reset };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx jest --watchAll=false src/features/crew/hooks/__tests__/useCrewBuilder.test.ts
```

Expected: PASS — 7 tests

- [ ] **Step 5: Commit**

```bash
git add src/features/crew/hooks/useCrewBuilder.ts src/features/crew/hooks/__tests__/useCrewBuilder.test.ts
git commit -m "feat: add useCrewBuilder hook with basket state management"
```

---

### Task 5: Build `useProjectRequests` hook (TDD)

**Files:**
- Create: `src/features/crew/hooks/__tests__/useProjectRequests.test.ts`
- Create: `src/features/crew/hooks/useProjectRequests.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/features/crew/hooks/__tests__/useProjectRequests.test.ts`:

```ts
import { renderHook, act } from '@testing-library/react-native';
import { useProjectRequests } from '../useProjectRequests';
import { addDocument, subscribeToCollection, where } from '@core/firebase/firestore';
import { useAuthStore } from '@core/stores/authStore';

jest.mock('@core/firebase/firestore', () => ({
  addDocument: jest.fn(),
  subscribeToCollection: jest.fn(),
  where: jest.fn(() => ({ type: 'where-constraint' })),
}));

const mockAddDocument = addDocument as jest.MockedFunction<typeof addDocument>;
const mockSubscribeToCollection = subscribeToCollection as jest.MockedFunction<typeof subscribeToCollection>;

const mockUser = {
  id: 'u1',
  email: 'test@example.com',
  displayName: 'Test User',
  photoURL: null,
  createdAt: { seconds: 0, nanoseconds: 0 },
};

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: mockUser, activeMode: 'client', isLoading: false });
  mockSubscribeToCollection.mockReturnValue(() => {});
});

describe('useProjectRequests', () => {
  it('subscribes to projects collection filtered by clientId on mount', () => {
    renderHook(() => useProjectRequests());
    expect(where).toHaveBeenCalledWith('clientId', '==', 'u1');
    expect(mockSubscribeToCollection).toHaveBeenCalledWith(
      'projects',
      expect.any(Function),
      expect.anything()
    );
  });

  it('returns requests sorted by createdAt descending', () => {
    const old = {
      id: 'r1', clientId: 'u1', crewSlots: [], description: '', date: '',
      location: '', budget: 0, status: 'open' as const,
      createdAt: { seconds: 100, nanoseconds: 0 },
    };
    const newer = {
      id: 'r2', clientId: 'u1', crewSlots: [], description: '', date: '',
      location: '', budget: 0, status: 'open' as const,
      createdAt: { seconds: 200, nanoseconds: 0 },
    };
    mockSubscribeToCollection.mockImplementation((_path, callback) => {
      callback([old, newer]);
      return () => {};
    });
    const { result } = renderHook(() => useProjectRequests());
    expect(result.current.requests[0].id).toBe('r2');
    expect(result.current.requests[1].id).toBe('r1');
  });

  it('submit calls addDocument with the correct shape', async () => {
    mockAddDocument.mockResolvedValue('new-id');
    const { result } = renderHook(() => useProjectRequests());
    const slots = [{ category: 'Editor', subcategory: 'Video Editor', quantity: 1 }];
    const details = { description: 'Test project', date: '2026-07-15', location: 'London', budget: 5000 };
    await act(async () => {
      await result.current.submit(slots, details);
    });
    expect(mockAddDocument).toHaveBeenCalledWith(
      'projects',
      expect.objectContaining({
        clientId: 'u1',
        crewSlots: slots,
        description: 'Test project',
        date: '2026-07-15',
        location: 'London',
        budget: 5000,
        status: 'open',
      })
    );
  });

  it('sets error and rethrows on submit failure', async () => {
    mockAddDocument.mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useProjectRequests());
    await act(async () => {
      try {
        await result.current.submit([], { description: '', date: '', location: '', budget: 0 });
      } catch {}
    });
    expect(result.current.error).toBe('Network error');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest --watchAll=false src/features/crew/hooks/__tests__/useProjectRequests.test.ts
```

Expected: FAIL — `Cannot find module '../useProjectRequests'`

- [ ] **Step 3: Write the implementation**

Create `src/features/crew/hooks/useProjectRequests.ts`:

```ts
import { useState, useEffect } from 'react';
import { useAuthStore } from '@core/stores/authStore';
import { addDocument, subscribeToCollection, where } from '@core/firebase/firestore';
import type { ProjectRequest, CrewRequestSlot } from '@core/types/project';

type SubmitDetails = {
  description: string;
  date: string;
  location: string;
  budget: number;
};

export function useProjectRequests() {
  const user = useAuthStore((s) => s.user);
  const [requests, setRequests] = useState<ProjectRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    return subscribeToCollection<ProjectRequest>(
      'projects',
      (data) => {
        const sorted = [...data].sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
        setRequests(sorted);
        setIsLoading(false);
      },
      where('clientId', '==', user.id)
    );
  }, [user?.id]);

  async function submit(slots: CrewRequestSlot[], details: SubmitDetails): Promise<void> {
    if (!user) return;
    setError(null);
    try {
      await addDocument('projects', {
        clientId: user.id,
        crewSlots: slots,
        ...details,
        status: 'open' as const,
        createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
      });
    } catch (e: any) {
      const message = e.message ?? 'Failed to submit request';
      setError(message);
      throw e;
    }
  }

  return { requests, isLoading, error, submit };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx jest --watchAll=false src/features/crew/hooks/__tests__/useProjectRequests.test.ts
```

Expected: PASS — 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/features/crew/hooks/useProjectRequests.ts src/features/crew/hooks/__tests__/useProjectRequests.test.ts
git commit -m "feat: add useProjectRequests hook with Firestore subscription and submit"
```

---

### Task 6: Build `SubCategoryRow` component

**Files:**
- Create: `src/features/crew/components/SubCategoryRow.tsx`

- [ ] **Step 1: Create `src/features/crew/components/SubCategoryRow.tsx`**

```tsx
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';

type Props = {
  subcategory: string;
  quantity: number;
  onPress: () => void;
};

export function SubCategoryRow({ subcategory, quantity, onPress }: Props) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.label}>{subcategory}</Text>
      {quantity > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{quantity}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#fff',
  },
  label: { fontSize: 15, color: '#333' },
  badge: {
    backgroundColor: '#111',
    borderRadius: 12,
    minWidth: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
  },
  badgeText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/features/crew/components/SubCategoryRow.tsx
git commit -m "feat: add SubCategoryRow component"
```

---

### Task 7: Build `CategoryItem` component

**Files:**
- Create: `src/features/crew/components/CategoryItem.tsx`

- [ ] **Step 1: Create `src/features/crew/components/CategoryItem.tsx`**

```tsx
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import type { CrewRequestSlot } from '@core/types/project';
import { SubCategoryRow } from './SubCategoryRow';

type Props = {
  category: string;
  subcategories: string[];
  expanded: boolean;
  onToggle: () => void;
  slots: CrewRequestSlot[];
  onSelectSubcategory: (subcategory: string) => void;
};

export function CategoryItem({
  category,
  subcategories,
  expanded,
  onToggle,
  slots,
  onSelectSubcategory,
}: Props) {
  return (
    <View>
      <TouchableOpacity style={styles.header} onPress={onToggle} activeOpacity={0.8}>
        <Text style={styles.title}>{category}</Text>
        <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {expanded &&
        subcategories.map((sub) => {
          const slot = slots.find(
            (s) => s.category === category && s.subcategory === sub
          );
          return (
            <SubCategoryRow
              key={sub}
              subcategory={sub}
              quantity={slot?.quantity ?? 0}
              onPress={() => onSelectSubcategory(sub)}
            />
          );
        })}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#f7f7f7',
  },
  title: { fontSize: 16, fontWeight: '600', color: '#111' },
  chevron: { fontSize: 11, color: '#888' },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/features/crew/components/CategoryItem.tsx
git commit -m "feat: add CategoryItem accordion component"
```

---

### Task 8: Build `CategoryAccordion` component

**Files:**
- Create: `src/features/crew/components/CategoryAccordion.tsx`

- [ ] **Step 1: Create `src/features/crew/components/CategoryAccordion.tsx`**

```tsx
import { useState } from 'react';
import { CREW_CATEGORIES } from '../data/categories';
import { CategoryItem } from './CategoryItem';
import type { CrewRequestSlot } from '@core/types/project';

type Props = {
  slots: CrewRequestSlot[];
  onSelectSubcategory: (category: string, subcategory: string) => void;
};

export function CategoryAccordion({ slots, onSelectSubcategory }: Props) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  function handleToggle(category: string) {
    setExpandedCategory((prev) => (prev === category ? null : category));
  }

  return (
    <>
      {Object.entries(CREW_CATEGORIES).map(([category, subcategories]) => (
        <CategoryItem
          key={category}
          category={category}
          subcategories={subcategories}
          expanded={expandedCategory === category}
          onToggle={() => handleToggle(category)}
          slots={slots}
          onSelectSubcategory={(sub) => onSelectSubcategory(category, sub)}
        />
      ))}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/crew/components/CategoryAccordion.tsx
git commit -m "feat: add CategoryAccordion component"
```

---

### Task 9: Build `CrewBasket` component

**Files:**
- Create: `src/features/crew/components/CrewBasket.tsx`

- [ ] **Step 1: Create `src/features/crew/components/CrewBasket.tsx`**

```tsx
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

type Props = {
  totalCount: number;
  onNext: () => void;
};

export function CrewBasket({ totalCount, onNext }: Props) {
  const label =
    totalCount === 0
      ? 'No roles selected'
      : `${totalCount} role${totalCount === 1 ? '' : 's'} selected`;

  return (
    <View style={styles.container}>
      <Text style={styles.count}>{label}</Text>
      <TouchableOpacity
        style={[styles.button, totalCount === 0 && styles.disabled]}
        onPress={onNext}
        disabled={totalCount === 0}
        activeOpacity={0.8}
      >
        <Text style={styles.buttonText}>Next</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  count: { fontSize: 14, color: '#555' },
  button: {
    backgroundColor: '#111',
    paddingHorizontal: 28,
    paddingVertical: 11,
    borderRadius: 8,
  },
  disabled: { backgroundColor: '#ccc' },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/features/crew/components/CrewBasket.tsx
git commit -m "feat: add CrewBasket sticky bottom component"
```

---

### Task 10: Build `ProjectRequestCard` component

**Files:**
- Create: `src/features/crew/components/ProjectRequestCard.tsx`

- [ ] **Step 1: Create `src/features/crew/components/ProjectRequestCard.tsx`**

```tsx
import { View, Text, StyleSheet } from 'react-native';
import type { ProjectRequest } from '@core/types/project';

type Props = { request: ProjectRequest };

const STATUS_COLORS: Record<ProjectRequest['status'], string> = {
  open: '#2196F3',
  in_progress: '#FF9800',
  completed: '#4CAF50',
  cancelled: '#9E9E9E',
};

export function ProjectRequestCard({ request }: Props) {
  const firstTwo = request.crewSlots.slice(0, 2);
  const overflow = request.crewSlots.length - 2;
  const crewSummary = [
    ...firstTwo.map((s) => `${s.quantity}× ${s.subcategory}`),
    overflow > 0 ? `+${overflow} more` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.date}>{request.date}</Text>
        <View style={[styles.badge, { backgroundColor: STATUS_COLORS[request.status] }]}>
          <Text style={styles.badgeText}>{request.status.replace('_', ' ')}</Text>
        </View>
      </View>
      <Text style={styles.location}>{request.location}</Text>
      {crewSummary ? <Text style={styles.crew}>{crewSummary}</Text> : null}
      <Text style={styles.budget}>${request.budget.toLocaleString()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  date: { fontSize: 14, fontWeight: '600', color: '#111' },
  badge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  location: { fontSize: 13, color: '#666', marginBottom: 4 },
  crew: { fontSize: 13, color: '#444', marginBottom: 4 },
  budget: { fontSize: 14, fontWeight: '600', color: '#111' },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/features/crew/components/ProjectRequestCard.tsx
git commit -m "feat: add ProjectRequestCard component"
```

---

### Task 11: Build `ProjectDetailsForm` component

**Files:**
- Create: `src/features/crew/components/ProjectDetailsForm.tsx`

- [ ] **Step 1: Create `src/features/crew/components/ProjectDetailsForm.tsx`**

```tsx
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';

type Details = {
  description: string;
  date: string;
  location: string;
  budget: number;
};

type Props = {
  onSubmit: (details: Details) => void;
  isSubmitting: boolean;
};

export function ProjectDetailsForm({ onSubmit, isSubmitting }: Props) {
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');
  const [budget, setBudget] = useState('');
  const [errors, setErrors] = useState<Partial<Record<keyof Details, string>>>({});

  function validate(): boolean {
    const next: typeof errors = {};
    if (!description.trim()) next.description = 'Required';
    if (!date.trim()) next.date = 'Required';
    if (!location.trim()) next.location = 'Required';
    const b = Number(budget);
    if (!budget || isNaN(b) || b <= 0) next.budget = 'Enter a valid budget greater than 0';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    onSubmit({ description, date, location, budget: Number(budget) });
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        placeholder="Describe your project"
        multiline
        numberOfLines={4}
        textAlignVertical="top"
      />
      {errors.description && <Text style={styles.error}>{errors.description}</Text>}

      <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
      <TextInput
        style={styles.input}
        value={date}
        onChangeText={setDate}
        placeholder="2026-07-15"
      />
      {errors.date && <Text style={styles.error}>{errors.date}</Text>}

      <Text style={styles.label}>Location</Text>
      <TextInput
        style={styles.input}
        value={location}
        onChangeText={setLocation}
        placeholder="City, Country"
      />
      {errors.location && <Text style={styles.error}>{errors.location}</Text>}

      <Text style={styles.label}>Budget ($)</Text>
      <TextInput
        style={styles.input}
        value={budget}
        onChangeText={setBudget}
        placeholder="5000"
        keyboardType="numeric"
      />
      {errors.budget && <Text style={styles.error}>{errors.budget}</Text>}

      <TouchableOpacity
        style={[styles.button, isSubmitting && styles.disabled]}
        onPress={handleSubmit}
        disabled={isSubmitting}
        activeOpacity={0.8}
      >
        <Text style={styles.buttonText}>
          {isSubmitting ? 'Submitting…' : 'Submit Request'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginTop: 16, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    backgroundColor: '#fff',
  },
  multiline: { height: 100 },
  error: { fontSize: 12, color: '#e53e3e', marginTop: 4 },
  button: {
    backgroundColor: '#111',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 28,
    marginBottom: 16,
  },
  disabled: { backgroundColor: '#ccc' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/features/crew/components/ProjectDetailsForm.tsx
git commit -m "feat: add ProjectDetailsForm component with validation"
```

---

### Task 12: Rewire tab layout, delete old tabs, create Home stack

**Files:**
- Delete: `src/app/(client)/(tabs)/crew/index.tsx`
- Delete: `src/app/(client)/(tabs)/bookings/index.tsx`
- Create: `src/app/(client)/(tabs)/home/_layout.tsx`
- Modify: `src/app/(client)/(tabs)/_layout.tsx`

- [ ] **Step 1: Delete the old tab screen files**

```bash
rm src/app/(client)/(tabs)/crew/index.tsx
rm src/app/(client)/(tabs)/bookings/index.tsx
```

- [ ] **Step 2: Create `src/app/(client)/(tabs)/home/_layout.tsx`**

```tsx
import { Stack } from 'expo-router';

export default function HomeLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="builder" options={{ title: 'Build Your Crew' }} />
      <Stack.Screen name="details" options={{ title: 'Project Details' }} />
    </Stack>
  );
}
```

- [ ] **Step 3: Replace `src/app/(client)/(tabs)/_layout.tsx` with the new tab set**

```tsx
import { useState } from 'react';
import { TouchableOpacity } from 'react-native';
import { Tabs } from 'expo-router';
import { ModeSwitcherSheet } from '@features/auth/components/ModeSwitcherSheet';

export default function ClientTabsLayout() {
  const [sheetVisible, setSheetVisible] = useState(false);

  return (
    <>
      <Tabs screenOptions={{ headerShown: false }}>
        <Tabs.Screen name="browse" options={{ title: 'Browse' }} />
        <Tabs.Screen name="home" options={{ title: 'Home' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
        <Tabs.Screen
          name="switch"
          options={{
            title: 'Switch',
            tabBarButton: ({ style, children, onPress: _onPress, href: _href, ...rest }) => (
              <TouchableOpacity
                style={style}
                onPress={() => setSheetVisible(true)}
                accessibilityLabel="Switch account"
                {...rest}
              >
                {children}
              </TouchableOpacity>
            ),
          }}
        />
      </Tabs>
      <ModeSwitcherSheet visible={sheetVisible} onClose={() => setSheetVisible(false)} />
    </>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/(client)/(tabs)/_layout.tsx src/app/(client)/(tabs)/home/_layout.tsx
git rm src/app/(client)/(tabs)/crew/index.tsx src/app/(client)/(tabs)/bookings/index.tsx
git commit -m "feat: replace crew/bookings tabs with Home tab stack"
```

---

### Task 13: Build Dashboard screen (`home/index.tsx`)

**Files:**
- Create: `src/app/(client)/(tabs)/home/index.tsx`

- [ ] **Step 1: Create `src/app/(client)/(tabs)/home/index.tsx`**

```tsx
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@components/layout/Screen';
import { ProjectRequestCard } from '@features/crew/components';
import { useProjectRequests } from '@features/crew/hooks';

export default function HomeScreen() {
  const { requests, isLoading } = useProjectRequests();

  return (
    <Screen scrollable={false}>
      <View style={styles.header}>
        <Text style={styles.title}>My Projects</Text>
        <TouchableOpacity
          style={styles.buildBtn}
          onPress={() => router.push('/(client)/(tabs)/home/builder')}
          activeOpacity={0.8}
        >
          <Text style={styles.buildBtnText}>Build Crew</Text>
        </TouchableOpacity>
      </View>
      {requests.length === 0 && !isLoading ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No projects yet.</Text>
          <Text style={styles.emptyHint}>
            Tap "Build Crew" to create your first request.
          </Text>
        </View>
      ) : (
        <FlatList
          style={styles.list}
          data={requests}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ProjectRequestCard request={item} />}
          contentContainerStyle={styles.listContent}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: { fontSize: 24, fontWeight: '700', color: '#111' },
  buildBtn: {
    backgroundColor: '#111',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
  },
  buildBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#333' },
  emptyHint: { fontSize: 14, color: '#999', textAlign: 'center', paddingHorizontal: 32 },
  list: { flex: 1 },
  listContent: { paddingVertical: 8 },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(client)/(tabs)/home/index.tsx
git commit -m "feat: add Home dashboard screen"
```

---

### Task 14: Build Builder screen (`home/builder.tsx`)

**Files:**
- Create: `src/app/(client)/(tabs)/home/builder.tsx`

- [ ] **Step 1: Create `src/app/(client)/(tabs)/home/builder.tsx`**

```tsx
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@components/layout/Screen';
import { CategoryAccordion, CrewBasket } from '@features/crew/components';
import { useCrewBuilder } from '@features/crew/hooks';

export default function BuilderScreen() {
  const { slots, totalCount, addSlot } = useCrewBuilder();

  function handleNext() {
    router.push({
      pathname: '/(client)/(tabs)/home/details',
      params: { slots: JSON.stringify(slots) },
    });
  }

  return (
    <Screen scrollable={false}>
      <View style={styles.content}>
        <ScrollView style={styles.scroll}>
          <CategoryAccordion slots={slots} onSelectSubcategory={addSlot} />
        </ScrollView>
        <CrewBasket totalCount={totalCount} onNext={handleNext} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1 },
  scroll: { flex: 1 },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(client)/(tabs)/home/builder.tsx
git commit -m "feat: add Builder screen with category accordion and crew basket"
```

---

### Task 15: Build Details screen (`home/details.tsx`)

**Files:**
- Create: `src/app/(client)/(tabs)/home/details.tsx`

- [ ] **Step 1: Create `src/app/(client)/(tabs)/home/details.tsx`**

```tsx
import { router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@components/layout/Screen';
import { ProjectDetailsForm } from '@features/crew/components';
import { useProjectRequests } from '@features/crew/hooks';
import { useUiStore } from '@core/stores/uiStore';
import type { CrewRequestSlot } from '@core/types/project';
import { useState } from 'react';

export default function DetailsScreen() {
  const { slots: slotsParam } = useLocalSearchParams<{ slots: string }>();
  const slots: CrewRequestSlot[] = slotsParam ? JSON.parse(slotsParam) : [];
  const { submit } = useProjectRequests();
  const { showToast } = useUiStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(details: {
    description: string;
    date: string;
    location: string;
    budget: number;
  }) {
    setIsSubmitting(true);
    try {
      await submit(slots, details);
      router.dismiss(2);
    } catch (e: any) {
      showToast(e.message ?? 'Failed to submit request', 'error');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen scrollable={false}>
      <ProjectDetailsForm onSubmit={handleSubmit} isSubmitting={isSubmitting} />
    </Screen>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(client)/(tabs)/home/details.tsx
git commit -m "feat: add Details screen with project form and Firestore submit"
```

---

### Task 16: Update barrel exports

**Files:**
- Modify: `src/features/crew/hooks/index.ts`
- Modify: `src/features/crew/components/index.ts`

- [ ] **Step 1: Update `src/features/crew/hooks/index.ts`**

```ts
export { useCrewBuilder } from './useCrewBuilder';
export { useProjectRequests } from './useProjectRequests';
```

- [ ] **Step 2: Update `src/features/crew/components/index.ts`**

```ts
export { SubCategoryRow } from './SubCategoryRow';
export { CategoryItem } from './CategoryItem';
export { CategoryAccordion } from './CategoryAccordion';
export { CrewBasket } from './CrewBasket';
export { ProjectRequestCard } from './ProjectRequestCard';
export { ProjectDetailsForm } from './ProjectDetailsForm';
```

- [ ] **Step 3: Run the full test suite to confirm nothing is broken**

```bash
npx jest --watchAll=false
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/features/crew/hooks/index.ts src/features/crew/components/index.ts
git commit -m "chore: export crew hooks and components from barrels"
```
