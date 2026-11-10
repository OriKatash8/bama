import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { MessageInfoSheet } from '../MessageInfoSheet';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

let mockLang = 'en';
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLang }),
}));

const names = { me: 'Me', a: 'Avi', b: 'Bella' };
const base = {
  visible: true, onClose: jest.fn(), preview: 'see you at 9', currentUserId: 'me',
  names, photos: { a: 'https://x.invalid/a.jpg' }, colorFor: () => '#123456',
};

beforeEach(() => { mockLang = 'en'; base.onClose.mockClear(); });

it('lists who has seen it and who has not', () => {
  const r = render(<MessageInfoSheet {...base} seenBy={['a']} notSeen={['b']} />);
  expect(r.getByText(en.read_receipts.seen_by)).toBeTruthy();
  expect(r.getByText(en.read_receipts.not_seen)).toBeTruthy();
  expect(r.getByTestId('info-person-a')).toBeTruthy();
  expect(r.getByTestId('info-person-b')).toBeTruthy();
  expect(r.getByText('see you at 9')).toBeTruthy();
});

it('never lists me, in either list', () => {
  const r = render(<MessageInfoSheet {...base} seenBy={['me', 'a']} notSeen={['me', 'b']} />);
  expect(r.queryByTestId('info-person-me')).toBeNull();
  expect(r.getByTestId('info-person-a')).toBeTruthy();
  expect(r.getByTestId('info-person-b')).toBeTruthy();
});

it('shows an empty state when no one has seen it yet', () => {
  const r = render(<MessageInfoSheet {...base} seenBy={[]} notSeen={['a', 'b']} />);
  expect(r.getByTestId('message-info-nobody')).toBeTruthy();
  expect(r.getByText(en.read_receipts.nobody_seen)).toBeTruthy();
  expect(r.getByTestId('info-person-a')).toBeTruthy(); // still listed under "Not seen yet"
});

it('an empty state, not an empty list, even when it is only me', () => {
  const r = render(<MessageInfoSheet {...base} seenBy={['me']} notSeen={[]} />);
  expect(r.getByTestId('message-info-nobody')).toBeTruthy();
  expect(r.queryByText(en.read_receipts.not_seen)).toBeNull();
});

it('hides "Not seen yet" once everyone has seen it', () => {
  const r = render(<MessageInfoSheet {...base} seenBy={['a', 'b']} notSeen={[]} />);
  expect(r.queryByText(en.read_receipts.not_seen)).toBeNull();
  expect(r.queryByTestId('message-info-nobody')).toBeNull();
});

it('updates live as the lists change', () => {
  const r = render(<MessageInfoSheet {...base} seenBy={[]} notSeen={['a']} />);
  expect(r.getByTestId('message-info-nobody')).toBeTruthy();
  r.rerender(<MessageInfoSheet {...base} seenBy={['a']} notSeen={[]} />);
  expect(r.queryByTestId('message-info-nobody')).toBeNull();
});

it('closes from the Close button and the backdrop', () => {
  const r = render(<MessageInfoSheet {...base} seenBy={[]} notSeen={[]} />);
  fireEvent.press(r.getByTestId('message-info-close'));
  fireEvent.press(r.getByTestId('message-info-backdrop'));
  expect(base.onClose).toHaveBeenCalledTimes(2);
});

it('reads in Hebrew with the exact strings', () => {
  mockLang = 'he';
  const r = render(<MessageInfoSheet {...base} seenBy={['a']} notSeen={['b']} />);
  expect(he.read_receipts.message_info).toBe('פרטי הודעה');
  expect(he.read_receipts.seen_by).toBe('נצפה על ידי');
  expect(he.read_receipts.not_seen).toBe('טרם נצפה');
  expect(r.getByText('פרטי הודעה')).toBeTruthy();
  expect(r.getByText('נצפה על ידי')).toBeTruthy();
  expect(r.getByText('טרם נצפה')).toBeTruthy();
});
