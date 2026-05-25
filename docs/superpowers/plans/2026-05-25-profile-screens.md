# Profile Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the client profile screen (photo + name, view/edit) and professional profile screen (photo, roles, bio, equipment, price list, reviews, star rating, portfolio grid, view/edit) as specified in `docs/superpowers/specs/2026-05-25-profile-design.md`.

**Architecture:** Both screens share `ProfileHeader` (photo + name). Client profile is minimal — one hook, one component, one screen. Professional profile composes nine components driven by `useProfile` and `usePortfolio` hooks. All Firebase calls go through `@core/firebase/*` helpers; hooks live in `src/features/profile/hooks/`; components in `src/features/profile/components/`.

**Tech Stack:** React Native · Expo Router · TypeScript · Firebase Firestore/Storage · Zustand · expo-image-picker · @testing-library/react-native · Jest

---

## File Map

**New files:**
```
src/features/profile/
  components/
    ProfileHeader.tsx
    RoleChips.tsx
    BioSection.tsx
    StarRating.tsx
    EquipmentList.tsx
    PriceList.tsx
    ReviewsList.tsx
    ContentTabs.tsx
    PortfolioGrid.tsx
  hooks/
    useClientProfile.ts
    useProfile.ts
    usePortfolio.ts
    __tests__/
      useClientProfile.test.ts
      useProfile.test.ts
      usePortfolio.test.ts
```

**Modified files:**
```
src/core/types/project.ts          — add PriceEntry, Review
src/core/types/user.ts             — extend ProfessionalProfile; remove hourlyRate
src/core/firebase/firestore.ts     — add subscribeToCollection, mergeDocument, queryByField
src/features/profile/components/index.ts   — export all components
src/features/profile/hooks/index.ts        — export all hooks
src/app/(client)/(tabs)/profile/index.tsx
src/app/(professional)/(tabs)/profile/index.tsx
```

---

### Task 1: Install expo-image-picker

**Files:** `package.json` (modified by npx expo install)

- [ ] **Step 1: Install the package**

```bash
npx expo install expo-image-picker
```

Expected: package added to `dependencies` in package.json.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install expo-image-picker"
```

---

### Task 2: Extend data types

**Files:**
- Modify: `src/core/types/project.ts`
- Modify: `src/core/types/user.ts`

- [ ] **Step 1: Add PriceEntry and Review to project.ts**

Open `src/core/types/project.ts`. Add these two types at the bottom of the file (after the `Booking` type):

```ts
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
```

- [ ] **Step 2: Update ProfessionalProfile in user.ts**

Open `src/core/types/user.ts`. Replace the existing `ProfessionalProfile` type:

```ts
// BEFORE:
export type ProfessionalProfile = {
  userId: ID;
  roles: MediaRole[];
  bio: string;
  hourlyRate: number | null;
  availability: 'available' | 'busy' | 'unavailable';
  rating: number;
  reviewCount: number;
};

// AFTER:
export type ProfessionalProfile = {
  userId: ID;
  roles: MediaRole[];
  bio: string;
  availability: 'available' | 'busy' | 'unavailable';
  rating: number;
  reviewCount: number;
  equipment: string[];
  priceList: PriceEntry[];
};
```

Also add the import for `PriceEntry` at the top of `user.ts`:

```ts
import type { PriceEntry } from './project';
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/core/types/project.ts src/core/types/user.ts
git commit -m "feat: add PriceEntry, Review types; extend ProfessionalProfile"
```

---

### Task 3: Add Firestore helpers

**Files:**
- Modify: `src/core/firebase/firestore.ts`

Three new helpers are needed:
- `subscribeToCollection` — reactive collection listener (used by `usePortfolio`)
- `mergeDocument` — setDoc with merge:true, creates if missing (used by `useProfile` to write profile sub-doc without overwriting `rating`/`reviewCount`)
- `queryByField` — one-shot equality query wrapper (used by `useProfile` to fetch reviews)

- [ ] **Step 1: Update the imports in firestore.ts**

The file currently imports from `'firebase/firestore'`. Add `where` and `setDoc` (with options) to the import. Replace the existing import block:

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
  where,
  type QueryConstraint,
  type DocumentData,
} from 'firebase/firestore';
import { db } from './config';
```

- [ ] **Step 2: Add the three new helpers at the bottom of firestore.ts**

```ts
export function subscribeToCollection<T>(
  collectionPath: string,
  callback: (data: T[]) => void,
  ...constraints: QueryConstraint[]
): () => void {
  const q =
    constraints.length > 0
      ? query(collection(db, collectionPath), ...constraints)
      : query(collection(db, collectionPath));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T));
  });
}

export async function mergeDocument<T extends DocumentData>(
  path: string,
  data: Partial<T>
): Promise<void> {
  await setDoc(doc(db, path), data as DocumentData, { merge: true });
}

export async function queryByField<T>(
  collectionPath: string,
  field: string,
  value: unknown
): Promise<T[]> {
  return queryDocuments<T>(collectionPath, where(field, '==', value));
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/core/firebase/firestore.ts
git commit -m "feat: add subscribeToCollection, mergeDocument, queryByField helpers"
```

---

### Task 4: ProfileHeader component (shared)

**Files:**
- Create: `src/features/profile/components/ProfileHeader.tsx`

This component is used by both screens. In view mode it shows the avatar and name. In edit mode, the avatar becomes tappable and the name becomes a TextInput.

- [ ] **Step 1: Create the component**

```tsx
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Avatar } from '@components/ui/Avatar';

type ProfileHeaderProps = {
  photoURL: string | null;
  name: string;
  isEditing: boolean;
  onPhotoPress?: () => void;
  onNameChange?: (v: string) => void;
};

export function ProfileHeader({
  photoURL,
  name,
  isEditing,
  onPhotoPress,
  onNameChange,
}: ProfileHeaderProps) {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={isEditing ? onPhotoPress : undefined}
        disabled={!isEditing}
        activeOpacity={0.8}
      >
        <Avatar uri={photoURL} name={name} size={96} />
        {isEditing && (
          <View style={styles.overlay}>
            <Text style={styles.overlayText}>Edit</Text>
          </View>
        )}
      </TouchableOpacity>
      {isEditing ? (
        <TextInput
          style={styles.nameInput}
          value={name}
          onChangeText={onNameChange}
          autoCapitalize="words"
        />
      ) : (
        <Text style={styles.name}>{name}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 12 },
  name: { fontSize: 22, fontWeight: '700', color: '#000' },
  nameInput: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    textAlign: 'center',
    paddingVertical: 4,
    minWidth: 160,
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderBottomLeftRadius: 48,
    borderBottomRightRadius: 48,
    paddingVertical: 4,
  },
  overlayText: { color: '#fff', fontSize: 11, textAlign: 'center', fontWeight: '600' },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/features/profile/components/ProfileHeader.tsx
git commit -m "feat: add shared ProfileHeader component"
```

---

### Task 5: useClientProfile hook (TDD)

**Files:**
- Create: `src/features/profile/hooks/__tests__/useClientProfile.test.ts`
- Create: `src/features/profile/hooks/useClientProfile.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/profile/hooks/__tests__/useClientProfile.test.ts`:

```ts
import { renderHook, act } from '@testing-library/react-native';
import { useClientProfile } from '../useClientProfile';
import { updateDocument } from '@core/firebase/firestore';
import { uploadFile } from '@core/firebase/storage';
import { useAuthStore } from '@core/stores/authStore';

jest.mock('@core/firebase/firestore', () => ({ updateDocument: jest.fn() }));
jest.mock('@core/firebase/storage', () => ({ uploadFile: jest.fn() }));
global.fetch = jest.fn();

const mockUpdateDocument = updateDocument as jest.MockedFunction<typeof updateDocument>;
const mockUploadFile = uploadFile as jest.MockedFunction<typeof uploadFile>;

const mockUser = {
  id: 'u1',
  email: 'test@example.com',
  displayName: 'Old Name',
  photoURL: null,
  role: 'client' as const,
  createdAt: { seconds: 0, nanoseconds: 0 },
};

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: mockUser, role: 'client', isLoading: false });
});

describe('useClientProfile', () => {
  it('saves name without uploading when photoUri is null', async () => {
    mockUpdateDocument.mockResolvedValue(undefined);
    const { result } = renderHook(() => useClientProfile());
    await act(async () => {
      await result.current.save('New Name', null);
    });
    expect(mockUploadFile).not.toHaveBeenCalled();
    expect(mockUpdateDocument).toHaveBeenCalledWith('users/u1', {
      displayName: 'New Name',
      photoURL: null,
    });
  });

  it('uploads photo and saves URL when new photoUri is provided', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      blob: () => Promise.resolve(new Blob()),
    });
    mockUploadFile.mockResolvedValue('https://example.com/photo.jpg');
    mockUpdateDocument.mockResolvedValue(undefined);
    const { result } = renderHook(() => useClientProfile());
    await act(async () => {
      await result.current.save('New Name', 'file://local/photo.jpg');
    });
    expect(mockUploadFile).toHaveBeenCalledWith('avatars/u1', expect.any(Blob));
    expect(mockUpdateDocument).toHaveBeenCalledWith('users/u1', {
      displayName: 'New Name',
      photoURL: 'https://example.com/photo.jpg',
    });
  });

  it('updates authStore user after save', async () => {
    mockUpdateDocument.mockResolvedValue(undefined);
    const { result } = renderHook(() => useClientProfile());
    await act(async () => {
      await result.current.save('New Name', null);
    });
    expect(useAuthStore.getState().user?.displayName).toBe('New Name');
  });

  it('sets error and clears isLoading on save failure', async () => {
    mockUpdateDocument.mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useClientProfile());
    await act(async () => {
      await result.current.save('New Name', null);
    });
    expect(result.current.error).toBe('Network error');
    expect(result.current.isLoading).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npm test -- --testPathPattern=useClientProfile --no-coverage
```

Expected: FAIL — `useClientProfile` module not found.

- [ ] **Step 3: Write the implementation**

Create `src/features/profile/hooks/useClientProfile.ts`:

```ts
import { useState } from 'react';
import { useAuthStore } from '@core/stores/authStore';
import { updateDocument } from '@core/firebase/firestore';
import { uploadFile } from '@core/firebase/storage';

export function useClientProfile() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(name: string, photoUri: string | null): Promise<void> {
    if (!user) return;
    setIsLoading(true);
    setError(null);
    try {
      let photoURL = user.photoURL;
      if (photoUri && photoUri !== user.photoURL) {
        const blob = await fetch(photoUri).then((r) => r.blob());
        photoURL = await uploadFile(`avatars/${user.id}`, blob);
      }
      await updateDocument(`users/${user.id}`, { displayName: name, photoURL });
      setUser({ ...user, displayName: name, photoURL });
    } catch (e: any) {
      setError(e.message ?? 'Failed to save profile');
    } finally {
      setIsLoading(false);
    }
  }

  return { user, isLoading, error, save };
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npm test -- --testPathPattern=useClientProfile --no-coverage
```

Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/profile/hooks/useClientProfile.ts src/features/profile/hooks/__tests__/useClientProfile.test.ts
git commit -m "feat: add useClientProfile hook"
```

---

### Task 6: Client profile screen

**Files:**
- Modify: `src/app/(client)/(tabs)/profile/index.tsx`

- [ ] **Step 1: Replace the stub with the full screen**

```tsx
import { useState, useLayoutEffect } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useNavigation } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Screen } from '@components/layout/Screen';
import { ProfileHeader } from '@features/profile/components/ProfileHeader';
import { useClientProfile } from '@features/profile/hooks/useClientProfile';

export default function ClientProfileScreen() {
  const { user, isLoading, save } = useClientProfile();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user?.displayName ?? '');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const navigation = useNavigation();

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        isEditing ? (
          <View style={styles.headerBtns}>
            <TouchableOpacity onPress={handleCancel} style={styles.headerBtn}>
              <Text style={styles.headerBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} style={styles.headerBtn}>
              <Text style={[styles.headerBtnText, styles.save]}>Save</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={() => setIsEditing(true)} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>Edit</Text>
          </TouchableOpacity>
        ),
    });
  }, [isEditing, name, photoUri]);

  async function handlePhotoPress() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) setPhotoUri(result.assets[0].uri);
  }

  async function handleSave() {
    await save(name, photoUri);
    setIsEditing(false);
    setPhotoUri(null);
  }

  function handleCancel() {
    setName(user?.displayName ?? '');
    setPhotoUri(null);
    setIsEditing(false);
  }

  return (
    <Screen>
      <View style={styles.center}>
        <ProfileHeader
          photoURL={photoUri ?? user?.photoURL ?? null}
          name={name}
          isEditing={isEditing}
          onPhotoPress={handlePhotoPress}
          onNameChange={setName}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', paddingTop: 40 },
  headerBtns: { flexDirection: 'row', gap: 12 },
  headerBtn: { paddingHorizontal: 8 },
  headerBtnText: { fontSize: 16, color: '#000' },
  save: { fontWeight: '700' },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/(client)/(tabs)/profile/index.tsx
git commit -m "feat: build client profile screen"
```

---

### Task 7: RoleChips component

**Files:**
- Create: `src/features/profile/components/RoleChips.tsx`

In view mode renders selected roles as `Badge` components. In edit mode renders all available roles as tappable chip toggles.

- [ ] **Step 1: Create the component**

```tsx
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Badge } from '@components/ui/Badge';
import type { MediaRole } from '@core/types/media';

const ALL_ROLES: MediaRole[] = [
  'photographer',
  'videographer',
  'editor',
  'producer',
  'director',
  'sound_engineer',
  'lighting_technician',
  'makeup_artist',
  'stylist',
];

const ROLE_LABELS: Record<MediaRole, string> = {
  photographer: 'Photographer',
  videographer: 'Videographer',
  editor: 'Editor',
  producer: 'Producer',
  director: 'Director',
  sound_engineer: 'Sound Engineer',
  lighting_technician: 'Lighting Tech',
  makeup_artist: 'Makeup Artist',
  stylist: 'Stylist',
};

type RoleChipsProps = {
  selected: MediaRole[];
  isEditing: boolean;
  onChange?: (roles: MediaRole[]) => void;
};

export function RoleChips({ selected, isEditing, onChange }: RoleChipsProps) {
  function toggle(role: MediaRole) {
    if (!onChange) return;
    onChange(
      selected.includes(role) ? selected.filter((r) => r !== role) : [...selected, role]
    );
  }

  if (!isEditing) {
    return (
      <View style={styles.row}>
        {selected.map((role) => (
          <Badge key={role} label={ROLE_LABELS[role]} />
        ))}
      </View>
    );
  }

  return (
    <View style={styles.row}>
      {ALL_ROLES.map((role) => {
        const active = selected.includes(role);
        return (
          <TouchableOpacity
            key={role}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => toggle(role)}
            activeOpacity={0.7}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {ROLE_LABELS[role]}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  chipActive: { backgroundColor: '#000', borderColor: '#000' },
  chipText: { fontSize: 13, color: '#333' },
  chipTextActive: { color: '#fff' },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/features/profile/components/RoleChips.tsx
git commit -m "feat: add RoleChips component"
```

---

### Task 8: BioSection component

**Files:**
- Create: `src/features/profile/components/BioSection.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { Text, TextInput, StyleSheet } from 'react-native';

type BioSectionProps = {
  bio: string;
  isEditing: boolean;
  onChange?: (v: string) => void;
};

export function BioSection({ bio, isEditing, onChange }: BioSectionProps) {
  if (!isEditing) {
    return <Text style={styles.text}>{bio || 'No bio yet.'}</Text>;
  }
  return (
    <TextInput
      style={styles.input}
      value={bio}
      onChangeText={onChange}
      multiline
      placeholder="Tell clients about yourself..."
      placeholderTextColor="#aaa"
    />
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 15, color: '#444', lineHeight: 22 },
  input: {
    fontSize: 15,
    color: '#444',
    lineHeight: 22,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    minHeight: 100,
    textAlignVertical: 'top',
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/features/profile/components/BioSection.tsx
git commit -m "feat: add BioSection component"
```

---

### Task 9: StarRating component

**Files:**
- Create: `src/features/profile/components/StarRating.tsx`

Always read-only. Shows filled/empty stars proportional to `rating` (double), plus a label with numeric rating and review count.

- [ ] **Step 1: Create the component**

```tsx
import { View, Text, StyleSheet } from 'react-native';

type StarRatingProps = {
  rating: number;
  reviewCount: number;
};

export function StarRating({ rating, reviewCount }: StarRatingProps) {
  return (
    <View style={styles.container}>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Text key={i} style={styles.star}>
            {rating >= i - 0.25 ? '★' : rating >= i - 0.75 ? '⯨' : '☆'}
          </Text>
        ))}
      </View>
      <Text style={styles.label}>
        {rating.toFixed(1)} ({reviewCount} {reviewCount === 1 ? 'review' : 'reviews'})
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 4 },
  stars: { flexDirection: 'row', gap: 2 },
  star: { fontSize: 24, color: '#F4C430' },
  label: { fontSize: 13, color: '#666' },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/features/profile/components/StarRating.tsx
git commit -m "feat: add StarRating component"
```

---

### Task 10: EquipmentList component

**Files:**
- Create: `src/features/profile/components/EquipmentList.tsx`

Renders a list of strings. In edit mode: add via TextInput + "Add" button, remove via × button.

- [ ] **Step 1: Create the component**

```tsx
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';

type EquipmentListProps = {
  items: string[];
  isEditing: boolean;
  onChange?: (items: string[]) => void;
};

export function EquipmentList({ items, isEditing, onChange }: EquipmentListProps) {
  const [input, setInput] = useState('');

  function add() {
    const trimmed = input.trim();
    if (!trimmed || !onChange) return;
    onChange([...items, trimmed]);
    setInput('');
  }

  function remove(index: number) {
    onChange?.(items.filter((_, i) => i !== index));
  }

  return (
    <View style={styles.container}>
      {items.map((item, index) => (
        <View key={index} style={styles.row}>
          <Text style={styles.item}>{item}</Text>
          {isEditing && (
            <TouchableOpacity onPress={() => remove(index)} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <Text style={styles.remove}>×</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}
      {isEditing && (
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Add equipment..."
            placeholderTextColor="#aaa"
            onSubmitEditing={add}
            returnKeyType="done"
          />
          <TouchableOpacity style={styles.addBtn} onPress={add}>
            <Text style={styles.addBtnText}>Add</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  item: { fontSize: 14, color: '#333', flex: 1 },
  remove: { fontSize: 20, color: '#999', paddingHorizontal: 4 },
  inputRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  addBtn: { backgroundColor: '#000', borderRadius: 8, paddingHorizontal: 16, justifyContent: 'center' },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/features/profile/components/EquipmentList.tsx
git commit -m "feat: add EquipmentList component"
```

---

### Task 11: PriceList component

**Files:**
- Create: `src/features/profile/components/PriceList.tsx`

Renders `{ service, price }` entries. In edit mode: add via two TextInputs, remove via × button.

- [ ] **Step 1: Create the component**

```tsx
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import type { PriceEntry } from '@core/types/project';

type PriceListProps = {
  items: PriceEntry[];
  isEditing: boolean;
  onChange?: (items: PriceEntry[]) => void;
};

export function PriceList({ items, isEditing, onChange }: PriceListProps) {
  const [service, setService] = useState('');
  const [price, setPrice] = useState('');

  function add() {
    const trimmedService = service.trim();
    const parsedPrice = parseFloat(price);
    if (!trimmedService || isNaN(parsedPrice) || !onChange) return;
    onChange([...items, { service: trimmedService, price: parsedPrice }]);
    setService('');
    setPrice('');
  }

  function remove(index: number) {
    onChange?.(items.filter((_, i) => i !== index));
  }

  return (
    <View style={styles.container}>
      {items.map((item, index) => (
        <View key={index} style={styles.row}>
          <Text style={styles.service}>{item.service}</Text>
          <View style={styles.right}>
            <Text style={styles.price}>${item.price.toFixed(2)}</Text>
            {isEditing && (
              <TouchableOpacity onPress={() => remove(index)} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <Text style={styles.remove}>×</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ))}
      {isEditing && (
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, styles.serviceInput]}
            value={service}
            onChangeText={setService}
            placeholder="Service"
            placeholderTextColor="#aaa"
          />
          <TextInput
            style={[styles.input, styles.priceInput]}
            value={price}
            onChangeText={setPrice}
            placeholder="Price"
            keyboardType="decimal-pad"
            placeholderTextColor="#aaa"
          />
          <TouchableOpacity style={styles.addBtn} onPress={add}>
            <Text style={styles.addBtnText}>Add</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  service: { fontSize: 14, color: '#333', flex: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  price: { fontSize: 14, fontWeight: '600', color: '#000' },
  remove: { fontSize: 20, color: '#999', paddingHorizontal: 4 },
  inputRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14 },
  serviceInput: { flex: 1 },
  priceInput: { width: 80 },
  addBtn: { backgroundColor: '#000', borderRadius: 8, paddingHorizontal: 16, justifyContent: 'center' },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/features/profile/components/PriceList.tsx
git commit -m "feat: add PriceList component"
```

---

### Task 12: ReviewsList component

**Files:**
- Create: `src/features/profile/components/ReviewsList.tsx`

Always read-only. Renders review cards with author, star rating, body, and date.

- [ ] **Step 1: Create the component**

```tsx
import { View, Text, StyleSheet } from 'react-native';
import type { Review } from '@core/types/project';

type ReviewsListProps = {
  reviews: Review[];
};

export function ReviewsList({ reviews }: ReviewsListProps) {
  if (reviews.length === 0) {
    return <Text style={styles.empty}>No reviews yet.</Text>;
  }
  return (
    <View style={styles.container}>
      {reviews.map((review) => (
        <View key={review.id} style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.author}>{review.authorName}</Text>
            <Text style={styles.stars}>
              {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
            </Text>
          </View>
          <Text style={styles.body}>{review.body}</Text>
          <Text style={styles.date}>
            {new Date(review.createdAt.seconds * 1000).toLocaleDateString()}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  empty: { fontSize: 14, color: '#999', textAlign: 'center', paddingVertical: 16 },
  card: { backgroundColor: '#f9f9f9', borderRadius: 12, padding: 16, gap: 6 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  author: { fontSize: 14, fontWeight: '600', color: '#000' },
  stars: { fontSize: 14, color: '#F4C430' },
  body: { fontSize: 14, color: '#444', lineHeight: 20 },
  date: { fontSize: 12, color: '#999' },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/features/profile/components/ReviewsList.tsx
git commit -m "feat: add ReviewsList component"
```

---

### Task 13: ContentTabs component

**Files:**
- Create: `src/features/profile/components/ContentTabs.tsx`

Pill switcher (Equipment | Price List | Reviews). Swaps content inline. Reviews tab is always read-only even in edit mode.

- [ ] **Step 1: Create the component**

```tsx
import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { EquipmentList } from './EquipmentList';
import { PriceList } from './PriceList';
import { ReviewsList } from './ReviewsList';
import type { PriceEntry, Review } from '@core/types/project';

type Tab = 'equipment' | 'priceList' | 'reviews';

type ContentTabsProps = {
  equipment: string[];
  priceList: PriceEntry[];
  reviews: Review[];
  isEditing: boolean;
  onEquipmentChange?: (items: string[]) => void;
  onPriceListChange?: (items: PriceEntry[]) => void;
};

export function ContentTabs({
  equipment,
  priceList,
  reviews,
  isEditing,
  onEquipmentChange,
  onPriceListChange,
}: ContentTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('equipment');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'equipment', label: 'Equipment' },
    { key: 'priceList', label: 'Price List' },
    { key: 'reviews', label: 'Reviews' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.pills}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.pill, activeTab === tab.key && styles.pillActive]}
            onPress={() => setActiveTab(tab.key)}
            activeOpacity={0.8}
          >
            <Text style={[styles.pillText, activeTab === tab.key && styles.pillTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.content}>
        {activeTab === 'equipment' && (
          <EquipmentList items={equipment} isEditing={isEditing} onChange={onEquipmentChange} />
        )}
        {activeTab === 'priceList' && (
          <PriceList items={priceList} isEditing={isEditing} onChange={onPriceListChange} />
        )}
        {activeTab === 'reviews' && <ReviewsList reviews={reviews} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  pills: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    padding: 4,
    gap: 4,
  },
  pill: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 16 },
  pillActive: { backgroundColor: '#fff' },
  pillText: { fontSize: 13, color: '#666', fontWeight: '500' },
  pillTextActive: { color: '#000', fontWeight: '600' },
  content: {},
});
```

- [ ] **Step 2: Commit**

```bash
git add src/features/profile/components/ContentTabs.tsx
git commit -m "feat: add ContentTabs component"
```

---

### Task 14: PortfolioGrid component

**Files:**
- Create: `src/features/profile/components/PortfolioGrid.tsx`

2-column photo grid. View mode: tap to open full-screen modal. Edit mode: "+" tile to trigger picker, × overlay to delete.

- [ ] **Step 1: Create the component**

```tsx
import { useState } from 'react';
import { View, Image, TouchableOpacity, Text, StyleSheet, Modal, Dimensions } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { MediaAsset } from '@core/types/media';

// Screen component has padding:16 on each side, tiles have gap:8 between them
const TILE_SIZE = (Dimensions.get('window').width - 32 - 8) / 2;

type PortfolioGridProps = {
  assets: MediaAsset[];
  isEditing: boolean;
  onAdd?: (uri: string) => Promise<void>;
  onRemove?: (assetId: string) => Promise<void>;
};

export function PortfolioGrid({ assets, isEditing, onAdd, onRemove }: PortfolioGridProps) {
  const [fullscreenUri, setFullscreenUri] = useState<string | null>(null);

  async function handleAdd() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });
    if (!result.canceled && onAdd) await onAdd(result.assets[0].uri);
  }

  return (
    <View>
      <View style={styles.grid}>
        {isEditing && (
          <TouchableOpacity style={[styles.tile, styles.addTile]} onPress={handleAdd} activeOpacity={0.8}>
            <Text style={styles.addIcon}>+</Text>
          </TouchableOpacity>
        )}
        {assets.map((asset) => (
          <TouchableOpacity
            key={asset.id}
            style={styles.tile}
            onPress={() => !isEditing && setFullscreenUri(asset.url)}
            activeOpacity={isEditing ? 1 : 0.9}
          >
            <Image source={{ uri: asset.url }} style={styles.image} />
            {isEditing && (
              <TouchableOpacity
                style={styles.deleteOverlay}
                onPress={() => onRemove?.(asset.id)}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <Text style={styles.deleteIcon}>×</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        ))}
      </View>
      <Modal
        visible={!!fullscreenUri}
        transparent
        animationType="fade"
        onRequestClose={() => setFullscreenUri(null)}
      >
        <TouchableOpacity
          style={styles.fullscreen}
          onPress={() => setFullscreenUri(null)}
          activeOpacity={1}
        >
          {fullscreenUri && (
            <Image
              source={{ uri: fullscreenUri }}
              style={styles.fullscreenImage}
              resizeMode="contain"
            />
          )}
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
  },
  addTile: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderStyle: 'dashed',
  },
  addIcon: { fontSize: 32, color: '#999' },
  image: { width: '100%', height: '100%' },
  deleteOverlay: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteIcon: { color: '#fff', fontSize: 16, lineHeight: 20 },
  fullscreen: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenImage: { width: '100%', height: '100%' },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/features/profile/components/PortfolioGrid.tsx
git commit -m "feat: add PortfolioGrid component"
```

---

### Task 15: useProfile hook (TDD)

**Files:**
- Create: `src/features/profile/hooks/__tests__/useProfile.test.ts`
- Create: `src/features/profile/hooks/useProfile.ts`

Subscribes to the professional profile sub-document, fetches reviews, and handles save (two writes: base user doc + profile sub-doc).

Profile sub-document path: `users/${uid}/profile/data` (Firestore requires even-segment paths for documents; `profile` is a sub-collection, `data` is the document).

- [ ] **Step 1: Write the failing test**

Create `src/features/profile/hooks/__tests__/useProfile.test.ts`:

```ts
import { renderHook, act } from '@testing-library/react-native';
import { useProfile } from '../useProfile';
import {
  subscribeToDocument,
  updateDocument,
  mergeDocument,
  queryByField,
} from '@core/firebase/firestore';
import { uploadFile } from '@core/firebase/storage';
import { useAuthStore } from '@core/stores/authStore';

jest.mock('@core/firebase/firestore', () => ({
  subscribeToDocument: jest.fn(),
  updateDocument: jest.fn(),
  mergeDocument: jest.fn(),
  queryByField: jest.fn(),
}));
jest.mock('@core/firebase/storage', () => ({ uploadFile: jest.fn() }));
global.fetch = jest.fn();

const mockSubscribeToDocument = subscribeToDocument as jest.MockedFunction<typeof subscribeToDocument>;
const mockUpdateDocument = updateDocument as jest.MockedFunction<typeof updateDocument>;
const mockMergeDocument = mergeDocument as jest.MockedFunction<typeof mergeDocument>;
const mockQueryByField = queryByField as jest.MockedFunction<typeof queryByField>;

const mockUser = {
  id: 'u1',
  email: 'pro@example.com',
  displayName: 'Pro User',
  photoURL: null,
  role: 'professional' as const,
  createdAt: { seconds: 0, nanoseconds: 0 },
};

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: mockUser, role: 'professional', isLoading: false });
  mockSubscribeToDocument.mockImplementation((_path, callback) => {
    callback(null);
    return () => {};
  });
  mockQueryByField.mockResolvedValue([]);
});

describe('useProfile', () => {
  it('subscribes to profile sub-doc at correct path', () => {
    renderHook(() => useProfile());
    expect(mockSubscribeToDocument).toHaveBeenCalledWith(
      'users/u1/profile/data',
      expect.any(Function)
    );
  });

  it('fetches reviews by professionalId', () => {
    renderHook(() => useProfile());
    expect(mockQueryByField).toHaveBeenCalledWith('reviews', 'professionalId', 'u1');
  });

  it('save writes name/photo to base user doc and profile fields to sub-doc', async () => {
    mockUpdateDocument.mockResolvedValue(undefined);
    mockMergeDocument.mockResolvedValue(undefined);
    const { result } = renderHook(() => useProfile());
    await act(async () => {
      await result.current.save({
        name: 'New Name',
        photoUri: null,
        roles: ['photographer'],
        bio: 'My bio',
        equipment: ['Canon R5'],
        priceList: [{ service: 'Half day', price: 500 }],
      });
    });
    expect(mockUpdateDocument).toHaveBeenCalledWith('users/u1', {
      displayName: 'New Name',
      photoURL: null,
    });
    expect(mockMergeDocument).toHaveBeenCalledWith('users/u1/profile/data', {
      roles: ['photographer'],
      bio: 'My bio',
      equipment: ['Canon R5'],
      priceList: [{ service: 'Half day', price: 500 }],
    });
  });

  it('updates authStore after save', async () => {
    mockUpdateDocument.mockResolvedValue(undefined);
    mockMergeDocument.mockResolvedValue(undefined);
    const { result } = renderHook(() => useProfile());
    await act(async () => {
      await result.current.save({
        name: 'New Name',
        photoUri: null,
        roles: [],
        bio: '',
        equipment: [],
        priceList: [],
      });
    });
    expect(useAuthStore.getState().user?.displayName).toBe('New Name');
  });

  it('sets error on save failure', async () => {
    mockUpdateDocument.mockRejectedValue(new Error('Firestore error'));
    const { result } = renderHook(() => useProfile());
    await act(async () => {
      await result.current.save({
        name: 'New Name',
        photoUri: null,
        roles: [],
        bio: '',
        equipment: [],
        priceList: [],
      });
    });
    expect(result.current.error).toBe('Firestore error');
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npm test -- --testPathPattern=useProfile --no-coverage
```

Expected: FAIL — `useProfile` module not found.

- [ ] **Step 3: Write the implementation**

Create `src/features/profile/hooks/useProfile.ts`:

```ts
import { useState, useEffect } from 'react';
import { useAuthStore } from '@core/stores/authStore';
import {
  subscribeToDocument,
  updateDocument,
  mergeDocument,
  queryByField,
} from '@core/firebase/firestore';
import { uploadFile } from '@core/firebase/storage';
import type { ProfessionalProfile } from '@core/types/user';
import type { MediaRole } from '@core/types/media';
import type { PriceEntry, Review } from '@core/types/project';

type SaveFields = {
  name: string;
  photoUri: string | null;
  roles: MediaRole[];
  bio: string;
  equipment: string[];
  priceList: PriceEntry[];
};

export function useProfile() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [profile, setProfile] = useState<ProfessionalProfile | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToDocument<ProfessionalProfile>(
      `users/${user.id}/profile/data`,
      (data) => {
        setProfile(data);
        setIsLoading(false);
      }
    );
    queryByField<Review>('reviews', 'professionalId', user.id).then(setReviews);
    return unsub;
  }, [user?.id]);

  async function save({ name, photoUri, roles, bio, equipment, priceList }: SaveFields) {
    if (!user) return;
    setError(null);
    try {
      let photoURL = user.photoURL;
      if (photoUri && photoUri !== user.photoURL) {
        const blob = await fetch(photoUri).then((r) => r.blob());
        photoURL = await uploadFile(`avatars/${user.id}`, blob);
      }
      await updateDocument(`users/${user.id}`, { displayName: name, photoURL });
      await mergeDocument(`users/${user.id}/profile/data`, {
        roles,
        bio,
        equipment,
        priceList,
      });
      setUser({ ...user, displayName: name, photoURL });
    } catch (e: any) {
      setError(e.message ?? 'Failed to save profile');
    }
  }

  return { user, profile, reviews, isLoading, error, save };
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npm test -- --testPathPattern=useProfile --no-coverage
```

Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/profile/hooks/useProfile.ts src/features/profile/hooks/__tests__/useProfile.test.ts
git commit -m "feat: add useProfile hook"
```

---

### Task 16: usePortfolio hook (TDD)

**Files:**
- Create: `src/features/profile/hooks/__tests__/usePortfolio.test.ts`
- Create: `src/features/profile/hooks/usePortfolio.ts`

Subscribes to `users/${uid}/portfolio` collection in real-time. `upload` fetches blob → uploads to Storage → writes Firestore doc. `remove` deletes from Storage + Firestore.

- [ ] **Step 1: Write the failing test**

Create `src/features/profile/hooks/__tests__/usePortfolio.test.ts`:

```ts
import { renderHook, act } from '@testing-library/react-native';
import { usePortfolio } from '../usePortfolio';
import {
  subscribeToCollection,
  setDocument,
  deleteDocument,
} from '@core/firebase/firestore';
import { uploadFile, deleteFile } from '@core/firebase/storage';
import { useAuthStore } from '@core/stores/authStore';

jest.mock('@core/firebase/firestore', () => ({
  subscribeToCollection: jest.fn(),
  setDocument: jest.fn(),
  deleteDocument: jest.fn(),
}));
jest.mock('@core/firebase/storage', () => ({
  uploadFile: jest.fn(),
  deleteFile: jest.fn(),
}));
global.fetch = jest.fn();

const mockSubscribeToCollection = subscribeToCollection as jest.MockedFunction<typeof subscribeToCollection>;
const mockSetDocument = setDocument as jest.MockedFunction<typeof setDocument>;
const mockDeleteDocument = deleteDocument as jest.MockedFunction<typeof deleteDocument>;
const mockUploadFile = uploadFile as jest.MockedFunction<typeof uploadFile>;
const mockDeleteFile = deleteFile as jest.MockedFunction<typeof deleteFile>;

const mockUser = {
  id: 'u1',
  email: 'pro@example.com',
  displayName: 'Pro User',
  photoURL: null,
  role: 'professional' as const,
  createdAt: { seconds: 0, nanoseconds: 0 },
};

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: mockUser, role: 'professional', isLoading: false });
  mockSubscribeToCollection.mockImplementation((_path, callback) => {
    callback([]);
    return () => {};
  });
});

describe('usePortfolio', () => {
  it('subscribes to portfolio collection at correct path', () => {
    renderHook(() => usePortfolio());
    expect(mockSubscribeToCollection).toHaveBeenCalledWith(
      'users/u1/portfolio',
      expect.any(Function)
    );
  });

  it('upload fetches blob, calls uploadFile, writes Firestore doc', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      blob: () => Promise.resolve(new Blob()),
    });
    mockUploadFile.mockResolvedValue('https://example.com/photo.jpg');
    mockSetDocument.mockResolvedValue(undefined);
    const { result } = renderHook(() => usePortfolio());
    await act(async () => {
      await result.current.upload('file://local/photo.jpg');
    });
    expect(mockUploadFile).toHaveBeenCalledWith(
      expect.stringContaining('portfolio/u1/'),
      expect.any(Blob)
    );
    expect(mockSetDocument).toHaveBeenCalledWith(
      expect.stringContaining('users/u1/portfolio/'),
      expect.objectContaining({ url: 'https://example.com/photo.jpg', type: 'image' })
    );
  });

  it('remove deletes file from storage then document from Firestore', async () => {
    mockDeleteFile.mockResolvedValue(undefined);
    mockDeleteDocument.mockResolvedValue(undefined);
    const { result } = renderHook(() => usePortfolio());
    await act(async () => {
      await result.current.remove('asset123');
    });
    expect(mockDeleteFile).toHaveBeenCalledWith('portfolio/u1/asset123');
    expect(mockDeleteDocument).toHaveBeenCalledWith('users/u1/portfolio/asset123');
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npm test -- --testPathPattern=usePortfolio --no-coverage
```

Expected: FAIL — `usePortfolio` module not found.

- [ ] **Step 3: Write the implementation**

Create `src/features/profile/hooks/usePortfolio.ts`:

```ts
import { useState, useEffect } from 'react';
import { useAuthStore } from '@core/stores/authStore';
import { subscribeToCollection, setDocument, deleteDocument } from '@core/firebase/firestore';
import { uploadFile, deleteFile } from '@core/firebase/storage';
import type { MediaAsset } from '@core/types/media';

export function usePortfolio() {
  const user = useAuthStore((s) => s.user);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToCollection<MediaAsset>(
      `users/${user.id}/portfolio`,
      (data) => {
        setAssets(data.sort((a, b) => b.uploadedAt.seconds - a.uploadedAt.seconds));
        setIsLoading(false);
      }
    );
    return unsub;
  }, [user?.id]);

  async function upload(uri: string): Promise<void> {
    if (!user) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const storagePath = `portfolio/${user.id}/${id}`;
    const blob = await fetch(uri).then((r) => r.blob());
    const url = await uploadFile(storagePath, blob);
    const asset: MediaAsset = {
      id,
      url,
      thumbnailUrl: null,
      type: 'image',
      uploadedAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
    };
    await setDocument(`users/${user.id}/portfolio/${id}`, asset);
  }

  async function remove(assetId: string): Promise<void> {
    if (!user) return;
    await deleteFile(`portfolio/${user.id}/${assetId}`);
    await deleteDocument(`users/${user.id}/portfolio/${assetId}`);
  }

  return { assets, isLoading, upload, remove };
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npm test -- --testPathPattern=usePortfolio --no-coverage
```

Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/profile/hooks/usePortfolio.ts src/features/profile/hooks/__tests__/usePortfolio.test.ts
git commit -m "feat: add usePortfolio hook"
```

---

### Task 17: Professional profile screen

**Files:**
- Modify: `src/app/(professional)/(tabs)/profile/index.tsx`

Wires all components together. Opens in edit mode on first visit (when `uiStore.isNewProfessional` is true).

- [ ] **Step 1: Replace the stub with the full screen**

```tsx
import { useState, useEffect, useLayoutEffect } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useNavigation } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Screen } from '@components/layout/Screen';
import { ProfileHeader } from '@features/profile/components/ProfileHeader';
import { RoleChips } from '@features/profile/components/RoleChips';
import { BioSection } from '@features/profile/components/BioSection';
import { ContentTabs } from '@features/profile/components/ContentTabs';
import { StarRating } from '@features/profile/components/StarRating';
import { PortfolioGrid } from '@features/profile/components/PortfolioGrid';
import { useProfile } from '@features/profile/hooks/useProfile';
import { usePortfolio } from '@features/profile/hooks/usePortfolio';
import { useUiStore } from '@core/stores/uiStore';
import type { MediaRole } from '@core/types/media';
import type { PriceEntry } from '@core/types/project';

export default function ProfessionalProfileScreen() {
  const { user, profile, reviews, isLoading, save } = useProfile();
  const { assets, upload, remove } = usePortfolio();
  const { isNewProfessional, setNewProfessional } = useUiStore();
  const navigation = useNavigation();

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [roles, setRoles] = useState<MediaRole[]>([]);
  const [bio, setBio] = useState('');
  const [equipment, setEquipment] = useState<string[]>([]);
  const [priceList, setPriceList] = useState<PriceEntry[]>([]);

  useEffect(() => {
    if (isNewProfessional) {
      setIsEditing(true);
      setNewProfessional(false);
    }
  }, []);

  useEffect(() => {
    if (user) setName(user.displayName);
  }, [user?.displayName]);

  useEffect(() => {
    if (profile) {
      setRoles(profile.roles);
      setBio(profile.bio);
      setEquipment(profile.equipment);
      setPriceList(profile.priceList);
    }
  }, [profile]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        isEditing ? (
          <View style={styles.headerBtns}>
            <TouchableOpacity onPress={handleCancel} style={styles.headerBtn}>
              <Text style={styles.headerBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} style={styles.headerBtn}>
              <Text style={[styles.headerBtnText, styles.save]}>Save</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={() => setIsEditing(true)} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>Edit</Text>
          </TouchableOpacity>
        ),
    });
  }, [isEditing, name, photoUri, roles, bio, equipment, priceList]);

  async function handlePhotoPress() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) setPhotoUri(result.assets[0].uri);
  }

  async function handleSave() {
    await save({ name, photoUri, roles, bio, equipment, priceList });
    setIsEditing(false);
    setPhotoUri(null);
  }

  function handleCancel() {
    if (user) setName(user.displayName);
    if (profile) {
      setRoles(profile.roles);
      setBio(profile.bio);
      setEquipment(profile.equipment);
      setPriceList(profile.priceList);
    }
    setPhotoUri(null);
    setIsEditing(false);
  }

  if (isLoading) return null;

  return (
    <Screen style={styles.content}>
      <ProfileHeader
        photoURL={photoUri ?? user?.photoURL ?? null}
        name={name}
        isEditing={isEditing}
        onPhotoPress={handlePhotoPress}
        onNameChange={setName}
      />
      <RoleChips selected={roles} isEditing={isEditing} onChange={setRoles} />
      <BioSection bio={bio} isEditing={isEditing} onChange={setBio} />
      <ContentTabs
        equipment={equipment}
        priceList={priceList}
        reviews={reviews}
        isEditing={isEditing}
        onEquipmentChange={setEquipment}
        onPriceListChange={setPriceList}
      />
      <StarRating rating={profile?.rating ?? 0} reviewCount={profile?.reviewCount ?? 0} />
      <PortfolioGrid assets={assets} isEditing={isEditing} onAdd={upload} onRemove={remove} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 24 },
  headerBtns: { flexDirection: 'row', gap: 12 },
  headerBtn: { paddingHorizontal: 8 },
  headerBtnText: { fontSize: 16, color: '#000' },
  save: { fontWeight: '700' },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/(professional)/(tabs)/profile/index.tsx
git commit -m "feat: build professional profile screen"
```

---

### Task 18: Update barrel exports and run all tests

**Files:**
- Modify: `src/features/profile/components/index.ts`
- Modify: `src/features/profile/hooks/index.ts`

- [ ] **Step 1: Update components barrel**

Replace `src/features/profile/components/index.ts` with:

```ts
export { ProfileHeader } from './ProfileHeader';
export { RoleChips } from './RoleChips';
export { BioSection } from './BioSection';
export { StarRating } from './StarRating';
export { EquipmentList } from './EquipmentList';
export { PriceList } from './PriceList';
export { ReviewsList } from './ReviewsList';
export { ContentTabs } from './ContentTabs';
export { PortfolioGrid } from './PortfolioGrid';
```

- [ ] **Step 2: Update hooks barrel**

Replace `src/features/profile/hooks/index.ts` with:

```ts
export { useClientProfile } from './useClientProfile';
export { useProfile } from './useProfile';
export { usePortfolio } from './usePortfolio';
```

- [ ] **Step 3: Run the full test suite**

```bash
npm test -- --no-coverage
```

Expected: all tests pass, no failures.

- [ ] **Step 4: Commit**

```bash
git add src/features/profile/components/index.ts src/features/profile/hooks/index.ts
git commit -m "feat: export profile components and hooks from barrels"
```
