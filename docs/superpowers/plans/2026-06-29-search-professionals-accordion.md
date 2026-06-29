# Search Professionals Accordion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the icon grid + subcategory modal on the Search Professionals page with an accordion list where tapping a category expands its subcategories inline.

**Architecture:** Single file rewrite of `src/app/(client)/(tabs)/browse/index.tsx`. Remove the modal, animation refs, image grid, and `CATEGORY_META`. Add `expandedCategory` state and render a scrollable accordion list. `ResultsView` and search bar are untouched.

**Tech Stack:** React Native, `LayoutAnimation`, `UIManager`, Expo Router, existing `useTheme` / `useSearchProfessionals` hooks.

## Global Constraints

- Only one category expanded at a time
- `LayoutAnimation.Presets.easeInEaseOut` for expand/collapse animation
- Android requires `UIManager.setLayoutAnimationEnabledExperimental(true)` guarded by `Platform.OS === 'android'`
- All text `fontFamily: 'Montserrat'`, blue `#004aad`
- No new files — single file change only

---

### Task 1: Strip old code and scaffold accordion state

**Files:**
- Modify: `src/app/(client)/(tabs)/browse/index.tsx`

**Interfaces:**
- Produces: `expandedCategory: string | null` state, `toggleCategory(key: string) => void` function used by Task 2

- [ ] **Step 1: Remove unused imports**

Replace the import block at the top of `src/app/(client)/(tabs)/browse/index.tsx` with:

```tsx
import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, FlatList,
  StyleSheet, Platform, LayoutAnimation, UIManager, ActivityIndicator,
} from 'react-native';
import { Screen } from '@components/layout/Screen';
import { useTheme } from '@core/hooks/useTheme';
import { CREW_CATEGORIES } from '@features/crew/data/categories';
import { useSearchProfessionals } from '@features/crew/hooks';
import { ProfessionalCard } from '@features/crew/components';
```

- [ ] **Step 2: Remove CATEGORY_META and simplify CATEGORIES**

Replace `CATEGORY_META` and `CATEGORIES` with:

```tsx
const CATEGORIES = Object.entries(CREW_CATEGORIES).map(([key, subs]) => ({
  key,
  label: key,
  subcategories: subs,
}));
```

- [ ] **Step 3: Enable LayoutAnimation on Android and add expandedCategory state**

Inside `SearchScreen()`, replace the animation refs and modal state with:

```tsx
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

function toggleCategory(key: string) {
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  setExpandedCategory(prev => (prev === key ? null : key));
}
```

Remove these now-unused state declarations:
- `const [selectedCategory, setSelectedCategory] = useState(...)`
- `const [modalVisible, setModalVisible] = useState(false)`
- `const scaleAnim = useRef(...)`
- `const opacityAnim = useRef(...)`
- `const { width } = useWindowDimensions()`
- `const tileSize = ...`

Remove the functions `openCategory` and `closeModal`.

- [ ] **Step 4: Verify no TypeScript errors**

Run: `npx tsc --noEmit`  
Expected: no errors (or only pre-existing unrelated errors)

- [ ] **Step 5: Commit**

```bash
git add "src/app/(client)/(tabs)/browse/index.tsx"
git commit -m "refactor: strip icon grid and modal from search professionals page"
```

---

### Task 2: Implement accordion list UI and new styles

**Files:**
- Modify: `src/app/(client)/(tabs)/browse/index.tsx`

**Interfaces:**
- Consumes: `expandedCategory`, `toggleCategory(key)` from Task 1; `setView` from existing view state; `filteredCategories` from existing search filter logic
- Produces: fully working accordion UI replacing the old grid + modal

- [ ] **Step 1: Replace the grid JSX with accordion list**

Find the `{view.kind === 'grid' && (` block that renders the `ScrollView` with the image grid. Replace it entirely with:

```tsx
{view.kind === 'grid' && (
  <ScrollView
    style={styles.flex}
    contentContainerStyle={styles.listContent}
    showsVerticalScrollIndicator={false}
    keyboardShouldPersistTaps="handled"
  >
    {filteredCategories.map((cat) => (
      <View key={cat.key}>
        <TouchableOpacity
          style={styles.categoryRow}
          onPress={() => toggleCategory(cat.key)}
          activeOpacity={0.7}
        >
          <Text style={styles.categoryLabel}>{cat.label}</Text>
          <Text style={styles.categoryChevron}>
            {expandedCategory === cat.key ? '⌄' : '›'}
          </Text>
        </TouchableOpacity>

        {expandedCategory === cat.key && (
          <View style={styles.subList}>
            {cat.subcategories.map((sub) => (
              <TouchableOpacity
                key={sub}
                style={styles.subItem}
                onPress={() => setView({ kind: 'results', category: cat.key, subcategory: sub })}
                activeOpacity={0.7}
              >
                <Text style={styles.subItemText}>{sub}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    ))}
  </ScrollView>
)}
```

- [ ] **Step 2: Remove the Modal JSX**

Delete the entire `<Modal visible={modalVisible} ...>...</Modal>` block at the bottom of the JSX (after the closing `</View>` of the main container, before the closing `</Screen>`).

- [ ] **Step 3: Replace styles**

Replace the entire `StyleSheet.create({...})` at the bottom of the file with:

```tsx
const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 16 },
  flex: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  heading: { fontSize: 22, fontWeight: '800', textAlign: 'center', flex: 1 },
  backBtn: { width: 60 },
  backText: { fontSize: 15, fontWeight: '600' },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    gap: 8,
  },
  searchIcon: { fontSize: 16 },
  searchInput: { flex: 1, fontSize: 15 },
  clearBtn: { fontSize: 14, paddingHorizontal: 4 },

  listContent: { paddingHorizontal: 16, paddingBottom: 24 },

  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#004aad33',
  },
  categoryLabel: {
    fontSize: 17,
    fontWeight: '700',
    fontFamily: 'Montserrat',
    color: '#004aad',
  },
  categoryChevron: {
    fontSize: 20,
    color: '#004aad',
    fontWeight: '600',
  },

  subList: {
    marginLeft: 16,
    borderLeftWidth: 2,
    borderLeftColor: '#004aad',
    marginBottom: 4,
  },
  subItem: {
    paddingVertical: 12,
    paddingLeft: 16,
    paddingRight: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#004aad22',
  },
  subItemText: {
    fontSize: 15,
    fontWeight: '500',
    fontFamily: 'Montserrat',
    color: '#004aad',
  },

  searchHintRow: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchHintText: { fontSize: 13, fontWeight: '600' },
  resultsList: { paddingHorizontal: 16, paddingBottom: 24 },

  resultsHint: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  emptyResults: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 40,
  },
  emptyIcon: { fontSize: 52, marginBottom: 4 },
  emptyText: { fontSize: 18, fontWeight: '700' },
  emptySubtext: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
```

- [ ] **Step 4: Verify TypeScript**

Run: `npx tsc --noEmit`  
Expected: no new errors

- [ ] **Step 5: Manual verification**

Open the app and navigate to the Search Professionals tab. Verify:
1. No icon grid — a plain list of category names appears
2. Tapping a category reveals its subcategories below with a blue left border
3. Tapping the same category again collapses the subcategories
4. Tapping a different category closes the first and opens the second
5. Tapping a subcategory navigates to the results view
6. The back button returns to the accordion list
7. Typing in the search bar filters the visible categories

- [ ] **Step 6: Commit**

```bash
git add "src/app/(client)/(tabs)/browse/index.tsx"
git commit -m "feat: replace icon grid with accordion category list on search professionals page"
```
