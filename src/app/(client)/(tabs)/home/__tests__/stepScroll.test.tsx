import React from 'react';
import { ScrollView } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import HomeScreen from '../index';
import { useUiStore } from '@core/stores/uiStore';
import en from '@core/i18n/translations/en.json';

/**
 * Where the page ends up after a step change, and after a failed one.
 *
 * This screen stays mounted across step changes, so the ScrollView keeps the
 * offset the user left at and a new step opens part-way down. Three
 * setTimeout(…, 50) calls used to paper over that. Two are now done at the swap
 * — the instant between the exit and enter springs, when nothing is on screen —
 * and the third, scrollToEnd into step 2's 8-tile image grid, is a one-shot
 * onContentSizeChange, because that one genuinely needs the final content
 * height and no timer can reliably wait for it.
 *
 * scrollTo is imperative, so it is observed by spying on the real ScrollView
 * instance. Standing a mock in its place is not an option: FlatList reaches into
 * ScrollView's context statics and step 2 throws without them.
 */

let mockHasRoles = true;

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
    // Never calls back — the web truth. Nothing here may depend on it.
    withSpring: (v: number, _cfg?: unknown, cb?: (f: boolean) => void) => v,
    runOnJS: (fn: unknown) => fn,
    useReducedMotion: () => false,
  };
});

type Spies = {
  r: ReturnType<typeof render>;
  sv: ReturnType<ReturnType<typeof render>['UNSAFE_getByType']>;
  scrollTo: jest.SpyInstance;
  scrollToEnd: jest.SpyInstance;
};

function renderWithScrollSpy(): Spies {
  const r = render(<HomeScreen />);
  const sv = r.UNSAFE_getByType(ScrollView);
  const inst = sv.instance as unknown as Record<string, () => void>;
  return {
    r,
    sv,
    scrollTo: jest.spyOn(inst, 'scrollTo').mockImplementation(() => {}),
    scrollToEnd: jest.spyOn(inst, 'scrollToEnd').mockImplementation(() => {}),
  };
}

function fillStepOne(r: ReturnType<typeof render>) {
  fireEvent.changeText(r.getByPlaceholderText(en.builder.placeholder_title), 'Music video');
  fireEvent.changeText(
    r.getByTestId('description-input'),
    'A long enough description to pass validation',
  );
  fireEvent.press(r.getByText(en.builder.placeholder_deadline));
  fireEvent.press(r.getByTestId('mini-calendar'));
}

/** Content finishing layout — what the old 50ms timer was guessing at. */
const settleLayout = (s: Spies) => fireEvent(s.sv, 'contentSizeChange', 320, 2400);

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  mockHasRoles = true;
  useUiStore.setState({ builderStep: 1, builderStepNonce: 0 });
});

describe('entering step 2', () => {
  it('waits for layout, then lands at the end', () => {
    const s = renderWithScrollSpy();
    fillStepOne(s.r);
    fireEvent.press(s.r.getByText(en.builder.next_step));

    // Armed, but deliberately not fired yet — the grid has not been measured.
    expect(s.scrollToEnd).not.toHaveBeenCalled();

    settleLayout(s);
    expect(s.scrollToEnd).toHaveBeenCalledTimes(1);
  });

  it('is a ONE-shot — later layout passes do not yank the page back', () => {
    const s = renderWithScrollSpy();
    fillStepOne(s.r);
    fireEvent.press(s.r.getByText(en.builder.next_step));
    settleLayout(s);
    settleLayout(s);
    settleLayout(s);

    expect(s.scrollToEnd).toHaveBeenCalledTimes(1);
  });

  it('never fires unprompted — an idle layout pass scrolls nothing', () => {
    const s = renderWithScrollSpy();
    settleLayout(s);
    expect(s.scrollToEnd).not.toHaveBeenCalled();
  });
});

describe('entering step 3', () => {
  it('opens at the top, not wherever step 2 was left', () => {
    const s = renderWithScrollSpy();
    act(() => useUiStore.getState().requestBuilderStep(2));
    s.scrollTo.mockClear();

    fireEvent.press(s.r.getByTestId('step2-cta'));

    expect(s.scrollTo).toHaveBeenCalledWith({ y: 0, animated: false });
    expect(s.scrollToEnd).not.toHaveBeenCalled();
  });
});

describe('a failed Next takes you to the error', () => {
  it('scrolls up to the offending field on step 1', () => {
    const s = renderWithScrollSpy();
    fireEvent.press(s.r.getByText(en.builder.next_step));

    expect(s.scrollTo).toHaveBeenCalledTimes(1);
    const [arg] = s.scrollTo.mock.calls[0] as [{ y: number; animated: boolean }];
    expect(arg.animated).toBe(true);
    expect(arg.y).toBeGreaterThanOrEqual(0);
  });

  it('scrolls to the top on step 2, where errors.slots renders', () => {
    mockHasRoles = false;
    const s = renderWithScrollSpy();
    act(() => useUiStore.getState().requestBuilderStep(2));
    s.scrollTo.mockClear();

    fireEvent.press(s.r.getByTestId('step2-cta'));

    expect(s.scrollTo).toHaveBeenCalledWith({ y: 0, animated: true });
  });

  it('a successful Next scrolls to no error', () => {
    const s = renderWithScrollSpy();
    fillStepOne(s.r);
    s.scrollTo.mockClear();
    fireEvent.press(s.r.getByText(en.builder.next_step));

    expect(s.scrollTo).not.toHaveBeenCalled();
  });
});
