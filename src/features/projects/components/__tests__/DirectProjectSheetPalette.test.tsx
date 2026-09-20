import React from 'react';
import { StyleSheet } from 'react-native';
import { render, act } from '@testing-library/react-native';
import { DirectProjectSheet } from '../DirectProjectSheet';
import en from '@core/i18n/translations/en.json';

/**
 * The "tell me about your project" sheet is violet-on-white, not blue: the
 * chrome (submit button, quantity badge, borders) carries the accent and every
 * line of copy is plain black. This is the whole point of the palette, so it is
 * asserted rather than left to a reviewer's eye.
 */

const VIOLET = '#6D28D9';
const BLACK = '#000000';

jest.mock('@core/firebase/firestore', () => ({
  addDocument: jest.fn(),
  getDocument: jest.fn(() => Promise.resolve(null)),
}));
jest.mock('@features/crew/components', () => ({ MiniCalendar: () => null }));
jest.mock('react-native-reanimated', () => require('../../../../testing/reanimatedMock').reanimatedMock());
jest.mock('@components/ui/HelpTooltip', () => ({ HelpTooltip: () => null }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { id: string } }) => unknown) => s({ user: { id: 'client-1' } }),
}));

async function open() {
  const r = render(
    <DirectProjectSheet visible professionalId="pro-1" professionalName="Dana" onClose={jest.fn()} onSubmitted={jest.fn()} />,
  );
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return r;
}

it('writes every section title and the heading in black', async () => {
  const r = await open();

  const copy = [
    r.getByText('Dana'),
    r.getByText(en.builder.title),
    r.getByText(en.builder.tell_us),
    r.getByText(en.builder.select_roles),
  ];
  for (const node of copy) {
    expect(StyleSheet.flatten(node.props.style).color).toBe(BLACK);
  }
});

it('fills the submit button with violet, not blue', async () => {
  const r = await open();

  const label = r.getByText(en.search.tell_us_about_project);
  // Walk up from the label to the first ancestor that paints a fill — that is
  // the button, wherever RN's host tree happens to put the wrapper Views.
  let node = label.parent;
  let fill: unknown;
  while (node && fill === undefined) {
    fill = (StyleSheet.flatten(node.props.style) as { backgroundColor?: string } | undefined)?.backgroundColor;
    node = node.parent;
  }
  expect(fill).toBe(VIOLET);
  expect(StyleSheet.flatten(label.props.style).color).toBe('#fff');
});
