# Marketplace Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Marketplace tab to the professional app where users can browse and post 2nd-hand equipment for sale and equipment available for rental.

**Architecture:** A new `marketplace` tab is registered in the professional tabs layout. The screen hosts a pill toggle (2nd Hand / Equipment Rental), a search bar, and a type-specific list or grid below. All data lives in a single Firestore collection (`marketplace_listings`) filtered by `type`. Two hooks handle reads (`useMarketplaceListings`) and writes (`useCreateListing`). A FAB opens a post-listing bottom sheet; tapping any card opens a detail bottom sheet.

**Tech Stack:** React Native, Expo Router, Firebase Firestore + Storage, `expo-image-picker`, Zustand (`useAuthStore`, `useUiStore`).

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `src/features/marketplace/types.ts` | `MarketplaceListing` type + `MarketplaceListingType` |
| Create | `src/features/marketplace/hooks/useMarketplaceListings.ts` | Real-time Firestore query by type |
| Create | `src/features/marketplace/hooks/__tests__/useMarketplaceListings.test.ts` | Hook tests |
| Create | `src/features/marketplace/hooks/useCreateListing.ts` | Write listing + upload image |
| Create | `src/features/marketplace/hooks/__tests__/useCreateListing.test.ts` | Hook tests |
| Create | `src/features/marketplace/components/MarketplaceToggle.tsx` | Pill toggle (2nd Hand / Rental) |
| Create | `src/features/marketplace/components/ListingCard.tsx` | Row card for 2nd hand |
| Create | `src/features/marketplace/components/RentalCard.tsx` | Grid card for rental |
| Create | `src/features/marketplace/components/SecondHandList.tsx` | Vertical FlatList for 2nd hand |
| Create | `src/features/marketplace/components/RentalGrid.tsx` | 2-column grid for rentals |
| Create | `src/features/marketplace/components/ListingDetailModal.tsx` | Detail bottom sheet |
| Create | `src/features/marketplace/components/PostListingSheet.tsx` | Post listing bottom sheet |
| Create | `src/app/(professional)/(tabs)/marketplace/index.tsx` | Main marketplace screen |
| Modify | `src/app/(professional)/(tabs)/_layout.tsx` | Register marketplace tab |

---

## Task 1: MarketplaceListing type

**Files:**
- Create: `src/features/marketplace/types.ts`

- [ ] **Step 1: Create the types file**

```ts
import type { Timestamp } from '@core/types/common';

export type MarketplaceListingType = 'secondhand' | 'rental';

export type MarketplaceListing = {
  id: string;
  type: MarketplaceListingType;
  posterId: string;
  posterName: string;
  productName: string;
  location: string;
  price: number; // sale price for secondhand; daily rate for rental
  imageUrl: string | null;
  createdAt: Timestamp;
};
```

- [ ] **Step 2: Commit**

```bash
git add src/features/marketplace/types.ts
git commit -m "feat: add MarketplaceListing type"
```

---

## Task 2: useMarketplaceListings hook

**Files:**
- Create: `src/features/marketplace/hooks/useMarketplaceListings.ts`
- Create: `src/features/marketplace/hooks/__tests__/useMarketplaceListings.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/features/marketplace/hooks/__tests__/useMarketplaceListings.test.ts
import { renderHook } from '@testing-library/react-native';
import { useMarketplaceListings } from '../useMarketplaceListings';
import { subscribeToCollection } from '@core/firebase/firestore';

jest.mock('@core/firebase/firestore', () => ({
  subscribeToCollection: jest.fn(),
  where: jest.fn((field, op, val) => ({ field, op, val })),
}));

const mockSubscribeToCollection = subscribeToCollection as jest.MockedFunction<typeof subscribeToCollection>;

const fakeListing = {
  id: 'listing-1',
  type: 'secondhand' as const,
  posterId: 'pro1',
  posterName: 'David K.',
  productName: 'Sony FX6',
  location: 'Tel Aviv',
  price: 4500,
  imageUrl: null,
  createdAt: { seconds: 1000, nanoseconds: 0 },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSubscribeToCollection.mockReturnValue(() => {});
});

describe('useMarketplaceListings', () => {
  it('starts with isLoading true and empty listings', () => {
    const { result } = renderHook(() => useMarketplaceListings('secondhand'));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.listings).toEqual([]);
  });

  it('sets listings and isLoading=false when subscription fires', () => {
    mockSubscribeToCollection.mockImplementation((_col, callback) => {
      callback([fakeListing]);
      return () => {};
    });
    const { result } = renderHook(() => useMarketplaceListings('secondhand'));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.listings).toHaveLength(1);
    expect(result.current.listings[0].productName).toBe('Sony FX6');
  });

  it('sorts listings by createdAt descending', () => {
    const older = { ...fakeListing, id: 'a', createdAt: { seconds: 500, nanoseconds: 0 } };
    const newer = { ...fakeListing, id: 'b', createdAt: { seconds: 1000, nanoseconds: 0 } };
    mockSubscribeToCollection.mockImplementation((_col, callback) => {
      callback([older, newer]);
      return () => {};
    });
    const { result } = renderHook(() => useMarketplaceListings('secondhand'));
    expect(result.current.listings[0].id).toBe('b');
    expect(result.current.listings[1].id).toBe('a');
  });

  it('calls subscribeToCollection with the correct type filter', () => {
    renderHook(() => useMarketplaceListings('rental'));
    expect(mockSubscribeToCollection).toHaveBeenCalledWith(
      'marketplace_listings',
      expect.any(Function),
      expect.objectContaining({ field: 'type', op: '==', val: 'rental' })
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest src/features/marketplace/hooks/__tests__/useMarketplaceListings.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../useMarketplaceListings'`

- [ ] **Step 3: Implement the hook**

```ts
// src/features/marketplace/hooks/useMarketplaceListings.ts
import { useState, useEffect } from 'react';
import { subscribeToCollection, where } from '@core/firebase/firestore';
import type { MarketplaceListing, MarketplaceListingType } from '../types';

export function useMarketplaceListings(type: MarketplaceListingType) {
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    return subscribeToCollection<MarketplaceListing>(
      'marketplace_listings',
      (data) => {
        const sorted = [...data].sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
        setListings(sorted);
        setIsLoading(false);
      },
      where('type', '==', type)
    );
  }, [type]);

  return { listings, isLoading };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest src/features/marketplace/hooks/__tests__/useMarketplaceListings.test.ts --no-coverage
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/marketplace/hooks/useMarketplaceListings.ts src/features/marketplace/hooks/__tests__/useMarketplaceListings.test.ts
git commit -m "feat: add useMarketplaceListings hook"
```

---

## Task 3: useCreateListing hook

**Files:**
- Create: `src/features/marketplace/hooks/useCreateListing.ts`
- Create: `src/features/marketplace/hooks/__tests__/useCreateListing.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/features/marketplace/hooks/__tests__/useCreateListing.test.ts
import { renderHook, act } from '@testing-library/react-native';
import { useCreateListing } from '../useCreateListing';
import { addDocument } from '@core/firebase/firestore';
import { uploadFile } from '@core/firebase/storage';
import { useAuthStore } from '@core/stores/authStore';

jest.mock('@core/firebase/firestore', () => ({
  addDocument: jest.fn(),
}));

jest.mock('@core/firebase/storage', () => ({
  uploadFile: jest.fn(),
}));

global.fetch = jest.fn().mockResolvedValue({
  blob: () => Promise.resolve({}),
}) as any;

const mockAddDocument = addDocument as jest.MockedFunction<typeof addDocument>;
const mockUploadFile = uploadFile as jest.MockedFunction<typeof uploadFile>;

const mockUser = {
  id: 'pro1',
  email: 'pro@example.com',
  displayName: 'David K.',
  photoURL: null,
  createdAt: { seconds: 0, nanoseconds: 0 },
};

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: mockUser, activeMode: 'professional', isLoading: false });
  mockAddDocument.mockResolvedValue('new-id');
  mockUploadFile.mockResolvedValue('https://storage.example.com/image.jpg');
});

describe('useCreateListing', () => {
  it('creates a Firestore document with correct fields when no image', async () => {
    const { result } = renderHook(() => useCreateListing());
    await act(async () => {
      await result.current.create({
        type: 'secondhand',
        productName: 'Sony FX6',
        location: 'Tel Aviv',
        price: 4500,
        imageUri: null,
      });
    });
    expect(mockAddDocument).toHaveBeenCalledWith(
      'marketplace_listings',
      expect.objectContaining({
        type: 'secondhand',
        posterId: 'pro1',
        posterName: 'David K.',
        productName: 'Sony FX6',
        location: 'Tel Aviv',
        price: 4500,
        imageUrl: null,
      })
    );
    expect(mockUploadFile).not.toHaveBeenCalled();
  });

  it('uploads image and stores the download URL when imageUri is provided', async () => {
    const { result } = renderHook(() => useCreateListing());
    await act(async () => {
      await result.current.create({
        type: 'rental',
        productName: 'Arri Alexa Mini',
        location: 'Haifa',
        price: 600,
        imageUri: 'file://local/photo.jpg',
      });
    });
    expect(mockUploadFile).toHaveBeenCalledWith(
      expect.stringContaining('marketplace/'),
      expect.anything()
    );
    expect(mockAddDocument).toHaveBeenCalledWith(
      'marketplace_listings',
      expect.objectContaining({ imageUrl: 'https://storage.example.com/image.jpg' })
    );
  });

  it('sets isSubmitting to true while in flight and false after', async () => {
    let resolve: (id: string) => void;
    mockAddDocument.mockReturnValue(new Promise<string>((r) => { resolve = r; }));
    const { result } = renderHook(() => useCreateListing());
    act(() => {
      result.current.create({ type: 'secondhand', productName: 'Lens', location: 'TLV', price: 100, imageUri: null });
    });
    expect(result.current.isSubmitting).toBe(true);
    await act(async () => { resolve!('id'); });
    expect(result.current.isSubmitting).toBe(false);
  });

  it('does nothing if no user is logged in', async () => {
    useAuthStore.setState({ user: null, activeMode: 'professional', isLoading: false });
    const { result } = renderHook(() => useCreateListing());
    await act(async () => {
      await result.current.create({ type: 'secondhand', productName: 'Lens', location: 'TLV', price: 100, imageUri: null });
    });
    expect(mockAddDocument).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest src/features/marketplace/hooks/__tests__/useCreateListing.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../useCreateListing'`

- [ ] **Step 3: Implement the hook**

```ts
// src/features/marketplace/hooks/useCreateListing.ts
import { useState } from 'react';
import { addDocument } from '@core/firebase/firestore';
import { uploadFile } from '@core/firebase/storage';
import { useAuthStore } from '@core/stores/authStore';
import type { MarketplaceListingType } from '../types';

type CreateListingInput = {
  type: MarketplaceListingType;
  productName: string;
  location: string;
  price: number;
  imageUri: string | null;
};

export function useCreateListing() {
  const user = useAuthStore((s) => s.user);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function create(input: CreateListingInput) {
    if (!user) return;
    setIsSubmitting(true);
    try {
      const docId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let imageUrl: string | null = null;
      if (input.imageUri) {
        const blob = await fetch(input.imageUri).then((r) => r.blob());
        imageUrl = await uploadFile(`marketplace/${docId}/${Date.now()}`, blob);
      }
      await addDocument('marketplace_listings', {
        type: input.type,
        posterId: user.id,
        posterName: user.displayName,
        productName: input.productName,
        location: input.location,
        price: input.price,
        imageUrl,
        createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return { create, isSubmitting };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest src/features/marketplace/hooks/__tests__/useCreateListing.test.ts --no-coverage
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/marketplace/hooks/useCreateListing.ts src/features/marketplace/hooks/__tests__/useCreateListing.test.ts
git commit -m "feat: add useCreateListing hook with image upload"
```

---

## Task 4: MarketplaceToggle component

**Files:**
- Create: `src/features/marketplace/components/MarketplaceToggle.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/features/marketplace/components/MarketplaceToggle.tsx
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import type { MarketplaceListingType } from '../types';

type Props = {
  active: MarketplaceListingType;
  onChange: (type: MarketplaceListingType) => void;
};

export function MarketplaceToggle({ active, onChange }: Props) {
  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={[styles.pill, active === 'secondhand' && styles.pillActive]}
        onPress={() => onChange('secondhand')}
        activeOpacity={0.8}
      >
        <Text style={[styles.label, active === 'secondhand' && styles.labelActive]}>2nd Hand</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.pill, active === 'rental' && styles.pillActive]}
        onPress={() => onChange('rental')}
        activeOpacity={0.8}
      >
        <Text style={[styles.label, active === 'rental' && styles.labelActive]}>Equipment Rental</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  pill: {
    backgroundColor: '#2a2a3e',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  pillActive: { backgroundColor: '#cb6ce6' },
  label: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },
  labelActive: { color: '#fff' },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/features/marketplace/components/MarketplaceToggle.tsx
git commit -m "feat: add MarketplaceToggle pill component"
```

---

## Task 5: ListingCard component (2nd hand row)

**Files:**
- Create: `src/features/marketplace/components/ListingCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/features/marketplace/components/ListingCard.tsx
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import type { MarketplaceListing } from '../types';

type Props = {
  listing: MarketplaceListing;
  onPress: () => void;
};

export function ListingCard({ listing, onPress }: Props) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.thumb}>
        {listing.imageUrl ? (
          <Image source={{ uri: listing.imageUrl }} style={styles.image} />
        ) : (
          <Text style={styles.placeholder}>📦</Text>
        )}
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{listing.productName}</Text>
        <Text style={styles.location}>📍 {listing.location}</Text>
      </View>
      <Text style={styles.price}>₪{listing.price.toLocaleString()}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 10,
    marginHorizontal: 16,
    marginVertical: 5,
    borderWidth: 1,
    borderColor: '#ffffff12',
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#2a2a3e',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  image: { width: 44, height: 44 },
  placeholder: { fontSize: 22 },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 3 },
  location: { fontSize: 12, color: 'rgba(255,255,255,0.45)' },
  price: { fontSize: 15, fontWeight: '700', color: '#cb6ce6' },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/features/marketplace/components/ListingCard.tsx
git commit -m "feat: add ListingCard component for 2nd hand listings"
```

---

## Task 6: RentalCard component (rental grid card)

**Files:**
- Create: `src/features/marketplace/components/RentalCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/features/marketplace/components/RentalCard.tsx
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import type { MarketplaceListing } from '../types';

type Props = {
  listing: MarketplaceListing;
  onPress: () => void;
};

export function RentalCard({ listing, onPress }: Props) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.imageWrap}>
        {listing.imageUrl ? (
          <Image source={{ uri: listing.imageUrl }} style={styles.image} resizeMode="cover" />
        ) : (
          <Text style={styles.placeholder}>🎬</Text>
        )}
      </View>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>{listing.productName}</Text>
        <Text style={styles.price}>₪{listing.price.toLocaleString()}/day</Text>
        <Text style={styles.location}>📍 {listing.location}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    overflow: 'hidden',
    margin: 5,
    borderWidth: 1,
    borderColor: '#ffffff12',
  },
  imageWrap: {
    height: 120,
    backgroundColor: '#2a2a3e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { width: '100%', height: 120 },
  placeholder: { fontSize: 36 },
  body: { padding: 8, gap: 2 },
  name: { fontSize: 13, fontWeight: '700', color: '#fff' },
  price: { fontSize: 13, fontWeight: '700', color: '#cb6ce6' },
  location: { fontSize: 11, color: 'rgba(255,255,255,0.45)' },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/features/marketplace/components/RentalCard.tsx
git commit -m "feat: add RentalCard component for rental grid"
```

---

## Task 7: SecondHandList component

**Files:**
- Create: `src/features/marketplace/components/SecondHandList.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/features/marketplace/components/SecondHandList.tsx
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { ListingCard } from './ListingCard';
import { useMarketplaceListings } from '../hooks/useMarketplaceListings';
import type { MarketplaceListing } from '../types';

type Props = {
  searchQuery: string;
  onSelectListing: (listing: MarketplaceListing) => void;
};

export function SecondHandList({ searchQuery, onSelectListing }: Props) {
  const { listings, isLoading } = useMarketplaceListings('secondhand');

  const filtered = listings.filter((l) =>
    l.productName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#cb6ce6" />
      </View>
    );
  }

  if (filtered.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyIcon}>🏷️</Text>
        <Text style={styles.emptyText}>No listings found</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={filtered}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <ListingCard listing={item} onPress={() => onSelectListing(item)} />
      )}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyIcon: { fontSize: 40, marginBottom: 4 },
  emptyText: { fontSize: 15, color: 'rgba(255,255,255,0.5)' },
  list: { paddingVertical: 8, paddingBottom: 100 },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/features/marketplace/components/SecondHandList.tsx
git commit -m "feat: add SecondHandList component"
```

---

## Task 8: RentalGrid component

**Files:**
- Create: `src/features/marketplace/components/RentalGrid.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/features/marketplace/components/RentalGrid.tsx
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { RentalCard } from './RentalCard';
import { useMarketplaceListings } from '../hooks/useMarketplaceListings';
import type { MarketplaceListing } from '../types';

type Props = {
  searchQuery: string;
  onSelectListing: (listing: MarketplaceListing) => void;
};

export function RentalGrid({ searchQuery, onSelectListing }: Props) {
  const { listings, isLoading } = useMarketplaceListings('rental');

  const filtered = listings.filter((l) =>
    l.productName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#cb6ce6" />
      </View>
    );
  }

  if (filtered.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyIcon}>🎬</Text>
        <Text style={styles.emptyText}>No listings found</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={filtered}
      keyExtractor={(item) => item.id}
      numColumns={2}
      renderItem={({ item }) => (
        <RentalCard listing={item} onPress={() => onSelectListing(item)} />
      )}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyIcon: { fontSize: 40, marginBottom: 4 },
  emptyText: { fontSize: 15, color: 'rgba(255,255,255,0.5)' },
  list: { padding: 11, paddingBottom: 100 },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/features/marketplace/components/RentalGrid.tsx
git commit -m "feat: add RentalGrid 2-column component"
```

---

## Task 9: ListingDetailModal component

**Files:**
- Create: `src/features/marketplace/components/ListingDetailModal.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/features/marketplace/components/ListingDetailModal.tsx
import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  Image, Platform, ScrollView,
} from 'react-native';
import { useUiStore } from '@core/stores/uiStore';
import type { MarketplaceListing } from '../types';

type Props = {
  listing: MarketplaceListing | null;
  onClose: () => void;
};

export function ListingDetailModal({ listing, onClose }: Props) {
  const { showToast } = useUiStore();

  if (!listing) return null;

  const priceLabel = listing.type === 'rental'
    ? `₪${listing.price.toLocaleString()}/day`
    : `₪${listing.price.toLocaleString()}`;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[styles.sheet, Platform.OS === 'web' && (webSheet as any)]}>
        <View style={styles.handle} />
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.imageWrap}>
            {listing.imageUrl ? (
              <Image source={{ uri: listing.imageUrl }} style={styles.image} resizeMode="cover" />
            ) : (
              <Text style={styles.imagePlaceholder}>📦</Text>
            )}
          </View>
          <Text style={styles.name}>{listing.productName}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.price}>{priceLabel}</Text>
            <Text style={styles.location}>📍 {listing.location}</Text>
          </View>
          <Text style={styles.poster}>
            Posted by <Text style={styles.posterName}>{listing.posterName}</Text>
          </Text>
          <TouchableOpacity
            style={styles.contactBtn}
            onPress={() => showToast('Feature coming soon', 'info')}
            activeOpacity={0.8}
          >
            <Text style={styles.contactText}>Contact Seller</Text>
          </TouchableOpacity>
        </ScrollView>
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
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)' },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0f0f1f',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#ffffff18',
    padding: 20,
    paddingBottom: 36,
    maxHeight: '85%',
  },
  handle: {
    width: 40, height: 4,
    backgroundColor: '#ffffff33',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  imageWrap: {
    height: 160,
    backgroundColor: '#2a2a3e',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 16,
  },
  image: { width: '100%', height: 160 },
  imagePlaceholder: { fontSize: 52 },
  name: { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 10 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 8 },
  price: { fontSize: 18, fontWeight: '700', color: '#cb6ce6' },
  location: { fontSize: 14, color: 'rgba(255,255,255,0.5)' },
  poster: { fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 20 },
  posterName: { color: '#cb6ce6', fontWeight: '600' },
  contactBtn: {
    backgroundColor: '#cb6ce6',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  contactText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/features/marketplace/components/ListingDetailModal.tsx
git commit -m "feat: add ListingDetailModal bottom sheet"
```

---

## Task 10: PostListingSheet component

**Files:**
- Create: `src/features/marketplace/components/PostListingSheet.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/features/marketplace/components/PostListingSheet.tsx
import { useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, TextInput,
  StyleSheet, Platform, ScrollView, ActivityIndicator, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useCreateListing } from '../hooks/useCreateListing';
import { useUiStore } from '@core/stores/uiStore';
import type { MarketplaceListingType } from '../types';

type Props = {
  visible: boolean;
  initialType: MarketplaceListingType;
  onClose: () => void;
};

export function PostListingSheet({ visible, initialType, onClose }: Props) {
  const { create, isSubmitting } = useCreateListing();
  const { showToast } = useUiStore();
  const [type, setType] = useState<MarketplaceListingType>(initialType);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [productName, setProductName] = useState('');
  const [location, setLocation] = useState('');
  const [price, setPrice] = useState('');

  const canSubmit =
    productName.trim().length > 0 &&
    location.trim().length > 0 &&
    Number(price) > 0 &&
    !isSubmitting;

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as const,
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled) setImageUri(result.assets[0].uri);
  }

  async function handleSubmit() {
    try {
      await create({
        type,
        productName: productName.trim(),
        location: location.trim(),
        price: Number(price),
        imageUri,
      });
      showToast('Listing posted!', 'success');
      setProductName('');
      setLocation('');
      setPrice('');
      setImageUri(null);
      onClose();
    } catch {
      showToast('Failed to post listing', 'error');
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[styles.sheet, Platform.OS === 'web' && (webSheet as any)]}>
        <View style={styles.handle} />
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>Post a Listing</Text>

          <View style={styles.toggle}>
            <TouchableOpacity
              style={[styles.pill, type === 'secondhand' && styles.pillActive]}
              onPress={() => setType('secondhand')}
              activeOpacity={0.8}
            >
              <Text style={[styles.pillLabel, type === 'secondhand' && styles.pillLabelActive]}>
                2nd Hand
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pill, type === 'rental' && styles.pillActive]}
              onPress={() => setType('rental')}
              activeOpacity={0.8}
            >
              <Text style={[styles.pillLabel, type === 'rental' && styles.pillLabelActive]}>
                Rental
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.imagePicker} onPress={pickImage} activeOpacity={0.8}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.previewImage} />
            ) : (
              <>
                <Text style={styles.imagePickerIcon}>📷</Text>
                <Text style={styles.imagePickerLabel}>Upload Photo</Text>
              </>
            )}
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            placeholder="Product name"
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={productName}
            onChangeText={setProductName}
          />
          <TextInput
            style={styles.input}
            placeholder="Location (city)"
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={location}
            onChangeText={setLocation}
          />
          <TextInput
            style={styles.input}
            placeholder={type === 'rental' ? 'Price per day (₪)' : 'Price (₪)'}
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={price}
            onChangeText={setPrice}
            keyboardType="numeric"
          />

          <TouchableOpacity
            style={[styles.submitBtn, !canSubmit && styles.disabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>Post Listing</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
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
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)' },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0f0f1f',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#ffffff18',
    padding: 20,
    paddingBottom: 36,
    maxHeight: '85%',
  },
  handle: {
    width: 40, height: 4,
    backgroundColor: '#ffffff33',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 16 },
  toggle: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  pill: {
    flex: 1,
    backgroundColor: '#2a2a3e',
    borderRadius: 20,
    paddingVertical: 8,
    alignItems: 'center',
  },
  pillActive: { backgroundColor: '#cb6ce6' },
  pillLabel: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },
  pillLabelActive: { color: '#fff' },
  imagePicker: {
    backgroundColor: '#2a2a3e',
    borderRadius: 12,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#ffffff33',
    marginBottom: 12,
    overflow: 'hidden',
  },
  previewImage: { width: '100%', height: 100 },
  imagePickerIcon: { fontSize: 28, marginBottom: 4 },
  imagePickerLabel: { fontSize: 13, color: 'rgba(255,255,255,0.4)' },
  input: {
    backgroundColor: '#2a2a3e',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: '#fff',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ffffff12',
  },
  submitBtn: {
    backgroundColor: '#cb6ce6',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  disabled: { opacity: 0.4 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/features/marketplace/components/PostListingSheet.tsx
git commit -m "feat: add PostListingSheet with image upload and type toggle"
```

---

## Task 11: MarketplaceScreen

**Files:**
- Create: `src/app/(professional)/(tabs)/marketplace/index.tsx`

- [ ] **Step 1: Create the screen**

```tsx
// src/app/(professional)/(tabs)/marketplace/index.tsx
import { useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Screen } from '@components/layout/Screen';
import { MarketplaceToggle } from '@features/marketplace/components/MarketplaceToggle';
import { SecondHandList } from '@features/marketplace/components/SecondHandList';
import { RentalGrid } from '@features/marketplace/components/RentalGrid';
import { ListingDetailModal } from '@features/marketplace/components/ListingDetailModal';
import { PostListingSheet } from '@features/marketplace/components/PostListingSheet';
import type { MarketplaceListing, MarketplaceListingType } from '@features/marketplace/types';

export default function MarketplaceScreen() {
  const [activeTab, setActiveTab] = useState<MarketplaceListingType>('secondhand');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedListing, setSelectedListing] = useState<MarketplaceListing | null>(null);
  const [postSheetVisible, setPostSheetVisible] = useState(false);

  return (
    <Screen scrollable={false} backgroundColor="#0f0f1f">
      <View style={styles.header}>
        <TextInput
          style={styles.searchBar}
          placeholder="Search equipment..."
          placeholderTextColor="rgba(255,255,255,0.3)"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <MarketplaceToggle active={activeTab} onChange={setActiveTab} />
      </View>

      <View style={styles.content}>
        {activeTab === 'secondhand' ? (
          <SecondHandList searchQuery={searchQuery} onSelectListing={setSelectedListing} />
        ) : (
          <RentalGrid searchQuery={searchQuery} onSelectListing={setSelectedListing} />
        )}
      </View>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => setPostSheetVisible(true)}
        activeOpacity={0.8}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

      <ListingDetailModal
        listing={selectedListing}
        onClose={() => setSelectedListing(null)}
      />
      <PostListingSheet
        visible={postSheetVisible}
        initialType={activeTab}
        onClose={() => setPostSheetVisible(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
  },
  searchBar: {
    backgroundColor: '#2a2a3e',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#ffffff12',
  },
  content: { flex: 1 },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#cb6ce6',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#cb6ce6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  fabIcon: { color: '#fff', fontSize: 28, fontWeight: '300', lineHeight: 32 },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(professional)/(tabs)/marketplace/index.tsx
git commit -m "feat: add MarketplaceScreen"
```

---

## Task 12: Register Marketplace tab

**Files:**
- Modify: `src/app/(professional)/(tabs)/_layout.tsx`

- [ ] **Step 1: Add the Marketplace tab to the layout**

In `src/app/(professional)/(tabs)/_layout.tsx`, add a new `<Tabs.Screen>` entry after the `portfolio` screen:

```tsx
// Before (existing tabs):
<Tabs.Screen name="dashboard" options={{ title: 'Dashboard' }} />
<Tabs.Screen name="portfolio" options={{ title: 'Portfolio' }} />
<Tabs.Screen name="bookings" options={{ title: 'Bookings' }} />
<Tabs.Screen name="profile" options={{ title: 'Profile' }} />

// After (add marketplace between portfolio and bookings):
<Tabs.Screen name="dashboard" options={{ title: 'Dashboard' }} />
<Tabs.Screen name="portfolio" options={{ title: 'Portfolio' }} />
<Tabs.Screen name="marketplace" options={{ title: 'Marketplace' }} />
<Tabs.Screen name="bookings" options={{ title: 'Bookings' }} />
<Tabs.Screen name="profile" options={{ title: 'Profile' }} />
```

- [ ] **Step 2: Run the full test suite to confirm nothing is broken**

```bash
npx jest --no-coverage
```

Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git add src/app/(professional)/(tabs)/_layout.tsx
git commit -m "feat: register Marketplace tab in professional layout"
```

---

## Self-Review Checklist

- [x] All spec requirements covered across tasks 1–12
- [x] No TBDs or placeholders
- [x] `MarketplaceListing.price` used consistently throughout all components and hooks
- [x] `posterId`/`posterName` used consistently (not `sellerId`/`ownerId`)
- [x] Firestore collection name `marketplace_listings` consistent across hooks
- [x] `initialType` prop on `PostListingSheet` pre-selects the active tab
- [x] `Contact Seller` shows toast `'Feature coming soon'` — no real contact flow
- [x] Image placeholder renders when `imageUrl` is null in all three image-displaying components
