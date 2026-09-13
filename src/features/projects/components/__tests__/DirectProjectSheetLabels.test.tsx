import React from 'react';
import { StyleSheet } from 'react-native';
import { render, act } from '@testing-library/react-native';
import { DirectProjectSheet } from '../DirectProjectSheet';
import en from '@core/i18n/translations/en.json';

/**
 * The "tell me about your project" sheet on Browse: every section title
 * (description, execution, deadline, location, roles) is the same size. The two
 * date titles used to override the shared label to 13px while the others stayed 12px.
 */

jest.mock('@core/firebase/firestore', () => ({
  addDocument: jest.fn(),
  getDocument: jest.fn(() => Promise.resolve(null)),
}));
jest.mock('@features/projects/hooks/useGenerateTitle', () => ({
  useGenerateTitle: () => ({ generateTitle: jest.fn(), isGenerating: false }),
}));
jest.mock('@features/crew/components', () => ({ MiniCalendar: () => null }));
jest.mock('@components/ui/HelpTooltip', () => ({ HelpTooltip: () => null }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { id: string } }) => unknown) => s({ user: { id: 'client-1' } }),
}));

it('renders every section title at one font size', async () => {
  const r = render(
    <DirectProjectSheet visible professionalId="pro-1" professionalName="Dana" onClose={jest.fn()} onSubmitted={jest.fn()} />,
  );
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

  const titles = [
    r.getByText(en.builder.tell_us),
    r.getByText(new RegExp(`^${en.builder.execution}`)),
    r.getByText(en.builder.deadline),
    r.getByText(en.builder.location),
    r.getByText(en.builder.select_roles),
  ];
  const sizes = titles.map((node) => StyleSheet.flatten(node.props.style).fontSize);
  expect(sizes.every((s) => typeof s === 'number')).toBe(true);
  expect(new Set(sizes).size).toBe(1);
});
