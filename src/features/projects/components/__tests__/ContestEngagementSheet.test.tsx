import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ContestEngagementSheet } from '../ContestEngagementSheet';
import en from '@core/i18n/translations/en.json';

jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (selector: (s: { language: string }) => unknown) =>
    selector({ language: 'en' }),
}));

/**
 * NO DEFAULT REASON. `didnt_happen` voids the fee and `amount_disputed` holds it
 * for an admin — opposite outcomes in different queues — so a preselected option
 * hands the professional the cheaper branch without them having chosen it. The
 * server refuses an absent reason with invalid-argument; these assert the UI
 * cannot produce one, and cannot quietly grow a default later.
 */
describe('ContestEngagementSheet', () => {
  const base = {
    visible: true,
    projectTitle: 'Three-camera shoot',
    submitting: false,
    onConfirm: jest.fn(),
    onClose: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('offers both reasons, with the consequence of each beside it', () => {
    const { getByText } = render(<ContestEngagementSheet {...base} />);
    getByText(en.engagement.contest_didnt_happen);
    getByText(en.engagement.contest_didnt_happen_note);
    getByText(en.engagement.contest_amount);
    getByText(en.engagement.contest_amount_note);
  });

  it('selects NEITHER on open', () => {
    // Queried by role, not by walking up from the label: `.parent` lands on a
    // wrapper that carries no accessibilityState, so that version of this test
    // passed against an injected default and proved nothing.
    const { getAllByRole } = render(<ContestEngagementSheet {...base} />);
    const options = getAllByRole('radio');
    expect(options).toHaveLength(2);
    expect(options.map((o) => o.props.accessibilityState?.selected)).toEqual([false, false]);
  });

  it('sends nothing while no reason is chosen', () => {
    const { getByText } = render(<ContestEngagementSheet {...base} />);
    fireEvent.press(getByText(en.engagement.contest_confirm));
    expect(base.onConfirm).not.toHaveBeenCalled();
  });

  it('sends didnt_happen only after it is chosen', () => {
    const { getByText } = render(<ContestEngagementSheet {...base} />);
    fireEvent.press(getByText(en.engagement.contest_didnt_happen));
    fireEvent.press(getByText(en.engagement.contest_confirm));
    expect(base.onConfirm).toHaveBeenCalledWith('didnt_happen', '');
  });

  it('sends amount_disputed only after it is chosen', () => {
    const { getByText } = render(<ContestEngagementSheet {...base} />);
    fireEvent.press(getByText(en.engagement.contest_amount));
    fireEvent.press(getByText(en.engagement.contest_confirm));
    expect(base.onConfirm).toHaveBeenCalledWith('amount_disputed', '');
  });

  it('passes the note along, trimmed', () => {
    const { getByText, getByPlaceholderText } = render(<ContestEngagementSheet {...base} />);
    fireEvent.press(getByText(en.engagement.contest_amount));
    fireEvent.changeText(getByPlaceholderText(en.engagement.contest_note_placeholder), '  it was 3000 not 4000  ');
    fireEvent.press(getByText(en.engagement.contest_confirm));
    expect(base.onConfirm).toHaveBeenCalledWith('amount_disputed', 'it was 3000 not 4000');
  });

  it('bounds the note where the server truncates it', () => {
    // The callable slices at 1000 characters. An input that let someone type
    // more would silently lose the tail of what they wrote to an admin.
    const { getByPlaceholderText } = render(<ContestEngagementSheet {...base} />);
    expect(getByPlaceholderText(en.engagement.contest_note_placeholder).props.maxLength).toBe(1000);
  });

  it('forgets the choice when reopened', () => {
    // A sheet that remembers the last selection is a sheet with a default, one
    // dismissal later.
    const { getByText, rerender } = render(<ContestEngagementSheet {...base} />);
    fireEvent.press(getByText(en.engagement.contest_didnt_happen));
    rerender(<ContestEngagementSheet {...base} visible={false} />);
    rerender(<ContestEngagementSheet {...base} visible />);
    fireEvent.press(getByText(en.engagement.contest_confirm));
    expect(base.onConfirm).not.toHaveBeenCalled();
  });

  it('sends nothing while a send is already in flight', () => {
    const { getByText } = render(<ContestEngagementSheet {...base} submitting />);
    fireEvent.press(getByText(en.engagement.contest_didnt_happen));
    expect(base.onConfirm).not.toHaveBeenCalled();
  });
});
