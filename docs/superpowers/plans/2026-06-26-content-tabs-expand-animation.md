# ContentTabs Expand-from-Origin Animation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Animate the ContentTabs panel so it scales out from the horizontal position of the tapped tab (left for Equipment, center for Price List, right for Reviews), inline within the scroll view.

**Architecture:** Single file change to `ContentTabs.tsx`. Two `Animated.Value`s (`scaleAnim`, `translateAnim`) animate in parallel. `displayOpen` tracks what is rendered (lags behind `open` during close animation). `panelWidth` is measured via `onLayout` on the tab row. The transform origin is faked: `translateAnim` starts at `(0.5 − originFraction) × panelWidth` and animates to 0 on open; reverses on close.

**Tech Stack:** React Native `Animated` API (already installed), `Easing` from `react-native`, `@testing-library/react-native` for tests.

## Global Constraints

- Only `src/features/profile/components/ContentTabs.tsx` is modified — no changes to child components, profile screen, or any other file.
- `useNativeDriver: true` on all `Animated.timing` calls.
- Open duration: 220 ms, `Easing.out(Easing.ease)`. Close duration: 120 ms, `Easing.in(Easing.ease)`.
- Origin fractions: Equipment = 1/6, Price List = 1/2, Reviews = 5/6.

---

### Task 1: Animate ContentTabs panel with scale-from-origin

**Files:**
- Modify: `src/features/profile/components/ContentTabs.tsx`
- Create: `src/features/profile/components/__tests__/ContentTabs.test.tsx`

**Interfaces:**
- Consumes: existing `ContentTabsProps` (unchanged)
- Produces: same public API, no signature changes

---

- [ ] **Step 1: Create the test file**

Create `src/features/profile/components/__tests__/ContentTabs.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { ContentTabs } from '../ContentTabs';

const baseProps = {
  equipment: ['Sony FX3', 'DJI RS3'],
  priceList: [{ label: 'Day rate', amount: 500, currency: 'USD' }],
  reviews: [],
  isEditing: false,
  onEquipmentChange: jest.fn(),
  onPriceListChange: jest.fn(),
};

describe('ContentTabs', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('renders all three tab buttons', () => {
    const { getByText } = render(<ContentTabs {...baseProps} />);
    expect(getByText('Equipment')).toBeTruthy();
    expect(getByText('Price List')).toBeTruthy();
    expect(getByText('Reviews')).toBeTruthy();
  });

  it('shows equipment panel after tapping Equipment', async () => {
    const { getByText } = render(<ContentTabs {...baseProps} />);
    await act(async () => {
      fireEvent.press(getByText('Equipment'));
      jest.runAllTimers();
    });
    expect(getByText('Sony FX3')).toBeTruthy();
  });

  it('hides panel after tapping active tab again', async () => {
    const { getByText, queryByText } = render(<ContentTabs {...baseProps} />);
    await act(async () => {
      fireEvent.press(getByText('Equipment'));
      jest.runAllTimers();
    });
    await act(async () => {
      fireEvent.press(getByText('Equipment'));
      jest.runAllTimers();
    });
    expect(queryByText('Sony FX3')).toBeNull();
  });

  it('switches content when tapping a different tab', async () => {
    const { getByText, queryByText } = render(<ContentTabs {...baseProps} />);
    await act(async () => {
      fireEvent.press(getByText('Equipment'));
      jest.runAllTimers();
    });
    await act(async () => {
      fireEvent.press(getByText('Price List'));
      jest.runAllTimers();
    });
    expect(queryByText('Sony FX3')).toBeNull();
    expect(getByText('Day rate')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest src/features/profile/components/__tests__/ContentTabs.test.tsx --no-coverage
```

Expected: FAIL — `ContentTabs` renders but tests checking `Sony FX3` or `Day rate` may fail if the panel isn't being rendered (or pass if current implementation already shows content). Either way, confirm the test file runs without a parse error before proceeding.

- [ ] **Step 3: Rewrite ContentTabs.tsx**

Replace the full contents of `src/features/profile/components/ContentTabs.tsx` with:

```tsx
import { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Easing,
} from 'react-native';
import { EquipmentList } from './EquipmentList';
import { PriceList } from './PriceList';
import { ReviewsList } from './ReviewsList';
import type { PriceEntry, Review } from '@core/types/project';

type SectionKey = 'equipment' | 'priceList' | 'reviews';

const SECTIONS: { key: SectionKey; label: string; emoji: string; originFraction: number }[] = [
  { key: 'equipment', label: 'Equipment', emoji: '🎛️', originFraction: 1 / 6 },
  { key: 'priceList', label: 'Price List', emoji: '💰', originFraction: 1 / 2 },
  { key: 'reviews',   label: 'Reviews',    emoji: '⭐', originFraction: 5 / 6 },
];

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
  const [open, setOpen] = useState<SectionKey | null>(null);
  const [displayOpen, setDisplayOpen] = useState<SectionKey | null>(null);
  const [panelWidth, setPanelWidth] = useState(0);
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const translateAnim = useRef(new Animated.Value(0)).current;

  function originOffset(key: SectionKey) {
    const section = SECTIONS.find((s) => s.key === key)!;
    return (0.5 - section.originFraction) * panelWidth;
  }

  function runOpen(key: SectionKey) {
    scaleAnim.setValue(0);
    translateAnim.setValue(originOffset(key));
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(translateAnim, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  }

  function runClose(key: SectionKey, onDone: () => void) {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0,
        duration: 120,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(translateAnim, {
        toValue: originOffset(key),
        duration: 120,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) onDone();
    });
  }

  function toggle(key: SectionKey) {
    scaleAnim.stopAnimation();
    translateAnim.stopAnimation();

    if (open === key) {
      setOpen(null);
      runClose(key, () => setDisplayOpen(null));
    } else if (displayOpen === null) {
      setOpen(key);
      setDisplayOpen(key);
      runOpen(key);
    } else {
      const prev = displayOpen;
      setOpen(key);
      runClose(prev, () => {
        setDisplayOpen(key);
        runOpen(key);
      });
    }
  }

  return (
    <View style={styles.container}>
      <View
        style={styles.row}
        onLayout={(e) => setPanelWidth(e.nativeEvent.layout.width)}
      >
        {SECTIONS.map((section) => {
          const isActive = open === section.key;
          return (
            <TouchableOpacity
              key={section.key}
              style={[
                styles.tab,
                { borderColor: isActive ? '#cb6ce6' : '#ffffff18' },
              ]}
              onPress={() => toggle(section.key)}
              activeOpacity={0.8}
            >
              <Text style={styles.tabEmoji}>{section.emoji}</Text>
              <Text style={[styles.tabLabel, { color: isActive ? '#cb6ce6' : 'rgba(255,255,255,0.5)' }]}>
                {section.label}
              </Text>
              <Text style={[styles.chevron, { color: isActive ? '#cb6ce6' : 'rgba(255,255,255,0.3)' }]}>
                {isActive ? '▲' : '▼'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {displayOpen && (
        <Animated.View
          style={[
            styles.panel,
            { borderColor: '#cb6ce6' },
            { transform: [{ scaleX: scaleAnim }, { translateX: translateAnim }] },
          ]}
        >
          {displayOpen === 'equipment' && (
            <EquipmentList items={equipment} isEditing={isEditing} onChange={onEquipmentChange} />
          )}
          {displayOpen === 'priceList' && (
            <PriceList items={priceList} isEditing={isEditing} onChange={onPriceListChange} />
          )}
          {displayOpen === 'reviews' && <ReviewsList reviews={reviews} />}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 0 },

  row: {
    flexDirection: 'row',
    gap: 8,
  },

  tab: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderWidth: 1.5,
    borderRadius: 14,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    backgroundColor: '#12122a',
  },

  tabEmoji: { fontSize: 18 },
  tabLabel: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  chevron: { fontSize: 9, fontWeight: '700' },

  panel: {
    borderWidth: 1.5,
    borderTopWidth: 0,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    backgroundColor: '#12122a',
    padding: 16,
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest src/features/profile/components/__tests__/ContentTabs.test.tsx --no-coverage
```

Expected: all 4 tests PASS.

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors in `ContentTabs.tsx` or the test file.

- [ ] **Step 6: Commit**

```bash
git add src/features/profile/components/ContentTabs.tsx src/features/profile/components/__tests__/ContentTabs.test.tsx
git commit -m "feat: animate ContentTabs panel with scale-from-origin per tab position"
```
