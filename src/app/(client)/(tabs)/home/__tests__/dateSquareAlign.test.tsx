import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
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

/** The reserved height of a square's own label, found by its placeholder text. */
function reservedHeight(r: ReturnType<typeof render>, placeholder: string) {
  const s = StyleSheet.flatten(r.getByText(placeholder).props.style) as {
    minHeight?: number; lineHeight?: number;
  };
  return s;
}

const PLACEHOLDERS = [
  en.builder.placeholder_date,
  en.builder.placeholder_deadline,
  en.builder.placeholder_location,
];

it('reserves the same label height in all three squares', () => {
  const r = render(<HomeScreen />);

  const heights = PLACEHOLDERS.map((p) => reservedHeight(r, p).minHeight);
  expect(new Set(heights).size).toBe(1);
  // 0 or undefined would mean "whatever the text needs" — the bug.
  expect(heights[0]).toBeGreaterThan(0);
});

it('reserves the full two lines the labels are capped at', () => {
  const r = render(<HomeScreen />);

  for (const p of PLACEHOLDERS) {
    const { minHeight, lineHeight } = reservedHeight(r, p);
    expect(r.getByText(p).props.numberOfLines).toBe(2);
    // Reserving one line would keep the three equal but still let a wrapped
    // label grow past the reservation, which is the same bug again.
    expect(minHeight).toBe((lineHeight ?? 0) * 2);
  }
});
