import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import type { ReactTestInstance } from 'react-test-renderer';
import HomeScreen from '../index';
import en from '@core/i18n/translations/en.json';

/**
 * THE THREE SQUARES' ICONS SIT ON ONE LINE.
 *
 * Each square centres a column of [icon, label]. The label is capped at two
 * lines but used to claim only the height it needed, so on a phone — narrow
 * enough that one label wraps and its neighbour does not — the taller square
 * centred its icon higher than the others. A desktop browser never showed it:
 * at that width nothing wraps, so every label was one line and the icons
 * happened to agree.
 *
 * Reserving the full two lines is what makes the content heights equal, and
 * equal content heights are what put the icons on one line.
 */

jest.mock('@features/crew/hooks', () => ({
  useCrewBuilder: () => ({
    slots: [], totalCount: 0, roleQuantity: () => 0, slotCaps: () => [],
    setQuantity: jest.fn(), setSlotCapability: jest.fn(), removeCategory: jest.fn(), loadSlots: jest.fn(),
  }),
}));
jest.mock('@features/crew/components', () => ({ MiniCalendar: 'MiniCalendar' }));
// The squares are PressableScale, which pulls in Reanimated.
jest.mock('react-native-reanimated', () => require('../../../../../testing/reanimatedMock').reanimatedMock());
jest.mock('@components/layout/Screen', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useLocalSearchParams: () => ({}) }));
jest.mock('@core/firebase/firestore', () => ({ getDocument: jest.fn() }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));
jest.mock('@core/haptics', () => ({
  tapFeedback: jest.fn(), commitFeedback: jest.fn(), warnFeedback: jest.fn(),
}));

/** A label's own text style, found by its placeholder. */
function labelStyle(r: ReturnType<typeof render>, placeholder: string) {
  return StyleSheet.flatten(r.getByText(placeholder).props.style) as { lineHeight?: number };
}

/**
 * The box that RESERVES the label's height, i.e. the label's nearest ancestor
 * carrying a fixed height. The reservation lives on the box rather than the
 * Text so the text can be centred inside it.
 */
function labelBox(r: ReturnType<typeof render>, placeholder: string) {
  let node: ReactTestInstance | null = r.getByText(placeholder).parent;
  while (node) {
    const st = StyleSheet.flatten(node.props?.style) as { height?: number; justifyContent?: string } | undefined;
    if (typeof st?.height === 'number') return st;
    node = node.parent;
  }
  throw new Error(`no height-reserving box above "${placeholder}"`);
}

const PLACEHOLDERS = [
  en.builder.placeholder_date,
  en.builder.placeholder_deadline,
  en.builder.placeholder_location,
];

it('reserves the same label height in all three squares', () => {
  const r = render(<HomeScreen />);

  const heights = PLACEHOLDERS.map((p) => labelBox(r, p).height);
  expect(new Set(heights).size).toBe(1);
  // 0 or undefined would mean "whatever the text needs" — the bug.
  expect(heights[0]).toBeGreaterThan(0);
});

it('centres the label inside its reservation, so the square looks centred', () => {
  const r = render(<HomeScreen />);

  for (const p of PLACEHOLDERS) {
    // Painted at the TOP of the reservation, a one-line label leaves its dead
    // second line below it and the visible content rides 8pt high.
    expect(labelBox(r, p).justifyContent).toBe('center');
  }
});

/** The square itself: the label box's nearest ancestor that pads and centres. */
function square(r: ReturnType<typeof render>, placeholder: string) {
  let node: ReactTestInstance | null = r.getByText(placeholder).parent;
  while (node) {
    const st = StyleSheet.flatten(node.props?.style) as
      { paddingTop?: number; paddingBottom?: number; minHeight?: number } | undefined;
    if (typeof st?.minHeight === 'number' && typeof st?.paddingTop === 'number') return st;
    node = node.parent;
  }
  throw new Error(`no square above "${placeholder}"`);
}

it('pads the square top-heavy, to offset the label\'s empty second line', () => {
  const r = render(<HomeScreen />);

  for (const p of PLACEHOLDERS) {
    const { paddingTop, paddingBottom } = square(r, p);
    // Half the reservation sits between icon and text and half below it, so
    // the visible block still hangs high until the difference moves to the top.
    expect(paddingTop).toBeGreaterThan(paddingBottom ?? 0);
    // The pair must still sum to what it was, or the square changes height.
    expect((paddingTop ?? 0) + (paddingBottom ?? 0)).toBe(24);
  }
});

it('reserves the full two lines the labels are capped at', () => {
  const r = render(<HomeScreen />);

  for (const p of PLACEHOLDERS) {
    const { lineHeight } = labelStyle(r, p);
    expect(r.getByText(p).props.numberOfLines).toBe(2);
    // Reserving one line would keep the three equal but still let a wrapped
    // label grow past the reservation, which is the same bug again.
    expect(labelBox(r, p).height).toBe((lineHeight ?? 0) * 2);
  }
});
