import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { ModerationGate } from '../ModerationGate';
import { useModerationStore } from '@core/stores/moderationStore';
import en from '@core/i18n/translations/en.json';

/** The warning's button marks it seen; closing it any other way does not. */

jest.mock('@core/firebase/firestore', () => ({ updateDocument: jest.fn(() => Promise.resolve()) }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));

const acknowledge = jest.fn(() => Promise.resolve());
beforeEach(() => {
  jest.clearAllMocks();
  useModerationStore.setState({ notice: { status: 'warned', reason: 'Spam', actionId: 'act-1' }, acknowledge });
});

it('shows the warning and its reason', () => {
  const r = render(<ModerationGate />);
  expect(r.getByText(en.moderation.warned_title)).toBeTruthy();
  expect(r.getByText('Spam')).toBeTruthy();
});

it('the button marks the warning as seen', async () => {
  const r = render(<ModerationGate />);
  await act(async () => { fireEvent.press(r.getByText(en.moderation.acknowledge)); });
  expect(acknowledge).toHaveBeenCalledTimes(1);
});

it('closing it with Android back does not mark it seen', () => {
  const r = render(<ModerationGate />);
  act(() => { r.UNSAFE_getByType(require('react-native').Modal).props.onRequestClose(); });
  expect(acknowledge).not.toHaveBeenCalled();
  expect(useModerationStore.getState().notice).toBeNull();
});
