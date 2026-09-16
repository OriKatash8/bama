import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import HomeScreen from '../index';
import { useUiStore } from '@core/stores/uiStore';
import { warnFeedback, commitFeedback } from '@core/haptics';
import en from '@core/i18n/translations/en.json';

/**
 * Step transitions, the scroll behaviour they replaced, and what a failed
 * Next does.
 *
 * Three setTimeout(…, 50) + scrollTo calls used to stand in for a transition:
 * the screen stays mounted across a step change, so the ScrollView keeps its old
 * offset and the new step opens part-way down. Those timers were guesses at when
 * layout had settled. Now the swap happens at a known instant — between the exit
 * and enter springs, when nothing is on screen — and the one case that genuinely
 * needs the final content height (scrollToEnd into step 2's image grid) is a
 * one-shot onContentSizeChange instead.
 *
 * Direction is hand-flipped for RTL. I18nManager is not used anywhere in this
 * repo, so translateX is always screen-left-origin and nothing mirrors by
 * itself: forward enters from the right in English and from the LEFT in Hebrew.
 */

let mockLang: 'he' | 'en' = 'en';
let mockHasRoles = true;
let mockReducedMotion = false;
const mockSprings: { to: number }[] = [];

jest.mock('@features/crew/hooks', () => ({
  useCrewBuilder: () => ({
    slots: mockHasRoles ? [{ category: 'Video Photographer', capability: undefined }] : [],
    totalCount: mockHasRoles ? 1 : 0,
    roleQuantity: (c: string) => (mockHasRoles && c === 'Video Photographer' ? 1 : 0),
    slotCaps: (c: string) => (mockHasRoles && c === 'Video Photographer' ? [undefined] : []),
    setQuantity: jest.fn(),
    setSlotCapability: jest.fn(),
    removeCategory: jest.fn(),
    loadSlots: jest.fn(),
  }),
}));
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
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLang }),
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
    withSpring: (v: number, _cfg?: unknown, cb?: (f: boolean) => void) => {
      mockSprings.push({ to: v });
      cb?.(true);
      return v;
    },
    runOnJS: (fn: unknown) => fn,
    useReducedMotion: () => mockReducedMotion,
  };
});

/** Every translateX target the transition asked for, in order. */
const slides = () => mockSprings.map((s) => s.to).filter((v) => v !== 0 && v !== 1);

function fillStepOne(r: ReturnType<typeof render>) {
  fireEvent.changeText(r.getByPlaceholderText(en.builder.placeholder_title), 'Music video');
  fireEvent.changeText(
    r.getByPlaceholderText(en.builder.tell_us_placeholder),
    'A long enough description to pass validation',
  );
  fireEvent.press(r.getByText(en.builder.placeholder_deadline));
  fireEvent.press(r.getByTestId('mini-calendar'));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSprings.length = 0;
  mockLang = 'en';
  mockHasRoles = true;
  mockReducedMotion = false;
  useUiStore.setState({ builderStep: 1, builderStepNonce: 0 });
});

describe('the steps actually change', () => {
  it('a valid Next lands on step 2', () => {
    const r = render(<HomeScreen />);
    fillStepOne(r);
    fireEvent.press(r.getByText(en.builder.next_step));
    expect(r.getByText('Build Your Crew')).toBeTruthy();
  });

  it('the back arrow returns to step 1', () => {
    const r = render(<HomeScreen />);
    fillStepOne(r);
    fireEvent.press(r.getByText(en.builder.next_step));
    fireEvent.press(r.getByText(en.search.back.replace('← ', '')));
    expect(r.getByText('Build Your Project')).toBeTruthy();
  });

  it('the review screen edit links jump straight to the requested step', () => {
    const r = render(<HomeScreen />);
    act(() => useUiStore.getState().requestBuilderStep(3));
    expect(r.getByText('Match subskills')).toBeTruthy();
  });
});

describe('direction is mirrored for Hebrew', () => {
  it('forward slides one way in English and the other in Hebrew', () => {
    const ltr = render(<HomeScreen />);
    fillStepOne(ltr);
    fireEvent.press(ltr.getByText(en.builder.next_step));
    const english = slides();
    expect(english.length).toBeGreaterThan(0);

    mockSprings.length = 0;
    mockLang = 'he';
    const rtl = render(<HomeScreen />);
    act(() => useUiStore.getState().requestBuilderStep(2));
    const hebrew = slides();
    expect(hebrew.length).toBeGreaterThan(0);

    expect(Math.sign(hebrew[0])).toBe(-Math.sign(english[0]));
  });
});

describe('reduce motion', () => {
  it('still changes step, without ever sliding', () => {
    mockReducedMotion = true;
    const r = render(<HomeScreen />);
    fillStepOne(r);
    fireEvent.press(r.getByText(en.builder.next_step));

    expect(r.getByText('Build Your Crew')).toBeTruthy();
    expect(slides()).toHaveLength(0);
  });
});

describe('a failed Next takes you to the problem', () => {
  it('warns and does not commit when step 1 is empty', () => {
    const r = render(<HomeScreen />);
    fireEvent.press(r.getByText(en.builder.next_step));

    expect(warnFeedback).toHaveBeenCalledTimes(1);
    expect(commitFeedback).not.toHaveBeenCalled();
    expect(r.getByText('Build Your Project')).toBeTruthy();
  });

  it('warns and does not commit when step 2 has no roles', () => {
    mockHasRoles = false;
    const r = render(<HomeScreen />);
    act(() => useUiStore.getState().requestBuilderStep(2));
    jest.clearAllMocks();
    fireEvent.press(r.getByText(en.builder.next_step));

    expect(warnFeedback).toHaveBeenCalledTimes(1);
    expect(commitFeedback).not.toHaveBeenCalled();
  });

  it('a valid Next warns about nothing', () => {
    const r = render(<HomeScreen />);
    fillStepOne(r);
    jest.clearAllMocks();
    fireEvent.press(r.getByText(en.builder.next_step));

    expect(warnFeedback).not.toHaveBeenCalled();
    expect(commitFeedback).toHaveBeenCalledTimes(1);
  });
});
