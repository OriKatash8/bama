import React from 'react';
import { act, render } from '@testing-library/react-native';
import i18n from '@core/i18n';
import { useSettingsStore } from '@core/stores/settingsStore';
import { LanguageSync } from '../LanguageSync';

/**
 * i18next follows the in-app language switch. The switchers only set the
 * store; LanguageSync used to copy it into i18next once, at mount, so after a
 * switch i18n.language (and everything keyed on it) stayed on the old one.
 */

afterEach(() => {
  act(() => useSettingsStore.getState().setLanguage('he'));
});

it('applies the stored language at mount', () => {
  act(() => useSettingsStore.getState().setLanguage('en'));
  render(<LanguageSync />);
  expect(i18n.language).toBe('en');
});

it('follows every switch after mount', () => {
  act(() => useSettingsStore.getState().setLanguage('he'));
  render(<LanguageSync />);
  expect(i18n.language).toBe('he');
  act(() => useSettingsStore.getState().setLanguage('en'));
  expect(i18n.language).toBe('en');
  act(() => useSettingsStore.getState().setLanguage('he'));
  expect(i18n.language).toBe('he');
});

it('stops following once unmounted', () => {
  act(() => useSettingsStore.getState().setLanguage('he'));
  const r = render(<LanguageSync />);
  r.unmount();
  act(() => useSettingsStore.getState().setLanguage('en'));
  expect(i18n.language).toBe('he');
});
