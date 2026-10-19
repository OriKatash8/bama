import React from 'react';
import { Keyboard, Platform, ScrollView, StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import HomeScreen from '../index';
import { useUiStore } from '@core/stores/uiStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

/**
 * Keyboard handling on step 1: the keyboard must not hide the date/location tiles below the
 * description box, and closing it must be easy. JS-only: core RN props, no keyboard library.
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
jest.mock('@components/layout/PlainScreen', () => ({
  PlainScreen: ({ children }: { children: React.ReactNode }) => children,
}));
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


const setOS = (os: string) => { (Platform as { OS: string }).OS = os; };

function renderHome() {
  const r = render(<HomeScreen />);
  const sv = r.UNSAFE_getByType(ScrollView);
  const scrollTo = jest.spyOn(sv.instance as unknown as Record<string, () => void>, 'scrollTo').mockImplementation(() => {});
  return { r, sv, scrollTo };
}

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  mockHasRoles = true;
  setOS('ios');
  useUiStore.setState({ builderStep: 1, builderStepNonce: 0 });
});
afterAll(() => setOS('ios'));

describe('iOS', () => {
  it('the page ScrollView adjusts for the keyboard and dismisses on interactive drag', () => {
    const { sv } = renderHome();
    expect(sv.props.automaticallyAdjustKeyboardInsets).toBe(true);
    expect(sv.props.keyboardDismissMode).toBe('interactive');
    expect(sv.props.keyboardShouldPersistTaps).toBe('handled');
  });

  it('focusing the description scrolls it (and the tiles under it) into view', () => {
    const { r, scrollTo } = renderHome();
    fireEvent(r.getByTestId('description-input'), 'focus');
    expect(scrollTo).toHaveBeenCalledTimes(1);
    const { y, animated } = (scrollTo.mock.calls[0] as unknown as [{ y: number; animated: boolean }])[0];
    expect(y).toBeGreaterThanOrEqual(0);
    expect(animated).toBe(true);
  });

  it('scrolls again when the keyboard has finished appearing (focus lands first)', () => {
    let onShow: () => void = () => {};
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((ev: string, cb: () => void) => {
      if (ev === 'keyboardWillShow') onShow = cb;
      return { remove: jest.fn() };
    }) as never);
    const { r, scrollTo } = renderHome();
    fireEvent(r.getByTestId('description-input'), 'focus');
    scrollTo.mockClear();
    onShow();
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('does not scroll on keyboard show when the description is not the focused field', () => {
    let onShow: () => void = () => {};
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((_ev: string, cb: () => void) => {
      onShow = cb;
      return { remove: jest.fn() };
    }) as never);
    const { r, scrollTo } = renderHome();
    fireEvent(r.getByTestId('description-input'), 'focus');
    fireEvent(r.getByTestId('description-input'), 'blur');
    scrollTo.mockClear();
    onShow();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('the description box has a Done bar in English and Hebrew that dismisses the keyboard', () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    const { r } = renderHome();
    expect(r.getByTestId('description-input').props.inputAccessoryViewID).toBeTruthy();
    const done = r.getByTestId('keyboard-done');
    expect(r.getByText(en.builder.keyboard_done)).toBeTruthy();
    fireEvent.press(done);
    expect(dismiss).toHaveBeenCalled();
    expect(he.builder.keyboard_done).toBe('סיום');
  });

  it('the Done bar sits at the trailing side (right in English)', () => {
    const { r } = renderHome();
    expect(StyleSheet.flatten(r.getByTestId('keyboard-done-bar').props.style).flexDirection).toBe('row-reverse');
  });
});

describe('Android', () => {
  it('drag dismisses; no iOS-only inset prop, no Done bar', () => {
    setOS('android');
    const { r, sv } = renderHome();
    expect(sv.props.keyboardDismissMode).toBe('on-drag');
    expect(sv.props.automaticallyAdjustKeyboardInsets).toBe(false);
    expect(r.queryByTestId('keyboard-done')).toBeNull();
    expect(r.getByTestId('description-input').props.inputAccessoryViewID).toBeUndefined();
  });

  it('scrolls the description into view on focus', () => {
    setOS('android');
    const { r, scrollTo } = renderHome();
    fireEvent(r.getByTestId('description-input'), 'focus');
    expect(scrollTo).toHaveBeenCalled();
  });
});

describe('web (no virtual keyboard): layout stays as it is', () => {
  it('no scrolling on focus, no accessory bar, no iOS-only props', () => {
    setOS('web');
    const { r, sv, scrollTo } = renderHome();
    fireEvent(r.getByTestId('description-input'), 'focus');
    expect(scrollTo).not.toHaveBeenCalled();
    expect(r.queryByTestId('keyboard-done')).toBeNull();
    expect(sv.props.automaticallyAdjustKeyboardInsets).toBe(false);
    expect(r.getByTestId('description-input').props.inputAccessoryViewID).toBeUndefined();
  });

  it('does not register a keyboard listener', () => {
    setOS('web');
    const add = jest.spyOn(Keyboard, 'addListener');
    renderHome();
    expect(add).not.toHaveBeenCalled();
  });
});
