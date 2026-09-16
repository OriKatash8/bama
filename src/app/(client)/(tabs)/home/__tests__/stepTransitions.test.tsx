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

/**
 * How withSpring reports completion. 'never' is the default because that is
 * what Reanimated 4 does on web: the completion callback is simply not invoked.
 * The old mock fired it synchronously with `true`, which is why eight tests
 * passed while every web transition stranded at opacity 0.
 */
let mockSpringCallback: 'never' | 'finished' | 'cancelled' = 'never';

/** Every value ever written to a shared value, in order. */
type Recorded = { value: number; history: number[] };
const mockSharedValues: Recorded[] = [];
/** Every animated style this screen produces, so a test can see what is driven. */
const mockAnimatedStyles: Record<string, unknown>[] = [];

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
    useSharedValue: (init: number) => {
      const history = [init];
      const sv = {
        get value() { return history[history.length - 1]; },
        set value(v: number) { history.push(v); },
        history,
      };
      mockSharedValues.push(sv as unknown as Recorded);
      return sv;
    },
    useAnimatedStyle: (fn: () => unknown) => {
      const style = fn() as Record<string, unknown>;
      mockAnimatedStyles.push(style);
      return style;
    },
    withSpring: (v: number, _cfg?: unknown, cb?: (f: boolean) => void) => {
      if (mockSpringCallback === 'finished') cb?.(true);
      else if (mockSpringCallback === 'cancelled') cb?.(false);
      return v;
    },
    runOnJS: (fn: unknown) => fn,
    useReducedMotion: () => mockReducedMotion,
  };
});

/**
 * The step slide is the only value on this screen that is ever written at
 * +/-STEP_SLIDE — PressableScale's own shared values live between 0.85 and 1 —
 * so this finds it without depending on hook ordering.
 */
const STEP_SLIDE = 40;
const slides = () =>
  mockSharedValues.flatMap((s) => s.history).filter((v) => Math.abs(v) === STEP_SLIDE);

function fillStepOne(r: ReturnType<typeof render>) {
  fireEvent.changeText(r.getByPlaceholderText(en.builder.placeholder_title), 'Music video');
  fireEvent.changeText(
    r.getByTestId('description-input'),
    'A long enough description to pass validation',
  );
  fireEvent.press(r.getByText(en.builder.placeholder_deadline));
  fireEvent.press(r.getByTestId('mini-calendar'));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSharedValues.length = 0;
  mockAnimatedStyles.length = 0;
  mockSpringCallback = 'never';
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

describe('the step swap never depends on the animation', () => {
  // This is the regression 2faf44c shipped. On web, Reanimated 4 never invokes
  // the withSpring completion callback, and the swap lived inside it — so the
  // screen faded out, slid, and stayed on step 1 forever. Whatever the
  // animation does or fails to do, the content must change.
  it.each(['never', 'cancelled', 'finished'] as const)(
    'advances with spring callback = %s',
    (mode) => {
      mockSpringCallback = mode;
      const r = render(<HomeScreen />);
      fillStepOne(r);
      fireEvent.press(r.getByText(en.builder.next_step));
      expect(r.getByText('Build Your Crew')).toBeTruthy();
    },
  );

  it('never animates opacity, so a stalled animation cannot hide the screen', () => {
    // Degrading to off-centre beats degrading to invisible. translateX can
    // strand at 40pt and the page is still readable; opacity stranded at 0 is
    // an unusable screen. So nothing on this screen may drive opacity at all.
    const r = render(<HomeScreen />);
    fillStepOne(r);
    fireEvent.press(r.getByText(en.builder.next_step));

    expect(mockAnimatedStyles.length).toBeGreaterThan(0);
    expect(mockAnimatedStyles.some((st) => 'opacity' in st)).toBe(false);
    // and the slide did happen, so this is not passing by animating nothing
    expect(slides().length).toBeGreaterThan(0);
  });
});

describe('direction is mirrored for Hebrew', () => {
  it('forward slides one way in English and the other in Hebrew', () => {
    const ltr = render(<HomeScreen />);
    fillStepOne(ltr);
    fireEvent.press(ltr.getByText(en.builder.next_step));
    const english = slides();
    expect(english.length).toBeGreaterThan(0);

    mockSharedValues.length = 0;
  mockAnimatedStyles.length = 0;
  mockSpringCallback = 'never';
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
