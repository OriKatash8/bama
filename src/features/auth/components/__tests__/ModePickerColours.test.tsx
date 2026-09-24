import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import type { ReactTestInstance } from 'react-test-renderer';
import { ModePicker } from '../ModePicker';
import { CLIENT_TAB_ACTIVE } from '@core/navigation/floatingTabBar';
import en from '@core/i18n/translations/en.json';

/**
 * THE TWO MODE CARDS' COLOURS.
 *
 * The client card's violet is deliberately a step LIGHTER here than the violet
 * the client tab bar wears: on a white card at this size the darker tone sat
 * heavy. The professional blue is unchanged.
 *
 * The colour appears twice in the component — on the card's text and icon, and
 * in the web pressed-state gradient — so both are asserted. A literal updated
 * in one place and not the other is the failure this guards.
 */

const CLIENT_VIOLET = '#7C3AED';
const PRO_BLUE = '#1D4ED8';

jest.mock('@features/auth/hooks/useSwitchMode', () => ({
  useSwitchMode: () => ({ switchMode: jest.fn() }),
}));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));
jest.mock('expo-image', () => ({ Image: 'Image' }));

/** The card a label sits on: its nearest ancestor carrying a background. */
function card(r: ReturnType<typeof render>, label: string) {
  let node: ReactTestInstance | null = r.getByText(label).parent;
  while (node) {
    const st = StyleSheet.flatten(node.props?.style) as { backgroundColor?: string; background?: string } | undefined;
    if (st && (st.backgroundColor !== undefined || st.background !== undefined)) return { node, st };
    node = node.parent;
  }
  throw new Error(`no card behind "${label}"`);
}

it('writes the client card in a lighter violet than the tab bar wears', () => {
  const r = render(<ModePicker />);

  const text = StyleSheet.flatten(r.getByText(en.mode_picker.client).props.style) as { color?: string };
  expect(text.color).toBe(CLIENT_VIOLET);
  // The point of the change: lighter than the app's client accent, not equal.
  expect(text.color).not.toBe(CLIENT_TAB_ACTIVE);
  expect(lightness(text.color!)).toBeGreaterThan(lightness(CLIENT_TAB_ACTIVE));
});

it('leaves the professional card the blue it already was', () => {
  const r = render(<ModePicker />);

  const text = StyleSheet.flatten(r.getByText(en.mode_picker.professional).props.style) as { color?: string };
  expect(text.color).toBe(PRO_BLUE);
});

it('presses the client card to its own violet, not the tab bar one', () => {
  const r = render(<ModePicker />);
  const { node } = card(r, en.mode_picker.client);

  fireEvent(node, 'pressIn');
  const st = StyleSheet.flatten(r.getByText(en.mode_picker.client).props.style) as { color?: string };
  // Pressed, the card fills and the label flips to white.
  expect(st.color).toBe('#ffffff');
  const fill = StyleSheet.flatten(card(r, en.mode_picker.client).node.props.style) as
    { backgroundColor?: string; background?: string };
  const painted = fill.background ?? fill.backgroundColor ?? '';
  expect(painted).toContain(CLIENT_VIOLET);
  expect(painted).not.toContain(CLIENT_TAB_ACTIVE);
});

it('paints the web pressed gradient from the same two colours', () => {
  const Platform = jest.requireActual('react-native').Platform;
  const was = Platform.OS;
  Platform.OS = 'web';
  try {
    const r = render(<ModePicker />);
    const { node } = card(r, en.mode_picker.client);
    fireEvent(node, 'pressIn');

    const st = StyleSheet.flatten(card(r, en.mode_picker.client).node.props.style) as { background?: string };
    // Both stops come from the constants, so lightening the card cannot leave
    // the gradient behind on the old violet.
    expect(st.background).toContain(CLIENT_VIOLET);
    expect(st.background).toContain(PRO_BLUE);
    expect(st.background).not.toContain(CLIENT_TAB_ACTIVE);
  } finally {
    Platform.OS = was;
  }
});

/** Perceptual-enough lightness for "is this one lighter than that one". */
function lightness(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
}
