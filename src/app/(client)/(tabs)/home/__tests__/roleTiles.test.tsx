import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import HomeScreen from '../index';
import { useUiStore } from '@core/stores/uiStore';
import { commitFeedback } from '@core/haptics';

/**
 * Step 2 of the builder: a grid of role tiles. A tile with no seats is itself
 * the "add one" button; once it has seats it grows a −/count/+ row INSIDE it.
 *
 * That nesting is the whole risk. The −/+ buttons live inside the tile's own
 * touch target, so a press that reached both would add a seat while removing
 * one. What actually keeps them apart is the `q === 0` guard on the tile's
 * onPress, not the e.stopPropagation() calls beside them — under RNTL a press
 * is dispatched straight to one handler and never bubbles, so the guard is the
 * only thing a test here can hold.
 *
 * These are the invariants that must survive the tile becoming a
 * PressableScale, which is why they are written against the tile's behaviour
 * and not against its component type.
 */

const VIDEOGRAPHER = 'Video Photographer';

/**
 * The −/+ handlers call e.stopPropagation?.() — a web guard. RN always hands a
 * press event to onPress, so a bare fireEvent.press (which passes nothing)
 * would blow up on a path that is fine on device. Simulate the real event.
 */
const pressEvent = () => ({ stopPropagation: jest.fn() });

let mockQuantities: Record<string, number> = {};
const mockSetQuantity = jest.fn((cat: string, q: number) => { mockQuantities[cat] = q; });

jest.mock('@features/crew/hooks', () => ({
  useCrewBuilder: () => ({
    slots: Object.entries(mockQuantities).flatMap(([category, q]) =>
      Array.from({ length: q }, () => ({ category, capability: undefined })),
    ),
    totalCount: Object.values(mockQuantities).reduce((a, b) => a + b, 0),
    roleQuantity: (cat: string) => mockQuantities[cat] ?? 0,
    slotCaps: (cat: string) => Array.from({ length: mockQuantities[cat] ?? 0 }, () => undefined),
    setQuantity: mockSetQuantity,
    setSlotCapability: jest.fn(),
    removeCategory: jest.fn(),
    loadSlots: jest.fn(),
  }),
}));

jest.mock('@features/crew/components', () => ({ MiniCalendar: 'MiniCalendar' }));
jest.mock('@components/layout/Screen', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useLocalSearchParams: () => ({}),
}));
jest.mock('@core/firebase/firestore', () => ({ getDocument: jest.fn() }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));
jest.mock('@core/haptics', () => ({
  tapFeedback: jest.fn(),
  commitFeedback: jest.fn(),
  warnFeedback: jest.fn(),
}));

const mockSharedValues: { value: number }[] = [];
jest.mock('react-native-reanimated', () => {
  const RN = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View: RN.View, createAnimatedComponent: (C: unknown) => C },
    useSharedValue: (v: number) => {
      const sv = { value: v };
      mockSharedValues.push(sv);
      return sv;
    },
    useAnimatedStyle: (fn: () => unknown) => fn(),
    // DEFAULT: the callback is NEVER invoked — which is what Reanimated 4
    // actually does on web. The previous mock fired it synchronously with
    // `true`, so eight transition tests passed against behaviour no real
    // platform exhibits, and a screen that stranded on every web transition
    // shipped green. Nothing may depend on this callback.
    withSpring: (v: number) => v,
    runOnJS: (fn: unknown) => fn,
    useReducedMotion: () => false,
  };
});

/**
 * Jump to step 2, where the role tiles live. The nonce has to move AFTER the
 * first render — the screen snapshots it into a ref on mount and the effect
 * early-returns when it has not changed, which is exactly how the review
 * screen's "edit" links reach a still-mounted wizard.
 */
function renderAtStepTwo() {
  const r = render(<HomeScreen />);
  act(() => useUiStore.getState().requestBuilderStep(2));
  return r;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockQuantities = {};
  mockSharedValues.length = 0;
});

it('an empty tile adds the first seat', () => {
  const r = renderAtStepTwo();
  fireEvent.press(r.getByText('Videographer'));
  expect(mockSetQuantity).toHaveBeenCalledTimes(1);
  expect(mockSetQuantity).toHaveBeenCalledWith(VIDEOGRAPHER, 1);
});

it('the tile itself is inert once it has seats, so + and − own the count', () => {
  mockQuantities[VIDEOGRAPHER] = 2;
  const r = renderAtStepTwo();
  fireEvent.press(r.getByText('Videographer'));
  expect(mockSetQuantity).not.toHaveBeenCalled();
});

it('− removes exactly one seat and nothing else', () => {
  mockQuantities[VIDEOGRAPHER] = 2;
  const r = renderAtStepTwo();
  fireEvent.press(r.getByText('−'), pressEvent());
  expect(mockSetQuantity).toHaveBeenCalledTimes(1);
  expect(mockSetQuantity).toHaveBeenCalledWith(VIDEOGRAPHER, 1);
});

it('+ adds exactly one seat and nothing else', () => {
  mockQuantities[VIDEOGRAPHER] = 2;
  const r = renderAtStepTwo();
  fireEvent.press(r.getByText('+'), pressEvent());
  expect(mockSetQuantity).toHaveBeenCalledTimes(1);
  expect(mockSetQuantity).toHaveBeenCalledWith(VIDEOGRAPHER, 3);
});

it('buzzes when a press actually seats a role', () => {
  const r = renderAtStepTwo();
  fireEvent.press(r.getByText('Videographer'));
  expect(commitFeedback).toHaveBeenCalledTimes(1);
});

it('stays silent when the tile is inert — no feedback without a cause', () => {
  mockQuantities[VIDEOGRAPHER] = 2;
  const r = renderAtStepTwo();
  fireEvent.press(r.getByText('Videographer'));
  expect(commitFeedback).not.toHaveBeenCalled();
});

it('− buzzes: removing a seat is a commit', () => {
  mockQuantities[VIDEOGRAPHER] = 2;
  const r = renderAtStepTwo();
  fireEvent.press(r.getByText('−'), pressEvent());
  expect(commitFeedback).toHaveBeenCalledTimes(1);
});

it('+ buzzes: adding a seat is a commit', () => {
  mockQuantities[VIDEOGRAPHER] = 2;
  const r = renderAtStepTwo();
  fireEvent.press(r.getByText('+'), pressEvent());
  expect(commitFeedback).toHaveBeenCalledTimes(1);
});

it('gives the tile press-down scale feedback', () => {
  const r = renderAtStepTwo();
  expect(mockSharedValues).not.toHaveLength(0);
  const before = mockSharedValues.map((s) => s.value);
  fireEvent(r.getByText('Videographer'), 'pressIn');
  const after = mockSharedValues.map((s) => s.value);
  expect(after.some((v, i) => v < before[i])).toBe(true);
});
