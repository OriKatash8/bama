import React from 'react';
import { Linking, StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { ClosingTeamCard } from '../ClosingTeamCard';
import { categoryLabel } from '@features/crew/data/categories';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import type { ClosingMember } from '../../types';

/**
 * The closing message in a project chat: every member — the client first — with
 * their role(s) and phone number, tap to call; then BAMA's email, tap to write.
 */

let mockLang: 'he' | 'en' = 'en';
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLang }),
}));

const TEAM: ClosingMember[] = [
  { uid: 'c', name: 'Dana', isClient: true, roles: [], phone: '+972501234567' },
  { uid: 'p1', name: 'Avi', isClient: false, roles: ['Video Photographer', 'Editor'], phone: '+14155552671' },
  { uid: 'p2', name: 'Noa', isClient: false, roles: ['Editor'], phone: null },
];
const EMAIL = 'bama.app.hk@gmail.com';

let open: jest.SpyInstance;
beforeEach(() => {
  mockLang = 'en';
  open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
});
afterEach(() => open.mockRestore());

const renderCard = (closedAs: 'completed' | 'cancelled' = 'completed') =>
  render(<ClosingTeamCard team={TEAM} closedAs={closedAs} contactEmail={EMAIL} />);

it('says the project ended — or was cancelled', () => {
  expect(renderCard().getByText(en.chats.closed_title)).toBeTruthy();
  expect(renderCard('cancelled').getByText(en.chats.cancelled_title)).toBeTruthy();
});

it('lists every member in order, the client labelled as the client, pros with all their roles', () => {
  const r = renderCard();
  expect(r.getAllByTestId(/^closing-member-/).map((n) => n.props.testID))
    .toEqual(['closing-member-c', 'closing-member-p1', 'closing-member-p2']);
  expect(r.getByText(en.chats.closing_client)).toBeTruthy();
  expect(r.getByText(`${categoryLabel('Video Photographer', 'en')} · ${categoryLabel('Editor', 'en')}`)).toBeTruthy();
});

it('shows each number the local way, and tapping it calls', () => {
  const r = renderCard();
  fireEvent.press(r.getByText('050-123-4567'));
  expect(open).toHaveBeenCalledWith('tel:+972501234567');
  expect(r.getByText('+14155552671')).toBeTruthy();
});

it('a member with no number shows a dash that does nothing', () => {
  const r = renderCard();
  expect(r.queryByTestId('closing-phone-p2')).toBeNull();
  expect(r.getByTestId('closing-member-p2').findByProps({ children: '—' })).toBeTruthy();
});

it('ends with BAMA\'s email, and tapping it writes an email', () => {
  const r = renderCard();
  expect(r.getByText(en.chats.closing_contact)).toBeTruthy();
  fireEvent.press(r.getByText(EMAIL));
  expect(open).toHaveBeenCalledWith(`mailto:${EMAIL}`);
});

it('in Hebrew: roles in Hebrew, text aligned right', () => {
  mockLang = 'he';
  const r = renderCard();
  expect(r.getByText(he.chats.closed_title)).toBeTruthy();
  const roles = r.getByText(categoryLabel('Editor', 'he'));
  expect(StyleSheet.flatten(roles.props.style).textAlign).toBe('right');
});
