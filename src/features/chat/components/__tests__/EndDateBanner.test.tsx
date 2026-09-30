import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { EndDateBanner } from '../EndDateBanner';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));

const props = { closesOn: '2026-10-07', onEdit: jest.fn(), onDismiss: jest.fn() };

beforeEach(() => jest.clearAllMocks());

it('says when the project closes and that the client can still edit it', () => {
  const r = render(<EndDateBanner {...props} isClient={false} />);
  expect(r.getByText(en.chats.end_date_notice.replace('{{date}}', 'Oct 7'))).toBeTruthy();
});

it('the client can open the end date from the banner', () => {
  const r = render(<EndDateBanner {...props} isClient />);
  fireEvent.press(r.getByText(en.chats.end_date_edit));
  expect(props.onEdit).toHaveBeenCalledTimes(1);
});

it('a professional sees the notice without the edit button', () => {
  const r = render(<EndDateBanner {...props} isClient={false} />);
  expect(r.queryByText(en.chats.end_date_edit)).toBeNull();
});

it('can be dismissed', () => {
  const r = render(<EndDateBanner {...props} isClient={false} />);
  fireEvent.press(r.getByLabelText(en.chats.end_date_dismiss));
  expect(props.onDismiss).toHaveBeenCalledTimes(1);
});

it('has Hebrew copy for every string', () => {
  for (const k of ['end_date_notice', 'end_date_edit', 'end_date_dismiss'] as const) {
    expect(he.chats[k]).toBeTruthy();
  }
  expect(he.chats.end_date_notice).toContain('{{date}}');
});
