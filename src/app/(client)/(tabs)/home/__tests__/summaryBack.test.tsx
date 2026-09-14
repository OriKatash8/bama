import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import SummaryScreen from '../summary';
import { useUiStore } from '@core/stores/uiStore';
import en from '@core/i18n/translations/en.json';

/**
 * The review-your-request page goes back to the wizard. When it's the first screen
 * in the home stack (a web refresh, or opened from its URL), router.back() has
 * nothing to go back to and throws "The action 'GO_BACK' was not handled by any
 * navigator", so Back and Edit open the wizard instead.
 */

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(), navigate: jest.fn() },
  useLocalSearchParams: () => ({ title: 'Probe', deadline: '2026-09-30', slots: '[]' }),
}));
jest.mock('@components/layout/Screen', () => ({ Screen: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@features/crew/hooks', () => ({
  useCrewBuilder: () => ({ slots: [], removeCategory: jest.fn(), reset: jest.fn(), loadSlots: jest.fn() }),
  useProjectRequests: () => ({ submit: jest.fn(), updateProject: jest.fn() }),
}));
jest.mock('@core/firebase/firestore', () => ({ queryDocuments: jest.fn(), getDocument: jest.fn() }));
jest.mock('@utils/confirmDialog', () => ({ confirmDialog: jest.fn() }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));

const mockRouter = router as unknown as { back: jest.Mock; replace: jest.Mock; canGoBack: jest.Mock };

beforeEach(() => jest.clearAllMocks());

it('Back goes back when the wizard is underneath', () => {
  mockRouter.canGoBack.mockReturnValue(true);
  const r = render(<SummaryScreen />);
  fireEvent.press(r.getByText(en.builder.back_to_edit));
  expect(mockRouter.back).toHaveBeenCalledTimes(1);
  expect(mockRouter.replace).not.toHaveBeenCalled();
});

it('Back opens the wizard when there is nothing to go back to (no GO_BACK)', () => {
  mockRouter.canGoBack.mockReturnValue(false);
  const r = render(<SummaryScreen />);
  fireEvent.press(r.getByText(en.builder.back_to_edit));
  expect(mockRouter.back).not.toHaveBeenCalled();
  expect(mockRouter.replace).toHaveBeenCalledWith('/(client)/(tabs)/home');
});

it('Edit with no history also opens the wizard, at the requested step', () => {
  mockRouter.canGoBack.mockReturnValue(false);
  const r = render(<SummaryScreen />);
  fireEvent.press(r.getAllByText(en.builder.edit)[2]); // crew card → step 2
  expect(useUiStore.getState().builderStep).toBe(2);
  expect(mockRouter.back).not.toHaveBeenCalled();
  expect(mockRouter.replace).toHaveBeenCalledWith('/(client)/(tabs)/home');
});
