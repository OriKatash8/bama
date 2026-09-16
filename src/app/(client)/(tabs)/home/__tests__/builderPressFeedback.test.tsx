import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import HomeScreen from '../index';
import { useUiStore } from '@core/stores/uiStore';
import { tapFeedback, commitFeedback } from '@core/haptics';
import en from '@core/i18n/translations/en.json';

/**
 * Press feedback across the rest of the builder.
 *
 * The rule under test is causality, not decoration: a haptic fires when
 * something actually commits, and stays silent otherwise. The two places that
 * is easy to get wrong:
 *
 *  - a date square only OPENS a picker. The commit is the date being chosen,
 *    which happens inside the modal, so the square itself must not buzz.
 *  - the next-step buttons validate and can bail. A haptic wired to the press
 *    rather than to the outcome would confirm a step advance that never
 *    happened — which is why it lives inside the handler, past the guard.
 */

let mockQuantities: Record<string, number> = { 'Video Photographer': 1 };
const mockSetSlotCapability = jest.fn();

jest.mock('@features/crew/hooks', () => ({
  useCrewBuilder: () => ({
    slots: Object.entries(mockQuantities).flatMap(([category, q]) =>
      Array.from({ length: q }, () => ({ category, capability: undefined })),
    ),
    totalCount: Object.values(mockQuantities).reduce((a, b) => a + b, 0),
    roleQuantity: (cat: string) => mockQuantities[cat] ?? 0,
    slotCaps: (cat: string) => Array.from({ length: mockQuantities[cat] ?? 0 }, () => undefined),
    setQuantity: jest.fn(),
    setSlotCapability: mockSetSlotCapability,
    removeCategory: jest.fn(),
    loadSlots: jest.fn(),
  }),
}));

// Tagged so a test can tell WHICH picker opened, and drive a real selection
// through onSelect — the date squares are otherwise indistinguishable.
jest.mock('@features/crew/components', () => {
  const RN = jest.requireActual('react-native');
  return {
    MiniCalendar: ({ onSelect }: { onSelect: (iso: string) => void }) =>
      require('react').createElement(
        RN.TouchableOpacity,
        { testID: 'mini-calendar', onPress: () => onSelect('2026-12-01') },
        require('react').createElement(RN.Text, null, 'calendar'),
      ),
  };
});

jest.mock('@components/layout/Screen', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useLocalSearchParams: () => ({}) }));
jest.mock('@core/firebase/firestore', () => ({ getDocument: jest.fn() }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));
jest.mock('@core/haptics', () => ({
  tapFeedback: jest.fn(),
  commitFeedback: jest.fn(),
  warnFeedback: jest.fn(),
}));

jest.mock('react-native-reanimated', () => {
  const RN = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View: RN.View, createAnimatedComponent: (C: unknown) => C },
    useSharedValue: (v: number) => ({ value: v }),
    useAnimatedStyle: (fn: () => unknown) => fn(),
    // The swap in goToStep lives in the completion callback, so the mock has to
    // invoke it or no test ever reaches step 2.
    withSpring: (v: number, _cfg?: unknown, cb?: (f: boolean) => void) => { cb?.(true); return v; },
    runOnJS: (fn: unknown) => fn,
    useReducedMotion: () => false,
  };
});

const pressEvent = () => ({ stopPropagation: jest.fn() });

function goToStep(step: 1 | 2 | 3) {
  const r = render(<HomeScreen />);
  if (step !== 1) act(() => useUiStore.getState().requestBuilderStep(step));
  return r;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockQuantities = { 'Video Photographer': 1 };
});

describe('date squares', () => {
  it('opens the picker but does not buzz — opening is not committing', () => {
    const r = goToStep(1);
    expect(r.queryByTestId('mini-calendar')).toBeNull();

    fireEvent.press(r.getByText(en.builder.placeholder_date));

    expect(r.getByTestId('mini-calendar')).toBeTruthy();
    expect(commitFeedback).not.toHaveBeenCalled();
    expect(tapFeedback).not.toHaveBeenCalled();
  });

  it('the clear badge empties the field and buzzes — clearing IS a commit', () => {
    const r = goToStep(1);
    fireEvent.press(r.getByText(en.builder.placeholder_date));
    fireEvent.press(r.getByTestId('mini-calendar'));
    // The square now shows a value, so the clear badge exists.
    expect(r.queryByText(en.builder.placeholder_date)).toBeNull();
    jest.clearAllMocks();

    fireEvent.press(r.getByTestId('clear-exec'), pressEvent());

    expect(r.getByText(en.builder.placeholder_date)).toBeTruthy();
    expect(commitFeedback).toHaveBeenCalledTimes(1);
  });

  it('clearing one square leaves the others alone', () => {
    const r = goToStep(1);
    fireEvent.press(r.getByText(en.builder.placeholder_deadline));
    fireEvent.press(r.getByTestId('mini-calendar'));
    fireEvent.press(r.getByTestId('clear-deadline'), pressEvent());

    expect(r.getByText(en.builder.placeholder_deadline)).toBeTruthy();
    expect(r.getByText(en.builder.placeholder_date)).toBeTruthy();
  });
});

describe('subskill pills', () => {
  it('sets the capability and ticks — a selection change, not a completion', () => {
    const r = goToStep(3);
    fireEvent.press(r.getByText('Music Video'));

    expect(mockSetSlotCapability).toHaveBeenCalledTimes(1);
    expect(tapFeedback).toHaveBeenCalledTimes(1);
    expect(commitFeedback).not.toHaveBeenCalled();
  });
});

describe('next-step buttons', () => {
  it('stays silent when validation fails — nothing advanced', () => {
    const r = goToStep(1);
    fireEvent.press(r.getByText(en.builder.next_step));

    expect(r.getAllByText(en.builder.error_required).length).toBeGreaterThan(0);
    expect(commitFeedback).not.toHaveBeenCalled();
  });

  it('buzzes once the step actually advances', () => {
    const r = goToStep(1);
    fireEvent.changeText(r.getByPlaceholderText(en.builder.placeholder_title), 'Music video');
    fireEvent.changeText(
      r.getByPlaceholderText(en.builder.tell_us_placeholder),
      'A long enough description to pass validation',
    );
    fireEvent.press(r.getByText(en.builder.placeholder_deadline));
    fireEvent.press(r.getByTestId('mini-calendar'));
    jest.clearAllMocks();

    fireEvent.press(r.getByText(en.builder.next_step));

    expect(commitFeedback).toHaveBeenCalledTimes(1);
  });

  it('step 2 stays silent with no roles chosen', () => {
    mockQuantities = {};
    const r = goToStep(2);
    fireEvent.press(r.getByText(en.builder.next_step));

    expect(r.getByText(en.builder.error_role)).toBeTruthy();
    expect(commitFeedback).not.toHaveBeenCalled();
  });
});
