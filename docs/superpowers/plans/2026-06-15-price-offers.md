# Price Offers & Project Team Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the client-set budget field with a per-role bidding system where professionals submit price offers from the notice board, clients accept/reject from a "Price Offers" section, and accepted team members appear inside each project card.

**Architecture:** New `priceOffers` Firestore collection stores one document per professional-slot bid. Clients subscribe to pending offers for their projects and run a batch accept (auto-rejects competing bids + updates `filledSlots` on the project). The professional's notice board modal gains an inline bid form; the client home page gains a "Price Offers" section and an expandable team list inside project cards.

**Tech Stack:** React Native, Expo Router, Firebase Firestore (batch writes, `arrayUnion`, `in` queries), Zustand, TypeScript, Jest + `@testing-library/react-native`

---

### Task 1: Update types and firestore utilities

**Files:**
- Modify: `src/core/types/project.ts`
- Modify: `src/core/firebase/firestore.ts`

- [ ] **Step 1: Update `src/core/types/project.ts`**

Replace the file contents with:

```typescript
import type { ID, Timestamp } from './common';
import type { MediaRole } from './media';

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type CrewSlot = {
  id: ID;
  role: MediaRole;
  professionalId: ID | null;
  status: 'open' | 'filled';
};

export type Project = {
  id: ID;
  clientId: ID;
  title: string;
  description: string;
  startDate: Timestamp;
  endDate: Timestamp;
  crew: CrewSlot[];
  status: 'draft' | 'open' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: Timestamp;
};

export type Booking = {
  id: ID;
  projectId: ID;
  clientId: ID;
  professionalId: ID;
  role: MediaRole;
  status: BookingStatus;
  rate: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type PriceEntry = {
  service: string;
  price: number;
};

export type Review = {
  id: ID;
  professionalId: ID;
  authorId: ID;
  authorName: string;
  rating: number;
  body: string;
  createdAt: Timestamp;
};

export type CrewRequestSlot = {
  category: string;
  subcategory: string;
  quantity: number;
};

export type FilledSlot = {
  category: string;
  subcategory: string;
  professionalId: string;
};

export type ProjectApplication = {
  id: ID;
  projectId: ID;
  professionalId: ID;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Timestamp;
};

export type ProjectRequest = {
  id: ID;
  clientId: ID;
  title: string;
  crewSlots: CrewRequestSlot[];
  description: string;
  date: string;
  location: string;
  status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: Timestamp;
  filledSlots: FilledSlot[];
};

export type PriceOffer = {
  id: string;
  projectId: string;
  professionalId: string;
  category: string;
  subcategory: string;
  price: number;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Timestamp;
};

export type AcceptedMember = {
  professionalId: string;
  category: string;
  subcategory: string;
  price: number;
  displayName: string;
};
```

- [ ] **Step 2: Add `writeBatch`, `arrayUnion` to `src/core/firebase/firestore.ts`**

Add `writeBatch` and `arrayUnion` to the import line and add two exports at the bottom:

```typescript
// Change the top import to include writeBatch and arrayUnion:
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
  writeBatch,
  arrayUnion,
  type QueryConstraint,
  type DocumentData,
} from 'firebase/firestore';
```

Then add before the final `export { where };` line:

```typescript
export async function runBatchUpdates(
  updates: Array<{ path: string; data: DocumentData }>
): Promise<void> {
  const batch = writeBatch(db);
  for (const { path, data } of updates) {
    batch.update(doc(db, path), data);
  }
  await batch.commit();
}

export { where, arrayUnion };
```

- [ ] **Step 3: Commit**

```bash
git add src/core/types/project.ts src/core/firebase/firestore.ts
git commit -m "feat: add PriceOffer type, filledSlots to ProjectRequest, batch firestore util"
```

---

### Task 2: Update `useProjectRequests` and its tests

**Files:**
- Modify: `src/features/crew/hooks/useProjectRequests.ts`
- Modify: `src/features/crew/hooks/__tests__/useProjectRequests.test.ts`

- [ ] **Step 1: Write failing test** — open `src/features/crew/hooks/__tests__/useProjectRequests.test.ts` and replace with:

```typescript
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
      id: 'r1', clientId: 'u1', title: 'Old', crewSlots: [], description: '', date: '',
      location: '', status: 'open' as const, filledSlots: [],
      createdAt: { seconds: 100, nanoseconds: 0 },
    };
    const newer = {
      id: 'r2', clientId: 'u1', title: 'New', crewSlots: [], description: '', date: '',
      location: '', status: 'open' as const, filledSlots: [],
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

  it('submit calls addDocument with the correct shape (no budget, has filledSlots)', async () => {
    mockAddDocument.mockResolvedValue('new-id');
    const { result } = renderHook(() => useProjectRequests());
    const slots = [{ category: 'Editor', subcategory: 'Video Editor', quantity: 1 }];
    const details = { title: 'My Film', description: 'Test project', date: '2026-07-15', location: 'London' };
    await act(async () => {
      await result.current.submit(slots, details);
    });
    expect(mockAddDocument).toHaveBeenCalledWith(
      'projects',
      expect.objectContaining({
        clientId: 'u1',
        crewSlots: slots,
        title: 'My Film',
        description: 'Test project',
        date: '2026-07-15',
        location: 'London',
        status: 'open',
        filledSlots: [],
      })
    );
    expect(mockAddDocument).toHaveBeenCalledWith('projects', expect.not.objectContaining({ budget: expect.anything() }));
  });

  it('sets error and rethrows on submit failure', async () => {
    mockAddDocument.mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useProjectRequests());
    await act(async () => {
      try {
        await result.current.submit([], { title: '', description: '', date: '', location: '' });
      } catch {}
    });
    expect(result.current.error).toBe('Network error');
  });
});
```

- [ ] **Step 2: Run tests to see them fail**

```bash
npx jest useProjectRequests --no-coverage
```

Expected: FAIL — `budget` still present, `filledSlots` missing.

- [ ] **Step 3: Update `src/features/crew/hooks/useProjectRequests.ts`**

```typescript
import { useState, useEffect } from 'react';
import { useAuthStore } from '@core/stores/authStore';
import { addDocument, subscribeToCollection, where } from '@core/firebase/firestore';
import type { ProjectRequest, CrewRequestSlot } from '@core/types/project';

type SubmitDetails = {
  title: string;
  description: string;
  date: string;
  location: string;
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
        filledSlots: [],
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

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest useProjectRequests --no-coverage
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/crew/hooks/useProjectRequests.ts src/features/crew/hooks/__tests__/useProjectRequests.test.ts
git commit -m "feat: remove budget from project submit, add filledSlots"
```

---

### Task 3: Remove budget from builder form

**Files:**
- Modify: `src/app/(client)/(tabs)/home/builder.tsx`

- [ ] **Step 1: Remove budget state, field, and validation from `builder.tsx`**

Remove the following:
1. `const [budget, setBudget] = useState('');` — delete this line
2. The budget validation block inside `validate()`:
   ```typescript
   const b = Number(budget);
   if (!budget || isNaN(b) || b <= 0) next.budget = 'Enter a valid budget greater than 0';
   ```
3. The `budget: Number(budget)` argument in the `submit()` call — change to:
   ```typescript
   await submit(slots, { title, description, date, location });
   ```
4. The entire Budget `TextInput` block (label + input + error):
   ```tsx
   <Text style={styles.label}>Budget ($)</Text>
   <TextInput
     style={styles.input}
     value={budget}
     onChangeText={setBudget}
     placeholder="5000"
     placeholderTextColor="#666"
     keyboardType="numeric"
   />
   {errors.budget ? <Text style={styles.error}>{errors.budget}</Text> : null}
   ```

- [ ] **Step 2: Commit**

```bash
git add "src/app/(client)/(tabs)/home/builder.tsx"
git commit -m "feat: remove budget field from crew builder form"
```

---

### Task 4: Create `usePriceOffer` hook and tests

**Files:**
- Create: `src/features/noticeboard/hooks/usePriceOffer.ts`
- Create: `src/features/noticeboard/hooks/__tests__/usePriceOffer.test.ts`

- [ ] **Step 1: Write failing test** — create `src/features/noticeboard/hooks/__tests__/usePriceOffer.test.ts`:

```typescript
import { renderHook, act } from '@testing-library/react-native';
import { usePriceOffer } from '../usePriceOffer';
import { addDocument } from '@core/firebase/firestore';
import { useAuthStore } from '@core/stores/authStore';

jest.mock('@core/firebase/firestore', () => ({
  addDocument: jest.fn(),
}));

const mockAddDocument = addDocument as jest.MockedFunction<typeof addDocument>;

const mockUser = {
  id: 'pro1',
  email: 'pro@example.com',
  displayName: 'Pro User',
  photoURL: null,
  createdAt: { seconds: 0, nanoseconds: 0 },
};

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: mockUser, activeMode: 'professional', isLoading: false });
  mockAddDocument.mockResolvedValue('offer-id');
});

describe('usePriceOffer', () => {
  it('creates one priceOffer document per slot on submit', async () => {
    const { result } = renderHook(() => usePriceOffer());
    const slots = [
      { category: 'Video Production', subcategory: 'Cinematographer', price: 800 },
      { category: 'Audio', subcategory: 'Sound Mixer', price: 400 },
    ];
    await act(async () => {
      await result.current.submit('proj1', slots);
    });
    expect(mockAddDocument).toHaveBeenCalledTimes(2);
    expect(mockAddDocument).toHaveBeenCalledWith(
      'priceOffers',
      expect.objectContaining({
        projectId: 'proj1',
        professionalId: 'pro1',
        category: 'Video Production',
        subcategory: 'Cinematographer',
        price: 800,
        status: 'pending',
      })
    );
    expect(mockAddDocument).toHaveBeenCalledWith(
      'priceOffers',
      expect.objectContaining({
        projectId: 'proj1',
        professionalId: 'pro1',
        category: 'Audio',
        subcategory: 'Sound Mixer',
        price: 400,
        status: 'pending',
      })
    );
  });

  it('sets isSubmitting to true while in flight and false after', async () => {
    let resolve: () => void;
    mockAddDocument.mockReturnValue(new Promise<string>((r) => { resolve = () => r('id'); }));
    const { result } = renderHook(() => usePriceOffer());
    act(() => {
      result.current.submit('proj1', [{ category: 'Video', subcategory: 'DP', price: 500 }]);
    });
    expect(result.current.isSubmitting).toBe(true);
    await act(async () => { resolve!(); });
    expect(result.current.isSubmitting).toBe(false);
  });

  it('does nothing if no user', async () => {
    useAuthStore.setState({ user: null, activeMode: 'professional', isLoading: false });
    const { result } = renderHook(() => usePriceOffer());
    await act(async () => {
      await result.current.submit('proj1', [{ category: 'Video', subcategory: 'DP', price: 500 }]);
    });
    expect(mockAddDocument).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx jest usePriceOffer --no-coverage
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/features/noticeboard/hooks/usePriceOffer.ts`**

```typescript
import { useState } from 'react';
import { useAuthStore } from '@core/stores/authStore';
import { addDocument } from '@core/firebase/firestore';

type OfferSlot = { category: string; subcategory: string; price: number };

export function usePriceOffer() {
  const user = useAuthStore((s) => s.user);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(projectId: string, slots: OfferSlot[]): Promise<void> {
    if (!user) return;
    setIsSubmitting(true);
    try {
      await Promise.all(
        slots.map((slot) =>
          addDocument('priceOffers', {
            projectId,
            professionalId: user.id,
            category: slot.category,
            subcategory: slot.subcategory,
            price: slot.price,
            status: 'pending' as const,
            createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
          })
        )
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return { submit, isSubmitting };
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npx jest usePriceOffer --no-coverage
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/noticeboard/hooks/usePriceOffer.ts src/features/noticeboard/hooks/__tests__/usePriceOffer.test.ts
git commit -m "feat: add usePriceOffer hook for professional bid submission"
```

---

### Task 5: Update `ProjectDetailModal` with inline bid form

**Files:**
- Modify: `src/features/noticeboard/components/ProjectDetailModal.tsx`

The modal gains a `view` state toggle between `'details'` and `'bid'`. In bid view, each `crewSlot` gets a checkbox and a price input. On submit, calls `usePriceOffer`, then signals the parent via `onApply()`.

- [ ] **Step 1: Replace `src/features/noticeboard/components/ProjectDetailModal.tsx`**

```typescript
import { useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Platform, TextInput, Switch,
} from 'react-native';
import type { ProjectRequest, CrewRequestSlot } from '@core/types/project';
import { usePriceOffer } from '@features/noticeboard/hooks/usePriceOffer';

type BidEntry = CrewRequestSlot & { selected: boolean; price: string };

type Props = {
  request: ProjectRequest | null;
  onClose: () => void;
  onApply: () => void;
  onDismiss: () => void;
  isApplying: boolean;
};

export function ProjectDetailModal({ request, onClose, onApply, onDismiss }: Props) {
  const { submit, isSubmitting } = usePriceOffer();
  const [view, setView] = useState<'details' | 'bid'>('details');
  const [bids, setBids] = useState<BidEntry[]>([]);

  // Reset to details view whenever a different project is opened
  useEffect(() => {
    if (request) {
      setView('details');
      setBids([]);
    }
  }, [request?.id]);

  if (!request) return null;

  function openBid() {
    setBids(
      request!.crewSlots.map((s) => ({ ...s, selected: false, price: '' }))
    );
    setView('bid');
  }

  function toggleSelected(i: number) {
    setBids((prev) =>
      prev.map((b, idx) => (idx === i ? { ...b, selected: !b.selected } : b))
    );
  }

  function setPrice(i: number, value: string) {
    setBids((prev) =>
      prev.map((b, idx) => (idx === i ? { ...b, price: value } : b))
    );
  }

  const validBids = bids.filter((b) => b.selected && Number(b.price) > 0);
  const canSubmit = validBids.length > 0 && !isSubmitting;

  async function handleSubmit() {
    try {
      await submit(
        request!.id,
        validBids.map((b) => ({ category: b.category, subcategory: b.subcategory, price: Number(b.price) }))
      );
      setView('details');
      onApply();
    } catch {
      // error handled by usePriceOffer
    }
  }

  function handleClose() {
    setView('details');
    onClose();
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />
      <View style={[styles.sheet, Platform.OS === 'web' && (webSheet as any)]}>
        <View style={styles.handle} />

        {view === 'details' ? (
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>{request.title}</Text>

            <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Date</Text>
                <Text style={styles.metaValue}>{request.date}</Text>
              </View>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Location</Text>
                <Text style={styles.metaValue}>{request.location}</Text>
              </View>
            </View>

            <Text style={styles.sectionLabel}>Description</Text>
            <Text style={styles.description}>{request.description}</Text>

            <Text style={styles.sectionLabel}>Roles Needed</Text>
            {request.crewSlots.map((s, i) => (
              <View key={i} style={styles.slotRow}>
                <Text style={styles.slotQty}>{s.quantity}×</Text>
                <View>
                  <Text style={styles.slotSub}>{s.subcategory}</Text>
                  <Text style={styles.slotCat}>{s.category}</Text>
                </View>
              </View>
            ))}

            <View style={styles.actions}>
              <TouchableOpacity style={styles.applyBtn} onPress={openBid} activeOpacity={0.8}>
                <Text style={styles.applyText}>✦  Make an Offer</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dismissBtn} onPress={onDismiss} activeOpacity={0.8}>
                <Text style={styles.dismissText}>✕  Not interested</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            <TouchableOpacity onPress={() => setView('details')} style={styles.backBtn}>
              <Text style={styles.backText}>← Back to Details</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Submit Your Offer</Text>
            <Text style={styles.bidHint}>Select the roles you want to fill and enter your price for each.</Text>

            {bids.map((b, i) => (
              <View key={i} style={styles.bidRow}>
                <Switch
                  value={b.selected}
                  onValueChange={() => toggleSelected(i)}
                  trackColor={{ true: '#004aad' }}
                />
                <View style={styles.bidInfo}>
                  <Text style={styles.bidSub}>{b.subcategory}</Text>
                  <Text style={styles.bidCat}>{b.category} · {b.quantity} needed</Text>
                </View>
                {b.selected && (
                  <TextInput
                    style={styles.priceInput}
                    value={b.price}
                    onChangeText={(v) => setPrice(i, v)}
                    placeholder="$"
                    placeholderTextColor="#aaa"
                    keyboardType="numeric"
                    maxLength={8}
                  />
                )}
              </View>
            ))}

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.applyBtn, !canSubmit && styles.disabled]}
                onPress={handleSubmit}
                disabled={!canSubmit}
                activeOpacity={0.8}
              >
                <Text style={styles.applyText}>
                  {isSubmitting ? 'Sending…' : `Submit Offer (${validBids.length} role${validBids.length === 1 ? '' : 's'})`}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const webSheet = {
  maxWidth: 540,
  alignSelf: 'center',
  width: '100%',
  borderRadius: 20,
  bottom: 'auto',
  top: '50%',
  transform: [{ translateY: -50 }],
};

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 36,
    maxHeight: '85%',
  },
  handle: { width: 40, height: 4, backgroundColor: '#e0e0e0', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  title: { fontSize: 22, fontWeight: '800', color: '#111', marginBottom: 16 },
  metaRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  metaItem: { flex: 1, backgroundColor: '#f5f5f5', borderRadius: 10, padding: 10 },
  metaLabel: { fontSize: 11, color: '#888', fontWeight: '600', marginBottom: 2, textTransform: 'uppercase' },
  metaValue: { fontSize: 14, color: '#111', fontWeight: '600' },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#888', textTransform: 'uppercase', marginBottom: 8 },
  description: { fontSize: 15, color: '#333', lineHeight: 22, marginBottom: 20 },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  slotQty: { fontSize: 18, fontWeight: '800', color: '#004aad', width: 32 },
  slotSub: { fontSize: 15, fontWeight: '600', color: '#111' },
  slotCat: { fontSize: 12, color: '#888', marginTop: 1 },
  actions: { marginTop: 24, gap: 10 },
  applyBtn: { backgroundColor: '#004aad', borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  disabled: { backgroundColor: '#aaa' },
  applyText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  dismissBtn: { borderWidth: 1.5, borderColor: '#e53e3e', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  dismissText: { color: '#e53e3e', fontSize: 15, fontWeight: '600' },
  backBtn: { marginBottom: 12 },
  backText: { fontSize: 14, color: '#004aad', fontWeight: '600' },
  bidHint: { fontSize: 14, color: '#666', marginBottom: 16, lineHeight: 20 },
  bidRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  bidInfo: { flex: 1 },
  bidSub: { fontSize: 15, fontWeight: '600', color: '#111' },
  bidCat: { fontSize: 12, color: '#888', marginTop: 2 },
  priceInput: { width: 72, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, textAlign: 'center' },
});
```

- [ ] **Step 2: Update `DashboardScreen` to remove `useProjectApplication` and update `handleApply`**

In `src/app/(professional)/(tabs)/dashboard/index.tsx`:

1. Remove the import of `useProjectApplication`
2. Remove `const { apply, applying } = useProjectApplication();`
3. Replace `handleApply` with:
   ```typescript
   function handleApply(request: ProjectRequest) {
     showToast('Offer submitted!', 'success');
     dismiss(request.id);
   }
   ```
4. Update `NoticeBoardCard`'s `onApply` to open the modal instead of calling `handleApply`:
   ```tsx
   onApply={() => setSelected(item)}
   ```
5. Remove `isApplying={applying === item.id}` — set `isApplying={false}` or remove if the prop allows it
6. Update the `ProjectDetailModal` call — remove `isApplying` prop or set to `false`:
   ```tsx
   <ProjectDetailModal
     request={selected}
     onClose={() => setSelected(null)}
     onApply={() => selected && handleApply(selected)}
     onDismiss={() => selected && dismiss(selected.id)}
     isApplying={false}
   />
   ```

- [ ] **Step 3: Commit**

```bash
git add src/features/noticeboard/components/ProjectDetailModal.tsx "src/app/(professional)/(tabs)/dashboard/index.tsx"
git commit -m "feat: replace apply button with inline bid form in notice board modal"
```

---

### Task 6: Create `useProjectTeam` hook and tests

**Files:**
- Create: `src/features/offers/hooks/useProjectTeam.ts`
- Create: `src/features/offers/hooks/__tests__/useProjectTeam.test.ts`

- [ ] **Step 1: Write failing test** — create `src/features/offers/hooks/__tests__/useProjectTeam.test.ts`:

```typescript
import { renderHook, act } from '@testing-library/react-native';
import { useProjectTeam } from '../useProjectTeam';
import { queryDocuments, getDocument, where } from '@core/firebase/firestore';

jest.mock('@core/firebase/firestore', () => ({
  queryDocuments: jest.fn(),
  getDocument: jest.fn(),
  where: jest.fn(() => ({ type: 'where-constraint' })),
}));

const mockQueryDocuments = queryDocuments as jest.MockedFunction<typeof queryDocuments>;
const mockGetDocument = getDocument as jest.MockedFunction<typeof getDocument>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useProjectTeam', () => {
  it('starts with empty team and not loading', () => {
    const { result } = renderHook(() => useProjectTeam('proj1'));
    expect(result.current.team).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('load() fetches accepted offers and resolves display names', async () => {
    mockQueryDocuments.mockResolvedValue([
      { id: 'o1', projectId: 'proj1', professionalId: 'pro1', category: 'Video', subcategory: 'DP', price: 900, status: 'accepted', createdAt: { seconds: 0, nanoseconds: 0 } },
    ]);
    mockGetDocument.mockResolvedValue({ displayName: 'Jane Smith', id: 'pro1' });

    const { result } = renderHook(() => useProjectTeam('proj1'));
    await act(async () => { await result.current.load(); });

    expect(result.current.team).toEqual([
      { professionalId: 'pro1', category: 'Video', subcategory: 'DP', price: 900, displayName: 'Jane Smith' },
    ]);
  });

  it('uses "Unknown" when user document not found', async () => {
    mockQueryDocuments.mockResolvedValue([
      { id: 'o1', projectId: 'proj1', professionalId: 'pro99', category: 'Audio', subcategory: 'Mixer', price: 300, status: 'accepted', createdAt: { seconds: 0, nanoseconds: 0 } },
    ]);
    mockGetDocument.mockResolvedValue(null);

    const { result } = renderHook(() => useProjectTeam('proj1'));
    await act(async () => { await result.current.load(); });

    expect(result.current.team[0].displayName).toBe('Unknown');
  });

  it('does not re-fetch if already loaded', async () => {
    mockQueryDocuments.mockResolvedValue([]);
    const { result } = renderHook(() => useProjectTeam('proj1'));
    await act(async () => { await result.current.load(); });
    await act(async () => { await result.current.load(); });
    expect(mockQueryDocuments).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to see failure**

```bash
npx jest useProjectTeam --no-coverage
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/features/offers/hooks/useProjectTeam.ts`**

```typescript
import { useState } from 'react';
import { queryDocuments, getDocument, where } from '@core/firebase/firestore';
import type { PriceOffer, AcceptedMember } from '@core/types/project';

export function useProjectTeam(projectId: string) {
  const [team, setTeam] = useState<AcceptedMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function load(): Promise<void> {
    if (loaded) return;
    setIsLoading(true);
    try {
      const offers = await queryDocuments<PriceOffer>(
        'priceOffers',
        where('projectId', '==', projectId),
        where('status', '==', 'accepted')
      );
      const members = await Promise.all(
        offers.map(async (o) => {
          const user = await getDocument<{ displayName: string }>(`users/${o.professionalId}`);
          return {
            professionalId: o.professionalId,
            category: o.category,
            subcategory: o.subcategory,
            price: o.price,
            displayName: user?.displayName ?? 'Unknown',
          };
        })
      );
      setTeam(members);
    } finally {
      setIsLoading(false);
      setLoaded(true);
    }
  }

  return { team, isLoading, load };
}
```

- [ ] **Step 4: Run tests**

```bash
npx jest useProjectTeam --no-coverage
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/offers/hooks/useProjectTeam.ts src/features/offers/hooks/__tests__/useProjectTeam.test.ts
git commit -m "feat: add useProjectTeam hook to load accepted members"
```

---

### Task 7: Update `ProjectRequestCard` with team toggle

**Files:**
- Modify: `src/features/crew/components/ProjectRequestCard.tsx`

- [ ] **Step 1: Replace `src/features/crew/components/ProjectRequestCard.tsx`**

```typescript
import { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import type { ProjectRequest } from '@core/types/project';
import { useProjectTeam } from '@features/offers/hooks/useProjectTeam';

type Props = { request: ProjectRequest };

const STATUS_COLORS: Record<ProjectRequest['status'], string> = {
  open: '#2196F3',
  in_progress: '#FF9800',
  completed: '#4CAF50',
  cancelled: '#9E9E9E',
};

export function ProjectRequestCard({ request }: Props) {
  const [teamOpen, setTeamOpen] = useState(false);
  const { team, isLoading: teamLoading, load } = useProjectTeam(request.id);

  const firstTwo = request.crewSlots.slice(0, 2);
  const overflow = request.crewSlots.length - 2;
  const crewSummary = [
    ...firstTwo.map((s) => `${s.quantity}× ${s.subcategory}`),
    overflow > 0 ? `+${overflow} more` : null,
  ]
    .filter(Boolean)
    .join(', ');

  function toggleTeam() {
    const next = !teamOpen;
    setTeamOpen(next);
    if (next) load();
  }

  const filledCount = request.filledSlots?.length ?? 0;

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.title} numberOfLines={1}>{request.title}</Text>
        <View style={[styles.badge, { backgroundColor: STATUS_COLORS[request.status] }]}>
          <Text style={styles.badgeText}>{request.status.replace('_', ' ')}</Text>
        </View>
      </View>
      <Text style={styles.date}>{request.date}</Text>
      <Text style={styles.location}>{request.location}</Text>
      {crewSummary ? <Text style={styles.crew}>{crewSummary}</Text> : null}

      {filledCount > 0 && (
        <TouchableOpacity onPress={toggleTeam} style={styles.teamToggle} activeOpacity={0.7}>
          <Text style={styles.teamToggleText}>
            {teamOpen ? '▴' : '▾'} Team ({filledCount})
          </Text>
        </TouchableOpacity>
      )}

      {teamOpen && (
        <View style={styles.teamSection}>
          {teamLoading ? (
            <ActivityIndicator size="small" color="#004aad" />
          ) : (
            <>
              {request.crewSlots.map((slot, i) => {
                const filled = request.filledSlots?.find(
                  (f) => f.category === slot.category && f.subcategory === slot.subcategory
                );
                const member = team.find(
                  (m) => m.professionalId === filled?.professionalId && m.subcategory === slot.subcategory
                );
                return (
                  <View key={i} style={styles.teamRow}>
                    <View style={styles.teamDot} />
                    <View style={styles.teamInfo}>
                      <Text style={styles.teamRole}>{slot.subcategory}</Text>
                      {member ? (
                        <Text style={styles.teamName}>{member.displayName} · ${member.price.toLocaleString()}</Text>
                      ) : (
                        <Text style={styles.teamOpen}>— Open</Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </>
          )}
        </View>
      )}
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
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  title: { fontSize: 15, fontWeight: '700', color: '#111', flex: 1, marginRight: 8 },
  badge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  date: { fontSize: 13, color: '#555', marginBottom: 2 },
  location: { fontSize: 13, color: '#666', marginBottom: 4 },
  crew: { fontSize: 13, color: '#444', marginBottom: 4 },
  teamToggle: { marginTop: 8, alignSelf: 'flex-start' },
  teamToggleText: { fontSize: 13, color: '#004aad', fontWeight: '600' },
  teamSection: { marginTop: 10, gap: 8 },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  teamDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#004aad' },
  teamInfo: { flex: 1 },
  teamRole: { fontSize: 13, fontWeight: '600', color: '#111' },
  teamName: { fontSize: 12, color: '#555', marginTop: 1 },
  teamOpen: { fontSize: 12, color: '#bbb', marginTop: 1 },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/features/crew/components/ProjectRequestCard.tsx
git commit -m "feat: add team toggle to ProjectRequestCard, remove budget display"
```

---

### Task 8: Create `usePriceOffers` hook and tests

**Files:**
- Create: `src/features/offers/hooks/usePriceOffers.ts`
- Create: `src/features/offers/hooks/__tests__/usePriceOffers.test.ts`

- [ ] **Step 1: Write failing test** — create `src/features/offers/hooks/__tests__/usePriceOffers.test.ts`:

```typescript
import { renderHook } from '@testing-library/react-native';
import { usePriceOffers } from '../usePriceOffers';
import { queryDocuments, subscribeToCollection, where } from '@core/firebase/firestore';
import { useAuthStore } from '@core/stores/authStore';

jest.mock('@core/firebase/firestore', () => ({
  queryDocuments: jest.fn(),
  subscribeToCollection: jest.fn(),
  where: jest.fn(() => ({ type: 'where-constraint' })),
}));

const mockQueryDocuments = queryDocuments as jest.MockedFunction<typeof queryDocuments>;
const mockSubscribeToCollection = subscribeToCollection as jest.MockedFunction<typeof subscribeToCollection>;

const mockUser = {
  id: 'client1',
  email: 'client@example.com',
  displayName: 'Client',
  photoURL: null,
  createdAt: { seconds: 0, nanoseconds: 0 },
};

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: mockUser, activeMode: 'client', isLoading: false });
  mockSubscribeToCollection.mockReturnValue(() => {});
});

describe('usePriceOffers', () => {
  it('sets isLoading false immediately if client has no projects', async () => {
    mockQueryDocuments.mockResolvedValue([]);
    const { result } = renderHook(() => usePriceOffers());
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.offers).toEqual([]);
    expect(mockSubscribeToCollection).not.toHaveBeenCalled();
  });

  it('subscribes to priceOffers with project IDs when client has projects', async () => {
    mockQueryDocuments.mockResolvedValue([
      { id: 'p1', clientId: 'client1' },
      { id: 'p2', clientId: 'client1' },
    ]);
    mockSubscribeToCollection.mockReturnValue(() => {});
    renderHook(() => usePriceOffers());
    await new Promise((r) => setTimeout(r, 0));
    expect(mockSubscribeToCollection).toHaveBeenCalledWith(
      'priceOffers',
      expect.any(Function),
      expect.anything(),
      expect.anything()
    );
  });

  it('returns empty offers and not loading when no user', () => {
    useAuthStore.setState({ user: null, activeMode: 'client', isLoading: false });
    const { result } = renderHook(() => usePriceOffers());
    expect(result.current.offers).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });
});
```

- [ ] **Step 2: Run to see failure**

```bash
npx jest usePriceOffers --no-coverage
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/features/offers/hooks/usePriceOffers.ts`**

```typescript
import { useState, useEffect } from 'react';
import { useAuthStore } from '@core/stores/authStore';
import { queryDocuments, subscribeToCollection, where } from '@core/firebase/firestore';
import type { PriceOffer, ProjectRequest } from '@core/types/project';

export function usePriceOffers() {
  const user = useAuthStore((s) => s.user);
  const [offers, setOffers] = useState<PriceOffer[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    setIsLoading(true);
    let unsubscribe: (() => void) | undefined;

    queryDocuments<ProjectRequest>('projects', where('clientId', '==', user.id))
      .then((projects) => {
        if (projects.length === 0) {
          setIsLoading(false);
          return;
        }
        const ids = projects.map((p) => p.id);
        unsubscribe = subscribeToCollection<PriceOffer>(
          'priceOffers',
          (data) => {
            setOffers(data);
            setIsLoading(false);
          },
          where('projectId', 'in', ids),
          where('status', '==', 'pending')
        );
      })
      .catch(() => setIsLoading(false));

    return () => { unsubscribe?.(); };
  }, [user?.id]);

  return { offers, isLoading };
}
```

- [ ] **Step 4: Run tests**

```bash
npx jest usePriceOffers --no-coverage
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/offers/hooks/usePriceOffers.ts src/features/offers/hooks/__tests__/usePriceOffers.test.ts
git commit -m "feat: add usePriceOffers hook to subscribe to pending offers for client"
```

---

### Task 9: Create `useAcceptOffer` hook and tests

**Files:**
- Create: `src/features/offers/hooks/useAcceptOffer.ts`
- Create: `src/features/offers/hooks/__tests__/useAcceptOffer.test.ts`

- [ ] **Step 1: Write failing test** — create `src/features/offers/hooks/__tests__/useAcceptOffer.test.ts`:

```typescript
import { renderHook, act } from '@testing-library/react-native';
import { useAcceptOffer } from '../useAcceptOffer';
import { queryDocuments, runBatchUpdates, updateDocument, where } from '@core/firebase/firestore';

jest.mock('@core/firebase/firestore', () => ({
  queryDocuments: jest.fn(),
  runBatchUpdates: jest.fn(),
  updateDocument: jest.fn(),
  where: jest.fn(() => ({ type: 'where-constraint' })),
  arrayUnion: jest.fn((v) => v),
}));

const mockQueryDocuments = queryDocuments as jest.MockedFunction<typeof queryDocuments>;
const mockRunBatchUpdates = runBatchUpdates as jest.MockedFunction<typeof runBatchUpdates>;
const mockUpdateDocument = updateDocument as jest.MockedFunction<typeof updateDocument>;

const offer = {
  id: 'o1',
  projectId: 'proj1',
  professionalId: 'pro1',
  category: 'Video',
  subcategory: 'DP',
  price: 1000,
  status: 'pending' as const,
  createdAt: { seconds: 0, nanoseconds: 0 },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockQueryDocuments.mockResolvedValue([]);
  mockRunBatchUpdates.mockResolvedValue(undefined);
  mockUpdateDocument.mockResolvedValue(undefined);
});

describe('useAcceptOffer', () => {
  it('accept: sets accepted offer status and updates project filledSlots', async () => {
    const { result } = renderHook(() => useAcceptOffer());
    await act(async () => { await result.current.accept(offer); });
    expect(mockUpdateDocument).toHaveBeenCalledWith(
      'priceOffers/o1',
      expect.objectContaining({ status: 'accepted' })
    );
    expect(mockUpdateDocument).toHaveBeenCalledWith(
      'projects/proj1',
      expect.objectContaining({
        filledSlots: expect.anything(),
      })
    );
  });

  it('accept: batch-rejects competing pending offers for the same slot', async () => {
    mockQueryDocuments.mockResolvedValue([
      { id: 'o2', projectId: 'proj1', professionalId: 'pro2', category: 'Video', subcategory: 'DP', price: 800, status: 'pending', createdAt: { seconds: 0, nanoseconds: 0 } },
    ]);
    const { result } = renderHook(() => useAcceptOffer());
    await act(async () => { await result.current.accept(offer); });
    expect(mockRunBatchUpdates).toHaveBeenCalledWith([
      { path: 'priceOffers/o2', data: { status: 'rejected' } },
    ]);
  });

  it('reject: sets offer status to rejected', async () => {
    const { result } = renderHook(() => useAcceptOffer());
    await act(async () => { await result.current.reject('o5'); });
    expect(mockUpdateDocument).toHaveBeenCalledWith('priceOffers/o5', { status: 'rejected' });
  });

  it('does not call runBatchUpdates when no competing offers', async () => {
    mockQueryDocuments.mockResolvedValue([]);
    const { result } = renderHook(() => useAcceptOffer());
    await act(async () => { await result.current.accept(offer); });
    expect(mockRunBatchUpdates).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to see failure**

```bash
npx jest useAcceptOffer --no-coverage
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/features/offers/hooks/useAcceptOffer.ts`**

```typescript
import { useState } from 'react';
import { queryDocuments, runBatchUpdates, updateDocument, arrayUnion, where } from '@core/firebase/firestore';
import type { PriceOffer } from '@core/types/project';

export function useAcceptOffer() {
  const [isAccepting, setIsAccepting] = useState<string | null>(null);

  async function accept(offer: PriceOffer): Promise<void> {
    setIsAccepting(offer.id);
    try {
      const competing = await queryDocuments<PriceOffer>(
        'priceOffers',
        where('projectId', '==', offer.projectId),
        where('category', '==', offer.category),
        where('subcategory', '==', offer.subcategory),
        where('status', '==', 'pending')
      );

      const others = competing.filter((o) => o.id !== offer.id);
      if (others.length > 0) {
        await runBatchUpdates(
          others.map((o) => ({ path: `priceOffers/${o.id}`, data: { status: 'rejected' } }))
        );
      }

      await updateDocument(`priceOffers/${offer.id}`, { status: 'accepted' });
      await updateDocument(`projects/${offer.projectId}`, {
        filledSlots: arrayUnion({
          category: offer.category,
          subcategory: offer.subcategory,
          professionalId: offer.professionalId,
        }) as any,
      });
    } finally {
      setIsAccepting(null);
    }
  }

  async function reject(offerId: string): Promise<void> {
    await updateDocument(`priceOffers/${offerId}`, { status: 'rejected' });
  }

  return { accept, reject, isAccepting };
}
```

- [ ] **Step 4: Run tests**

```bash
npx jest useAcceptOffer --no-coverage
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/offers/hooks/useAcceptOffer.ts src/features/offers/hooks/__tests__/useAcceptOffer.test.ts
git commit -m "feat: add useAcceptOffer hook with auto-reject batch logic"
```

---

### Task 10: Create `PriceOfferCard` component

**Files:**
- Create: `src/features/offers/components/PriceOfferCard.tsx`

- [ ] **Step 1: Create `src/features/offers/components/PriceOfferCard.tsx`**

```typescript
import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { getDocument } from '@core/firebase/firestore';
import type { PriceOffer } from '@core/types/project';

type Props = {
  offer: PriceOffer;
  onAccept: () => void;
  onReject: () => void;
  isAccepting: boolean;
};

export function PriceOfferCard({ offer, onAccept, onReject, isAccepting }: Props) {
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    getDocument<{ displayName: string }>(`users/${offer.professionalId}`).then((u) => {
      setDisplayName(u?.displayName ?? 'Unknown');
    });
  }, [offer.professionalId]);

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={styles.info}>
          <Text style={styles.name}>{displayName ?? '…'}</Text>
          <Text style={styles.role}>
            {offer.subcategory}
            <Text style={styles.cat}> · {offer.category}</Text>
          </Text>
          <Text style={styles.price}>${offer.price.toLocaleString()}</Text>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.acceptBtn, isAccepting && styles.disabled]}
            onPress={onAccept}
            disabled={isAccepting}
            activeOpacity={0.8}
          >
            {isAccepting ? (
              <ActivityIndicator size="small" color="#2e7d32" />
            ) : (
              <Text style={styles.acceptIcon}>✓</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.rejectBtn]}
            onPress={onReject}
            activeOpacity={0.8}
          >
            <Text style={styles.rejectIcon}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700', color: '#111', marginBottom: 2 },
  role: { fontSize: 13, color: '#444', marginBottom: 4 },
  cat: { color: '#888', fontWeight: '400' },
  price: { fontSize: 16, fontWeight: '800', color: '#004aad' },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtn: { backgroundColor: '#e8f5e9', borderWidth: 1.5, borderColor: '#4caf50' },
  rejectBtn: { backgroundColor: '#fdecea', borderWidth: 1.5, borderColor: '#e53e3e' },
  disabled: { opacity: 0.5 },
  acceptIcon: { fontSize: 16, color: '#2e7d32', fontWeight: '700' },
  rejectIcon: { fontSize: 14, color: '#e53e3e', fontWeight: '700' },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/features/offers/components/PriceOfferCard.tsx
git commit -m "feat: add PriceOfferCard component for client offer review"
```

---

### Task 11: Add "Price Offers" section to client home page

**Files:**
- Modify: `src/app/(client)/(tabs)/home/index.tsx`

- [ ] **Step 1: Update `src/app/(client)/(tabs)/home/index.tsx`**

Add the following imports at the top:

```typescript
import { PriceOfferCard } from '@features/offers/components/PriceOfferCard';
import { usePriceOffers } from '@features/offers/hooks/usePriceOffers';
import { useAcceptOffer } from '@features/offers/hooks/useAcceptOffer';
import { useUiStore } from '@core/stores/uiStore';
import type { PriceOffer } from '@core/types/project';
```

Add inside `HomeScreen()`:

```typescript
const { offers, isLoading: offersLoading } = usePriceOffers();
const { accept, reject, isAccepting } = useAcceptOffer();
const { showToast } = useUiStore();

async function handleAccept(offer: PriceOffer) {
  try {
    await accept(offer);
    showToast('Offer accepted!', 'success');
  } catch {
    showToast('Failed to accept offer.', 'error');
  }
}

async function handleReject(offerId: string) {
  try {
    await reject(offerId);
  } catch {
    showToast('Failed to reject offer.', 'error');
  }
}
```

Add the "Price Offers" section in the JSX, between the hero `<View>` and the `projectsSection <View>`:

```tsx
{offers.length > 0 && (
  <View style={styles.offersSection}>
    <Text style={styles.sectionTitle}>Price Offers</Text>
    {offersLoading ? (
      <ActivityIndicator style={styles.loader} />
    ) : (
      offers.map((offer) => (
        <PriceOfferCard
          key={offer.id}
          offer={offer}
          onAccept={() => handleAccept(offer)}
          onReject={() => handleReject(offer.id)}
          isAccepting={isAccepting === offer.id}
        />
      ))
    )}
  </View>
)}
```

Add the missing style:

```typescript
offersSection: { gap: 8, marginHorizontal: 0 },
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/(client)/(tabs)/home/index.tsx"
git commit -m "feat: add Price Offers section to client home page"
```

---

### Task 12: Run all tests and final push

- [ ] **Step 1: Run all tests**

```bash
npx jest --no-coverage
```

Expected: All tests pass. If any fail due to `budget` references in existing snapshots or mocks, update those files to remove `budget` from mock `ProjectRequest` objects.

- [ ] **Step 2: Push**

```bash
git push
```
