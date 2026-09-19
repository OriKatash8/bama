import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { render, act } from '@testing-library/react-native';
import { GlassTabBarBackground } from '../GlassTabBarBackground';

/**
 * The bar is a blur unless Reduce Transparency is on — and it follows the
 * setting live, not just at mount.
 */

jest.mock('expo-router', () => ({ useSegments: () => ['(client)', '(tabs)', 'home'] }));
jest.mock('expo-blur', () => {
  const { View } = require('react-native');
  return { BlurView: (p: object) => <View testID="blur" {...p} /> };
});

let emit: ((on: boolean) => void) | null = null;
const remove = jest.fn();

beforeEach(() => {
  emit = null;
  remove.mockClear();
  jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((event: string, fn: (on: boolean) => void) => {
    if (event === 'reduceTransparencyChanged') emit = fn;
    return { remove };
  }) as never);
});

const props = { activeColor: '#004aad', isDark: false, tabNames: ['home', 'browse', 'chats', 'projects'] };

it('blurs by default', async () => {
  const r = render(<GlassTabBarBackground {...props} />);
  await act(async () => {});
  expect(r.queryByTestId('blur')).toBeTruthy();
});

it('goes solid when Reduce Transparency turns on, and back when it turns off', async () => {
  const r = render(<GlassTabBarBackground {...props} />);
  await act(async () => {});
  expect(emit).not.toBeNull();
  act(() => emit!(true));
  expect(r.queryByTestId('blur')).toBeNull();
  act(() => emit!(false));
  expect(r.queryByTestId('blur')).toBeTruthy();
});

it('starts solid when the setting is already on', async () => {
  (AccessibilityInfo.isReduceTransparencyEnabled as jest.Mock).mockResolvedValue(true);
  const r = render(<GlassTabBarBackground {...props} />);
  await act(async () => {});
  expect(r.queryByTestId('blur')).toBeNull();
});

it('unsubscribes on unmount', async () => {
  const r = render(<GlassTabBarBackground {...props} />);
  await act(async () => {});
  r.unmount();
  expect(remove).toHaveBeenCalledTimes(1);
});
