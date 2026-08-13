# Browse Category Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the subcategory accordion on both browse pages with a flat category list; tapping a category opens a bottom-sheet modal with a pill search bar and a list of professionals for that category.

**Architecture:** Each browse page is rewritten independently — accordion state and subcategory logic removed, replaced with `selectedCategory` + `modalQuery` state driving a React Native `Modal`. `useSearchProfessionals(category)` is called at the component level and already works category-only.

**Tech Stack:** React Native, Expo Router, TypeScript, Firestore via existing hooks

## Global Constraints

- Full TypeScript, no `any`
- `npx tsc --noEmit` must pass zero errors after each task
- Do not touch `useSearchProfessionals`, `useUnifiedSearch`, `ProfessionalCard`, or any marketplace files
- `AI Specialist` entry must be absent from `CATEGORY_IMAGE` (it was removed from `CREW_CATEGORIES` in a prior refactor)

---

## File Map

| File | Change |
|------|--------|
| `src/app/(client)/(tabs)/browse/index.tsx` | Full rewrite of state + JSX — Task 1 |
| `src/app/(professional)/(tabs)/browse/index.tsx` | Full rewrite of state + JSX — Task 2 |

No new files. No shared component (card actions differ between the two pages).

---

## Task 1: Client Browse Page

**Files:**
- Modify: `src/app/(client)/(tabs)/browse/index.tsx`

**What this removes:**
- `expandedCategory` state, `animValues` ref, `toggleCategory` function
- `ViewState` type and `view` state (and all `(view as any)` casts)
- `subResults` / `subLoading` from the top-level `useSearchProfessionals` call
- Animated accordion JSX (chevron, subcategory rows, `Animated.View` blocks)
- `ChevronRight` import and `Animated`/`Easing` imports
- `AI Specialist` entry from `CATEGORY_IMAGE`
- Subcategory branch in `filteredCategories` filter

**What this adds:**
- `selectedCategory: string | null` state
- `modalQuery: string` state
- `useSearchProfessionals(selectedCategory ?? '')` at component level for modal data
- `filteredModalResults` — name-filtered view of modal results
- `Modal` + `FlatList` imports
- Category cards tap directly to `setSelectedCategory(cat.key)` — no accordion
- Bottom-sheet `Modal` JSX with pill search bar + `FlatList` of `ProfessionalCard`

- [ ] **Step 1: Update imports**

Replace the React Native import line and remove unused icon imports:

```tsx
import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal, FlatList,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Search } from 'lucide-react-native';
import { Screen } from '@components/layout/Screen';
import { useTheme } from '@core/hooks/useTheme';
import { CREW_CATEGORIES } from '@features/crew/data/categories';
import { useSearchProfessionals } from '@features/crew/hooks';
import { useUnifiedSearch } from '@features/crew/hooks/useUnifiedSearch';
import { ProfessionalCard } from '@features/crew/components';
import type { ProfessionalResult } from '@features/crew/hooks/useSearchProfessionals';
import { DirectProjectSheet } from '@features/projects/components/DirectProjectSheet';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
import { useUiStore } from '@core/stores/uiStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
```

- [ ] **Step 2: Update `CATEGORY_IMAGE` and `CATEGORIES` constants**

Remove `AI Specialist`. Change `CATEGORIES` to drop `subcategories`:

```tsx
const CATEGORY_IMAGE: Record<string, number> = {
  'Video Photographer': require('../../../../../assets/images/categories/videographer-blue.png'),
  'Still Photographer': require('../../../../../assets/images/categories/blue-cam.png'),
  'Editor':             require('../../../../../assets/images/categories/blue-edit.png'),
  'Graphic Designer':   require('../../../../../assets/images/categories/blue-grafic.png'),
  'Social Media':       require('../../../../../assets/images/categories/blue-social.png'),
  'Studio & Audio':     require('../../../../../assets/images/categories/blue-sound.png'),
  'Lighting Tech':      require('../../../../../assets/images/categories/blue-lightning.png'),
  'Sound Recordist':    require('../../../../../assets/images/categories/blue-mic.png'),
};

const CATEGORIES = Object.keys(CREW_CATEGORIES).map((key) => ({
  key,
  label: key,
  image: CATEGORY_IMAGE[key],
}));
```

- [ ] **Step 3: Replace component state and derived values**

Remove `expandedCategory`, `animValues`, `toggleCategory`, `ViewState`, `view`, `subResults`, `subLoading`. Add:

```tsx
const [query, setQuery] = useState('');
const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
const [modalQuery, setModalQuery] = useState('');

const [sheetProfessionalId, setSheetProfessionalId] = useState<string | null>(null);
const [sheetProfessionalName, setSheetProfessionalName] = useState('');

function openDirectSheet(id: string, name: string) {
  setSheetProfessionalId(id);
  setSheetProfessionalName(name);
}
function closeDirectSheet() {
  setSheetProfessionalId(null);
  setSheetProfessionalName('');
}
function closeModal() {
  setSelectedCategory(null);
  setModalQuery('');
}

const { results: unifiedResults, isLoading: unifiedLoading } = useUnifiedSearch(query);
const { results: modalResults, isLoading: modalLoading } = useSearchProfessionals(
  selectedCategory ?? ''
);

const filteredModalResults: ProfessionalResult[] = modalQuery.trim()
  ? modalResults.filter((r) =>
      r.user.displayName.toLowerCase().includes(modalQuery.toLowerCase())
    )
  : modalResults;

const filteredCategories = query.trim()
  ? CATEGORIES.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()))
  : CATEGORIES;

const isSearching = query.trim().length > 0;
```

- [ ] **Step 4: Replace the JSX return**

Full replacement of the `return (...)` block:

```tsx
return (
  <Screen keyboardShouldPersistTaps="handled" style={{ padding: 0, paddingBottom: 100 }}>
    {/* Header */}
    <View style={styles.header}>
      <Text style={[styles.heading, { ...font.bold }]}>{t('search.heading')}</Text>
    </View>

    {/* Top search bar */}
    <View style={[styles.searchRow, { backgroundColor: '#ffffff', borderColor: colors.border }]}>
      <Search size={18} color={colors.placeholder} strokeWidth={2.5} />
      <TextInput
        style={[styles.searchInput, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}
        placeholder={t('search.placeholder')}
        placeholderTextColor={colors.placeholder}
        value={query}
        onChangeText={setQuery}
        returnKeyType="search"
      />
      {query.length > 0 && (
        <TouchableOpacity onPress={() => setQuery('')} activeOpacity={0.7}>
          <Text style={[styles.clearBtn, { color: colors.textMuted }]}>✕</Text>
        </TouchableOpacity>
      )}
    </View>

    {/* Unified search results */}
    {isSearching ? (
      <View>
        {unifiedLoading && unifiedResults.length === 0 ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
        ) : unifiedResults.length === 0 ? (
          <View style={styles.emptyResults}>
            <Text style={styles.emptyIcon}>👤</Text>
            <Text style={[styles.emptyText, { color: colors.textSec, textAlign: rtl ? 'right' : 'left' }]}>
              {t('search.no_results_title')}
            </Text>
            <Text style={[styles.emptySubtext, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
              {t('search.no_results_subtext', { query: query.trim() })}
            </Text>
          </View>
        ) : (
          unifiedResults.map((item) => (
            <TouchableOpacity
              key={item.user.id}
              style={styles.resultItem}
              onPress={() => router.push(`/browse/profile/${item.user.id}` as never)}
              activeOpacity={0.95}
            >
              <ProfessionalCard
                item={item}
                onDirectProject={() => openDirectSheet(item.user.id, item.user.displayName)}
              />
            </TouchableOpacity>
          ))
        )}
      </View>
    ) : (
      /* Flat category list */
      <View style={styles.listContent}>
        {filteredCategories.map((cat) => (
          <View key={cat.key} style={styles.categoryCard}>
            <TouchableOpacity
              style={styles.categoryCardRow}
              onPress={() => setSelectedCategory(cat.key)}
              activeOpacity={0.7}
            >
              {cat.image && (
                <Image
                  source={cat.image}
                  style={styles.categoryIcon}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  loading="lazy"
                />
              )}
              <Text style={[styles.categoryLabel, { ...font.bold, textAlign: rtl ? 'right' : 'left' }]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          </View>
        ))}
        {filteredCategories.length === 0 && (
          <Text style={{ color: colors.textMuted, textAlign: rtl ? 'right' : 'left', marginTop: 32, ...font.regular }}>
            {t('search.no_categories_match', { query })}
          </Text>
        )}
      </View>
    )}

    {/* Category results modal */}
    <Modal
      visible={selectedCategory !== null}
      transparent
      animationType="slide"
      onRequestClose={closeModal}
    >
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={closeModal}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}} style={[styles.modalSheet, { backgroundColor: '#ffffff' }]}>
          {/* Modal header */}
          <View style={[styles.modalHeader, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
            <Text style={[styles.modalTitle, { ...font.bold }]}>{selectedCategory}</Text>
            <TouchableOpacity onPress={closeModal} hitSlop={12} activeOpacity={0.7}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Pill search bar */}
          <View style={[styles.modalSearchRow, { backgroundColor: '#f5f5f5', borderColor: colors.border }]}>
            <Search size={16} color={colors.placeholder} strokeWidth={2.5} />
            <TextInput
              style={[styles.modalSearchInput, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}
              placeholder={t('search.placeholder')}
              placeholderTextColor={colors.placeholder}
              value={modalQuery}
              onChangeText={setModalQuery}
            />
            {modalQuery.length > 0 && (
              <TouchableOpacity onPress={() => setModalQuery('')} activeOpacity={0.7}>
                <Text style={{ color: colors.textMuted, fontSize: 14 }}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Results */}
          {modalLoading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
          ) : filteredModalResults.length === 0 ? (
            <View style={styles.emptyResults}>
              <Text style={styles.emptyIcon}>👤</Text>
              <Text style={[styles.emptyText, { color: colors.textSec }]}>
                {t('search.no_professionals_yet')}
              </Text>
              <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>
                {t('search.no_professionals_subtext')}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredModalResults}
              keyExtractor={(item) => item.user.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 32 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.resultItem}
                  onPress={() => router.push(`/browse/profile/${item.user.id}` as never)}
                  activeOpacity={0.95}
                >
                  <ProfessionalCard
                    item={item}
                    onDirectProject={() => openDirectSheet(item.user.id, item.user.displayName)}
                  />
                </TouchableOpacity>
              )}
            />
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>

    <DirectProjectSheet
      visible={sheetProfessionalId !== null}
      professionalId={sheetProfessionalId ?? ''}
      professionalName={sheetProfessionalName}
      onClose={closeDirectSheet}
      onSubmitted={() => {
        closeDirectSheet();
        showToast(t('builder.request_submitted'), 'success');
      }}
    />
  </Screen>
);
```

- [ ] **Step 5: Replace the `StyleSheet`**

Remove `subItem`, `subItemText`, `searchHintRow`, `searchHintText`, `resultsHint` styles. Add modal styles:

```tsx
const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  heading: { fontSize: 36, fontWeight: '800', color: '#004aad', textAlign: 'center', textTransform: 'uppercase' },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    marginHorizontal: 16,
    marginBottom: 20,
    paddingHorizontal: 14,
    height: 44,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15 },
  clearBtn: { fontSize: 14, paddingHorizontal: 4 },

  listContent: { alignItems: 'center' },

  categoryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 10,
    width: '100%',
    maxWidth: 600,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'hidden',
  },
  categoryCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    marginRight: 12,
  },
  categoryLabel: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#004aad',
  },

  resultItem: { paddingHorizontal: 16 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingHorizontal: 16,
    maxHeight: '85%',
  },
  modalHeader: {
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#004aad',
    flex: 1,
  },
  modalClose: {
    fontSize: 18,
    color: '#004aad99',
    paddingHorizontal: 4,
  },
  modalSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    marginBottom: 16,
    paddingHorizontal: 14,
    height: 44,
    borderWidth: 1,
    gap: 8,
  },
  modalSearchInput: { flex: 1, fontSize: 15 },

  emptyResults: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 40,
    paddingVertical: 40,
  },
  emptyIcon: { fontSize: 52, marginBottom: 4 },
  emptyText: { fontSize: 18, fontWeight: '700' },
  emptySubtext: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
```

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors. Fix any before committing.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(client\)/\(tabs\)/browse/index.tsx
git commit -m "feat: client browse — flat category list with category results modal"
```

---

## Task 2: Professional Browse Page

**Files:**
- Modify: `src/app/(professional)/(tabs)/browse/index.tsx`

**What this removes:**
- `ResultsView` component (entire inline component)
- `expandedCategory` state, `animValues` ref, `toggleCategory` function
- `ViewState` type and `view` state
- `getSearchTarget` function and `searchTarget` usage
- Animated accordion JSX
- `Animated`, `Easing`, `ScrollView` imports (FlatList stays; Platform import stays if used elsewhere — check and remove if unused)
- Subcategory branch in `filteredCategories`

**What this adds:**
- `selectedCategory: string | null` state
- `modalQuery: string` state
- `useSearchProfessionals(selectedCategory ?? '')` at component level
- `filteredModalResults` — name-filtered + self-filtered results
- `Modal` import
- Flat category rows tap to `setSelectedCategory(cat.key)`
- Bottom-sheet `Modal` with pill search bar + `FlatList` of `ProfessionalCard`

- [ ] **Step 1: Update imports**

```tsx
import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, Modal,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { Search } from 'lucide-react-native';
import { Screen } from '@components/layout/Screen';
import { useTheme } from '@core/hooks/useTheme';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
import { auth } from '@core/firebase/config';
import { CREW_CATEGORIES } from '@features/crew/data/categories';
import { useSearchProfessionals } from '@features/crew/hooks';
import type { ProfessionalResult } from '@features/crew/hooks/useSearchProfessionals';
import { ProfessionalCard } from '@features/crew/components';
import { getOrCreateDM } from '@features/chat/services/chatService';
```

- [ ] **Step 2: Update `CATEGORIES` constant**

```tsx
const CATEGORIES = Object.keys(CREW_CATEGORIES).map((key) => ({
  key,
  label: key,
}));
```

- [ ] **Step 3: Delete `ResultsView` component**

Remove the entire `function ResultsView(...)` block (lines 29–73 in the current file). Its logic moves into the modal.

- [ ] **Step 4: Replace component state and derived values**

Inside `BrowseScreen`, replace all existing state with:

```tsx
const [query, setQuery] = useState('');
const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
const [modalQuery, setModalQuery] = useState('');
const colors = useTheme();
const language = useSettingsStore((s) => s.language);
const font = useAppFont();
const router = useRouter();
const segments = useSegments();
const rtl = language === 'he';

const currentUid = auth.currentUser?.uid;

function closeModal() {
  setSelectedCategory(null);
  setModalQuery('');
}

async function handleMessage(professionalId: string) {
  const currentUserId = auth.currentUser?.uid;
  if (!currentUserId) return;
  const chatId = await getOrCreateDM(currentUserId, professionalId);
  router.push(`/${segments[0]}/(tabs)/chats/${chatId}` as never);
}

const { results: modalResults, isLoading: modalLoading } = useSearchProfessionals(
  selectedCategory ?? ''
);

const filteredModalResults: ProfessionalResult[] = (
  modalQuery.trim()
    ? modalResults.filter((r) =>
        r.user.displayName.toLowerCase().includes(modalQuery.toLowerCase())
      )
    : modalResults
).filter((r) => r.user.id !== currentUid);

const filteredCategories = query.trim()
  ? CATEGORIES.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()))
  : CATEGORIES;
```

- [ ] **Step 5: Replace the JSX return**

```tsx
return (
  <Screen scrollable={false}>
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.heading, { color: colors.text, ...font.bold }]}>
          Browse Professionals
        </Text>
      </View>

      {/* Top search bar */}
      <View style={[styles.searchRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Search size={16} color={colors.placeholder} strokeWidth={2.5} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search by category…"
          placeholderTextColor={colors.placeholder}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} activeOpacity={0.7}>
            <Text style={[styles.clearBtn, { color: colors.textMuted }]}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Flat category list */}
      <FlatList
        data={filteredCategories}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item: cat }) => (
          <TouchableOpacity
            style={[styles.categoryRow, { borderBottomColor: colors.border }]}
            onPress={() => setSelectedCategory(cat.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.categoryLabel, { ...font.bold }]}>{cat.label}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 32, ...font.regular }}>
            No categories match "{query}"
          </Text>
        }
      />
    </View>

    {/* Category results modal */}
    <Modal
      visible={selectedCategory !== null}
      transparent
      animationType="slide"
      onRequestClose={closeModal}
    >
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={closeModal}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}} style={[styles.modalSheet, { backgroundColor: colors.card }]}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { ...font.bold, color: colors.text }]}>
              {selectedCategory}
            </Text>
            <TouchableOpacity onPress={closeModal} hitSlop={12} activeOpacity={0.7}>
              <Text style={[styles.modalClose, { color: colors.textMuted }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Pill search bar */}
          <View style={[styles.modalSearchRow, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
            <Search size={16} color={colors.placeholder} strokeWidth={2.5} />
            <TextInput
              style={[styles.modalSearchInput, { color: colors.text }]}
              placeholder="Search by name…"
              placeholderTextColor={colors.placeholder}
              value={modalQuery}
              onChangeText={setModalQuery}
            />
            {modalQuery.length > 0 && (
              <TouchableOpacity onPress={() => setModalQuery('')} activeOpacity={0.7}>
                <Text style={{ color: colors.textMuted, fontSize: 14 }}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Results */}
          {modalLoading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
          ) : filteredModalResults.length === 0 ? (
            <View style={styles.emptyResults}>
              <Text style={styles.emptyIcon}>👤</Text>
              <Text style={[styles.emptyText, { color: colors.textSec }]}>No professionals yet</Text>
              <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>
                Professionals in this category will appear here once they set up their profile.
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredModalResults}
              keyExtractor={(item) => item.user.id}
              contentContainerStyle={styles.resultsList}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <ProfessionalCard
                  item={item}
                  onMessage={() => handleMessage(item.user.id)}
                />
              )}
            />
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  </Screen>
);
```

- [ ] **Step 6: Replace the `StyleSheet`**

Remove `subList`, `subItem`, `subItemText`, `searchHintRow`, `searchHintText`, `resultsHint` styles. Add modal styles:

```tsx
const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 16 },

  header: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  heading: { fontSize: 22, fontWeight: '800' },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 14,
    height: 44,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15 },
  clearBtn: { fontSize: 14, paddingHorizontal: 4 },

  listContent: { paddingHorizontal: 16, paddingBottom: 100 },

  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
  },
  categoryLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: '#004aad',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingHorizontal: 16,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    flex: 1,
  },
  modalClose: {
    fontSize: 18,
    paddingHorizontal: 4,
  },
  modalSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    marginBottom: 16,
    paddingHorizontal: 14,
    height: 44,
    borderWidth: 1,
    gap: 8,
  },
  modalSearchInput: { flex: 1, fontSize: 15 },

  resultsList: { paddingBottom: 32 },

  emptyResults: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 40,
    paddingVertical: 40,
  },
  emptyIcon: { fontSize: 52, marginBottom: 4 },
  emptyText: { fontSize: 18, fontWeight: '700' },
  emptySubtext: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
```

- [ ] **Step 7: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors. Fix any before committing.

- [ ] **Step 8: Commit**

```bash
git add src/app/\(professional\)/\(tabs\)/browse/index.tsx
git commit -m "feat: professional browse — flat category list with category results modal"
```

---

## Verification Checklist

After both tasks:

1. `npx tsc --noEmit` — zero errors
2. Client browse: grid shows category cards (no subcategory rows, no chevron), tap opens modal with pill search + professional list
3. Professional browse: grid shows plain category rows (no subcategory rows), tap opens modal with pill search + professional list
4. Modal closes on `✕`, overlay tap, or Android back
5. Modal search bar filters by professional name within the category
6. Top search bar (client page) still shows unified name/category results
7. AI Specialist category not visible on client browse (removed from `CREW_CATEGORIES` in prior refactor)
8. No `any` casts anywhere in either file
