import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { router } from 'expo-router';
import SummaryScreen from '../summary';
import { useUiStore } from '@core/stores/uiStore';
import { queryDocuments } from '@core/firebase/firestore';
import en from '@core/i18n/translations/en.json';

/**
 * Publishing from the review page lands on My Projects, and the review page is
 * popped off the Home stack — going back to Home shows the empty wizard, not the
 * review page again. The few-matches check must not hold the publish up.
 */

let mockParams: Record<string, string> = {};
let mockSlots: Array<Record<string, unknown>> = [];
const mockSubmit = jest.fn();
const mockUpdate = jest.fn();

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(), navigate: jest.fn(), dismissTo: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@components/layout/Screen', () => ({ Screen: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@features/crew/hooks', () => ({
  useCrewBuilder: () => ({ slots: mockSlots, removeCategory: jest.fn(), reset: jest.fn(), loadSlots: jest.fn() }),
  useProjectRequests: () => ({ submit: mockSubmit, updateProject: mockUpdate }),
}));
jest.mock('@core/firebase/firestore', () => ({ queryDocuments: jest.fn(), getDocument: jest.fn() }));
jest.mock('@utils/confirmDialog', () => ({ confirmDialog: jest.fn() }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));

const mockRouter = router as unknown as { navigate: jest.Mock; dismissTo: jest.Mock };
const SLOT = { category: 'electrician', subCategory: 'electrician', count: 1 };

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { title: 'Probe', deadline: '2026-10-30', slots: '[]' };
  mockSlots = [SLOT];
  mockSubmit.mockResolvedValue(undefined);
  mockUpdate.mockResolvedValue(undefined);
});

it('a new project lands on My Projects, with the review page popped off Home', async () => {
  const r = render(<SummaryScreen />);
  fireEvent.press(r.getByText(en.builder.publish_project));
  await waitFor(() => expect(mockRouter.navigate).toHaveBeenCalledWith('/(client)/(tabs)/projects'));
  expect(mockRouter.dismissTo).toHaveBeenCalledWith('/(client)/(tabs)/home');
  expect(mockRouter.dismissTo.mock.invocationCallOrder[0])
    .toBeLessThan(mockRouter.navigate.mock.invocationCallOrder[0]);
  expect(mockRouter.navigate).not.toHaveBeenCalledWith('/(client)/(tabs)/chats');
});

it('a new project clears the Home form', async () => {
  const before = useUiStore.getState().projectSubmittedNonce;
  const r = render(<SummaryScreen />);
  fireEvent.press(r.getByText(en.builder.publish_project));
  await waitFor(() => expect(useUiStore.getState().projectSubmittedNonce).toBe(before + 1));
});

it('saving an edit pops the review page back to Home', async () => {
  mockParams = { ...mockParams, projectId: 'p1' };
  const r = render(<SummaryScreen />);
  fireEvent.press(r.getByText(en.builder.save_changes));
  await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/(client)/(tabs)/home'));
  expect(mockUpdate).toHaveBeenCalled();
});

it('a few-matches check that never answers does not hold up the publish', async () => {
  jest.useFakeTimers();
  try {
    mockSlots = [{ ...SLOT, requiredCapability: 'high_voltage' }];
    (queryDocuments as jest.Mock).mockReturnValue(new Promise(() => {}));
    const r = render(<SummaryScreen />);
    fireEvent.press(r.getByText(en.builder.publish_project));
    expect(queryDocuments).toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(2100); });
    expect(mockSubmit).toHaveBeenCalled();
  } finally {
    jest.useRealTimers();
  }
});
