import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { NoticeBoardCard } from '../NoticeBoardCard';
import en from '@core/i18n/translations/en.json';

/**
 * A hidden notice in History is the same card as on the board, but its action is
 * "Restore" instead of "Make offer", and it has no ✕ (it is already hidden).
 */

jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('@core/stores/uiStore', () => ({ useUiStore: (s: (x: { isDark: boolean }) => unknown) => s({ isDark: false }) }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));

const request = {
  id: 'p1', title: 'Squash party clip', clientId: 'c1', status: 'open', description: 'A party',
  location: 'Ashdod', deadline: '2026-09-30', exec: '2026-09-24',
  crewSlots: [{ category: 'Editor', quantity: 1 }], createdAt: { seconds: Math.floor(Date.now() / 1000) - 60 },
} as never;

// The card's buttons stop the tap reaching the card itself, so pass a real-shaped event.
const tap = { stopPropagation: jest.fn() };

function card(extra: Record<string, unknown> = {}) {
  const props = {
    request, poster: { displayName: 'Roi Hamm', photoURL: null },
    onPress: jest.fn(), onApply: jest.fn(), onDismiss: jest.fn(), onMakeOffer: jest.fn(),
    isApplying: false, compact: true, ...extra,
  };
  return { r: render(<NoticeBoardCard {...props} />), props };
}

it('with onRestore: a Restore button instead of Make offer, and no dismiss ✕', () => {
  const onRestore = jest.fn();
  const { r, props } = card({ onRestore });
  expect(r.queryByText(en.noticeboard.make_offer)).toBeNull();
  expect(r.queryByTestId('notice-dismiss')).toBeNull();
  fireEvent.press(r.getByRole('button', { name: en.history.restore }), tap);
  expect(onRestore).toHaveBeenCalledTimes(1);
  expect(props.onPress).not.toHaveBeenCalled();
});

it('without onRestore: unchanged, Make offer and the ✕', () => {
  const { r, props } = card();
  expect(r.queryByRole('button', { name: en.history.restore })).toBeNull();
  expect(r.getByTestId('notice-dismiss')).toBeTruthy();
  fireEvent.press(r.getByText(en.noticeboard.make_offer), tap);
  expect(props.onMakeOffer).toHaveBeenCalledTimes(1);
});
