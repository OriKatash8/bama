import React from 'react';
import { render } from '@testing-library/react-native';
import { BioSection } from '../BioSection';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));

it('shows the error under the bio and keeps the typed text', () => {
  const r = render(<BioSection bio="call 054-7654321" isEditing error={en.profile.error_no_contact} />);
  expect(r.getByText(en.profile.error_no_contact)).toBeTruthy();
  expect(r.getByDisplayValue('call 054-7654321')).toBeTruthy();
});

it('shows no error when there is none', () => {
  const r = render(<BioSection bio="hello" isEditing />);
  expect(r.queryByText(en.profile.error_no_contact)).toBeNull();
});

it('names both phone numbers and email addresses, in both languages', () => {
  expect(he.profile.error_no_contact).toBe('אסור לפרסם מספר טלפון או כתובת מייל בפרופיל. פרטי קשר מוחלפים אחרי שמתחילים לעבוד יחד בפרויקט.');
  expect(en.profile.error_no_contact).toBe("Phone numbers and email addresses can't be published on your profile. Contact details are shared once you're hired on a project.");
});
