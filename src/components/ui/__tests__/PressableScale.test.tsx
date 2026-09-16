import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { PressableScale } from '../PressableScale';
import { tapFeedback, commitFeedback } from '@core/haptics';

/**
 * The app's press affordance. Every other touch target in BAMA is a
 * TouchableOpacity, which fades opacity and nothing else; on a photographic
 * role tile a 15% fade is close to invisible.
 *
 * Guarded here:
 *  - the press is felt on press-DOWN (the scale), because response that waits
 *    for release reads as lag
 *  - the haptic fires on RELEASE, on the same event as the state change it
 *    accompanies — a buzz on press-down would land a whole press before the
 *    thing it is supposed to be confirming
 *  - a haptic is opt-in per call site, so it stays a meaningful signal
 *  - reduce-motion removes the scale but keeps the haptic: the setting is
 *    about vestibular motion, not about touch feedback
 *
 * reanimated has no shared mock in this repo (see PortfolioViewer.test.tsx),
 * hence the local one. It exposes the shared values so a test can read the
 * component's own scale rather than assert on the mock.
 */

const mockSharedValues: { value: number }[] = [];
let mockReducedMotion = false;

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
    // The swap in goToStep lives in the completion callback, so the mock has to
    // invoke it or no test ever reaches step 2.
    withSpring: (v: number, _cfg?: unknown, cb?: (f: boolean) => void) => { cb?.(true); return v; },
    runOnJS: (fn: unknown) => fn,
    useReducedMotion: () => mockReducedMotion,
  };
});

jest.mock('@core/haptics', () => ({
  tapFeedback: jest.fn(),
  commitFeedback: jest.fn(),
}));

const scale = () => mockSharedValues[0].value;

beforeEach(() => {
  jest.clearAllMocks();
  mockSharedValues.length = 0;
  mockReducedMotion = false;
});

it('shrinks on press-down and restores on release', () => {
  const r = render(<PressableScale><Text>Tile</Text></PressableScale>);
  const target = r.getByText('Tile');

  expect(scale()).toBe(1);
  fireEvent(target, 'pressIn');
  expect(scale()).toBeLessThan(1);
  fireEvent(target, 'pressOut');
  expect(scale()).toBe(1);
});

it('honours a custom activeScale', () => {
  const r = render(<PressableScale activeScale={0.8}><Text>Tile</Text></PressableScale>);
  fireEvent(r.getByText('Tile'), 'pressIn');
  expect(scale()).toBe(0.8);
});

it('still calls onPress', () => {
  const onPress = jest.fn();
  const r = render(<PressableScale onPress={onPress}><Text>Tile</Text></PressableScale>);
  fireEvent.press(r.getByText('Tile'));
  expect(onPress).toHaveBeenCalledTimes(1);
});

it('fires no haptic unless one is asked for', () => {
  const r = render(<PressableScale onPress={jest.fn()}><Text>Tile</Text></PressableScale>);
  fireEvent(r.getByText('Tile'), 'pressIn');
  fireEvent.press(r.getByText('Tile'));
  expect(tapFeedback).not.toHaveBeenCalled();
  expect(commitFeedback).not.toHaveBeenCalled();
});

it('fires a tap haptic on release, not on press-down', () => {
  const r = render(<PressableScale haptic="tap"><Text>Tile</Text></PressableScale>);
  fireEvent(r.getByText('Tile'), 'pressIn');
  expect(tapFeedback).not.toHaveBeenCalled();

  fireEvent.press(r.getByText('Tile'));
  expect(tapFeedback).toHaveBeenCalledTimes(1);
  expect(commitFeedback).not.toHaveBeenCalled();
});

it('fires a commit haptic on release when asked', () => {
  const r = render(<PressableScale haptic="commit"><Text>Tile</Text></PressableScale>);
  fireEvent.press(r.getByText('Tile'));
  expect(commitFeedback).toHaveBeenCalledTimes(1);
  expect(tapFeedback).not.toHaveBeenCalled();
});

it('does not fire a haptic when the press is disabled', () => {
  const r = render(<PressableScale haptic="tap" disabled><Text>Tile</Text></PressableScale>);
  fireEvent.press(r.getByText('Tile'));
  expect(tapFeedback).not.toHaveBeenCalled();
});

describe('reduce-motion', () => {
  it('holds the scale at 1 through a press', () => {
    mockReducedMotion = true;
    const r = render(<PressableScale><Text>Tile</Text></PressableScale>);
    fireEvent(r.getByText('Tile'), 'pressIn');
    expect(scale()).toBe(1);
  });

  it('still fires the haptic — the setting is about motion, not touch', () => {
    mockReducedMotion = true;
    const r = render(<PressableScale haptic="commit"><Text>Tile</Text></PressableScale>);
    fireEvent.press(r.getByText('Tile'));
    expect(commitFeedback).toHaveBeenCalledTimes(1);
  });
});
