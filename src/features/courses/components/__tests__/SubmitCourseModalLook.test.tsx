import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import type { ReactTestInstance } from 'react-test-renderer';
import { SubmitCourseModal } from '../SubmitCourseModal';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

/**
 * "Add your course": every text is black (buttons keep white on blue), and the
 * difficulty is marked optional — it was always optional, but nothing said so.
 */

jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(), MediaTypeOptions: { Images: 'Images' },
}));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(), addDoc: jest.fn(), serverTimestamp: jest.fn(),
}));
jest.mock('@core/firebase/config', () => ({ db: {} }));
jest.mock('@core/firebase/storage', () => ({ uploadFile: jest.fn() }));
let mockLanguage = 'en';
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLanguage }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { id: string; displayName: string } }) => unknown) =>
    s({ user: { id: 'u1', displayName: 'Ori' } }),
}));

const color = (el: ReactTestInstance) =>
  (StyleSheet.flatten(el.props.style) as { color?: string }).color;

function open(language: 'en' | 'he' = 'en') {
  mockLanguage = language;
  return render(<SubmitCourseModal visible onClose={jest.fn()} onSubmitted={jest.fn()} />);
}

it('the title and every field label are black', () => {
  const r = open();
  for (const label of [en.courses.add_your_course, `${en.courses.course_title_label} *`, en.courses.price_label]) {
    expect(color(r.getByText(label))).toBe('#000000');
  }
});

it('typed text and the difficulty choices are black', () => {
  const r = open();
  expect(color(r.getByText(en.courses.level_beginner))).toBe('#000000');
  const input = r.UNSAFE_getAllByType(require('react-native').TextInput)[0];
  expect(StyleSheet.flatten(input.props.style).color).toBe('#000000');
});

it('a chosen difficulty keeps white text on its blue pill', () => {
  const r = open();
  fireEvent.press(r.getByText(en.courses.level_beginner));
  expect(color(r.getByText(en.courses.level_beginner))).toBe('#fff');
});

it('marks the difficulty optional, in both languages', () => {
  expect(open('en').getByText(`${en.courses.level_label} ${en.builder.optional_note}`)).toBeTruthy();
  const esc = (x: string) => x.replace(/[()]/g, '\\$&');
  expect(open('he').getByText(new RegExp(`${esc(he.courses.level_label)} ${esc(he.builder.optional_note)}`))).toBeTruthy();
});

it('the cover picture says "לא חובה" in Hebrew, like the difficulty', () => {
  expect(he.courses.cover_image_label).toBe('תמונת כיסוי (לא חובה)');
});
