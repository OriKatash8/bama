import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, fireEvent, render } from '@testing-library/react-native';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import { ContestFromChat, contestWindowNote } from '../ContestFromChat';

/**
 * "There is a problem", in the chat of a finished project beside the balance button.
 * Visible only while THIS professional's own completed engagement can still be contested.
 */
let mockLang = 'en';
const mockToast = jest.fn();
const mockContest = jest.fn((..._a: unknown[]) => Promise.resolve({ ok: true }));

jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLang }),
}));
jest.mock('@core/stores/uiStore', () => ({
  useUiStore: (sel: (s: object) => unknown) => sel({ showToast: mockToast }),
}));
jest.mock('@core/hooks/useTheme', () => ({
  useTheme: () => new Proxy({}, { get: () => '#000000' }),
}));
jest.mock('@core/firebase/config', () => ({ db: {}, auth: {}, functions: {} }));
jest.mock('@core/firebase/functions', () => ({
  callFunction: (name: string) => (...a: unknown[]) => (name === 'contestEngagement' ? mockContest(...a) : Promise.resolve({})),
}));

const DAY = 86_400_000;
const ts = (ms: number) => ({ seconds: Math.floor(ms / 1000), nanoseconds: 0 });
const completed = (over: Record<string, unknown> = {}) => ({
  professionalId: 'pro1', engagementStatus: 'completed', feePaid: false, status: 'pending', feeDue: 6,
  chargeDueAt: ts(Date.now() + 3 * DAY), ...over,
}) as never;

beforeEach(() => { jest.clearAllMocks(); mockLang = 'en'; });

const renderBtn = (fee: unknown) =>
  render(<ContestFromChat projectId="p1" projectTitle="Shoot" fee={fee as never} />);

describe('when the button shows', () => {
  it('shows for a completed, unpaid engagement inside the window', () => {
    expect(renderBtn(completed()).getByText(en.engagement.contest)).toBeTruthy();
  });

  it.each([
    ['no fee (the client, or not loaded)', null],
    ['already paid', completed({ feePaid: true, status: 'paid' })],
    ['past the charge window', completed({ chargeDueAt: ts(Date.now() - DAY) })],
    ['not completed yet', completed({ engagementStatus: 'hired' })],
    ['already disputed', completed({ engagementStatus: 'disputed' })],
  ])('is hidden: %s', (_label, fee) => {
    expect(renderBtn(fee).queryByTestId('chat-contest-button')).toBeNull();
  });
});

describe('contesting from the chat', () => {
  it('opens the sheet, sends the callable with the chosen reason and note, then confirms', async () => {
    const r = renderBtn(completed());
    fireEvent.press(r.getByTestId('chat-contest-button'));
    fireEvent.press(r.getByText(en.engagement.contest_didnt_happen));
    fireEvent.changeText(r.getByPlaceholderText(en.engagement.contest_note_placeholder), 'cancelled on the day');
    await act(async () => { fireEvent.press(r.getByText(en.engagement.contest_confirm)); });
    expect(mockContest).toHaveBeenCalledWith({ projectId: 'p1', reason: 'didnt_happen', note: 'cancelled on the day' });
    expect(mockToast).toHaveBeenCalledWith(en.engagement.contest_sent, 'success');
  });

  it('shows a mapped message, never the raw server code, when the contest is refused', async () => {
    mockContest.mockRejectedValueOnce(Object.assign(new Error('dispute-resolved'), { code: 'functions/failed-precondition' }));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const r = renderBtn(completed());
    fireEvent.press(r.getByTestId('chat-contest-button'));
    fireEvent.press(r.getByText(en.engagement.contest_amount));
    await act(async () => { fireEvent.press(r.getByText(en.engagement.contest_confirm)); });
    expect(mockToast).toHaveBeenCalledWith(en.engagement.contest_error_already_resolved, 'error');
    expect(JSON.stringify(mockToast.mock.calls)).not.toContain('dispute-resolved');
  });
});

describe('the deadline note and the placement', () => {
  it('says until when, in either language, and is null when nothing can be contested', () => {
    expect(contestWindowNote(completed(), 'en')).toContain(en.engagement.contest_window.split('{{')[0].trim());
    expect(contestWindowNote(completed(), 'he')).toContain(he.engagement.contest_window.split('{{')[0].trim());
    expect(contestWindowNote(completed({ feePaid: true }), 'en')).toBeNull();
    expect(contestWindowNote(null, 'en')).toBeNull();
  });

  it('is rendered in the chat footer next to the balance button, in the same row', () => {
    const src = readFileSync(join(__dirname, '..', '..', '..', 'chat', 'screens', 'ChatRoomScreen.tsx'), 'utf8');
    const row = src.slice(src.indexOf('footerActions, {'), src.indexOf('contestNote &&'));
    expect(row).toContain('payFromChatBtn');
    expect(row).toContain('<ContestFromChat');
    // …and it is gone from the project card.
    const card = readFileSync(join(__dirname, '..', '..', '..', '..', 'app', '(client)', 'chat', 'project-details.tsx'), 'utf8');
    expect(card).not.toContain('ContestEngagementSheet');
    expect(card).not.toContain('contestPill');
  });
});
