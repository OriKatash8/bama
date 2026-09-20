import React from 'react';
import { AccessibilityInfo, StyleSheet, type ViewStyle } from 'react-native';
import { render, act } from '@testing-library/react-native';
import { GlassTabBarBackground } from '../GlassTabBarBackground';
import {
  getDockedTabBarStyle,
  TAB_BAR_CONTENT_HEIGHT,
  TAB_BAR_BOTTOM_OFFSET,
  TAB_BAR_SIDE_MARGIN,
  TAB_BAR_CAPSULE_RADIUS,
} from '../floatingTabBar';

/**
 * The bar is a blur unless Reduce Transparency is on — and it follows the
 * setting live, not just at mount.
 */

jest.mock('expo-router', () => ({ useSegments: () => ['(client)', '(tabs)', 'home'] }));
jest.mock('expo-blur', () => {
  const { View } = require('react-native');
  return { BlurView: (p: object) => <View testID="blur" {...p} /> };
});

let mockGlassApi = false;
jest.mock('expo-glass-effect', () => {
  const { View } = require('react-native');
  return {
    GlassView: (p: object) => <View {...p} />,
    isGlassEffectAPIAvailable: () => mockGlassApi,
  };
});

let emit: ((on: boolean) => void) | null = null;
const remove = jest.fn();

beforeEach(() => {
  mockGlassApi = false;
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

describe('Liquid Glass', () => {
  it('uses GlassView when the glass API is available, with no manual hairline', async () => {
    mockGlassApi = true;
    const r = render(<GlassTabBarBackground {...props} />);
    await act(async () => {});
    expect(r.queryByTestId('tabbar-glass')).toBeTruthy();
    expect(r.queryByTestId('blur')).toBeNull();
    expect(StyleSheet.flatten(r.getByTestId('tabbar-glass').props.style).borderWidth).toBeUndefined();
  });

  it('keeps the blur, with the hairline as a rounded border, when the API is not available', async () => {
    const r = render(<GlassTabBarBackground {...props} />);
    await act(async () => {});
    expect(r.queryByTestId('tabbar-glass')).toBeNull();
    expect(r.queryByTestId('blur')).toBeTruthy();
    const wrap = StyleSheet.flatten(r.getByTestId('tabbar-capsule').props.style);
    expect(wrap.borderWidth).toBe(StyleSheet.hairlineWidth);
    expect(wrap.overflow).toBe('hidden');
    expect(wrap.borderRadius).toBe(TAB_BAR_CAPSULE_RADIUS);
  });

  it('Reduce Transparency still wins: solid, no glass, no blur', async () => {
    mockGlassApi = true;
    const r = render(<GlassTabBarBackground {...props} />);
    await act(async () => {});
    act(() => emit!(true));
    expect(r.queryByTestId('tabbar-solid')).toBeTruthy();
    expect(r.queryByTestId('tabbar-glass')).toBeNull();
    expect(r.queryByTestId('blur')).toBeNull();
  });

  it('never sets opacity on the glass material', async () => {
    mockGlassApi = true;
    const r = render(<GlassTabBarBackground {...props} />);
    await act(async () => {});
    expect(StyleSheet.flatten(r.getByTestId('tabbar-glass').props.style).opacity).toBeUndefined();
  });
});

describe('capsule shape', () => {
  function frameOf(style: ViewStyle) {
    const f = StyleSheet.flatten(style);
    return { top: f.top, left: f.left, right: f.right, height: f.height, borderRadius: f.borderRadius };
  }
  const expected = {
    top: 0,
    left: TAB_BAR_SIDE_MARGIN,
    right: TAB_BAR_SIDE_MARGIN,
    height: TAB_BAR_CONTENT_HEIGHT,
    borderRadius: TAB_BAR_CONTENT_HEIGHT / 2,
  };

  it('glass, blur and solid all draw the same capsule', async () => {
    mockGlassApi = true;
    const glass = render(<GlassTabBarBackground {...props} />);
    await act(async () => {});
    expect(frameOf(glass.getByTestId('tabbar-glass').props.style)).toEqual(expected);
    glass.unmount();

    mockGlassApi = false;
    const blur = render(<GlassTabBarBackground {...props} />);
    await act(async () => {});
    expect(frameOf(blur.getByTestId('tabbar-capsule').props.style)).toEqual(expected);
    act(() => emit!(true));
    expect(frameOf(blur.getByTestId('tabbar-solid').props.style)).toEqual(expected);
  });

  it('every path gets the soft shadow, on a capsule-shaped layer with no fill of its own', async () => {
    for (const glass of [true, false]) {
      mockGlassApi = glass;
      const r = render(<GlassTabBarBackground {...props} />);
      await act(async () => {});
      const sh = StyleSheet.flatten(r.getByTestId('tabbar-shadow').props.style);
      expect(frameOf(sh)).toEqual(expected);
      expect(typeof sh.boxShadow).toBe('string');
      expect(sh.backgroundColor).toBeUndefined();
      expect(sh.opacity).toBeUndefined();
      r.unmount();
    }
  });

  it('the blur carries the radius itself too (web clips backdrop-filter by its own radius)', async () => {
    const r = render(<GlassTabBarBackground {...props} />);
    await act(async () => {});
    expect(StyleSheet.flatten(r.getByTestId('blur').props.style).borderRadius).toBe(TAB_BAR_CAPSULE_RADIUS);
  });

  it('the bar box keeps the clearance contract: height includes the inset and the float gap', () => {
    const inset = 34;
    const box = getDockedTabBarStyle(inset);
    expect(box.height).toBe(TAB_BAR_CONTENT_HEIGHT + inset + TAB_BAR_BOTTOM_OFFSET);
    // No inset (Android, web): the space below the capsule never goes negative.
    expect(getDockedTabBarStyle(0).paddingBottom).toBe(0);
    expect(getDockedTabBarStyle(0).height).toBe(TAB_BAR_CONTENT_HEIGHT);
    // The tab row is the box minus its padding: exactly the capsule band, so no
    // touch target reaches into the float gap, the inset or the side margins.
    expect((box.height as number) - (box.paddingBottom as number) - (box.paddingTop as number)).toBe(TAB_BAR_CONTENT_HEIGHT);
    expect(box.paddingHorizontal).toBe(TAB_BAR_SIDE_MARGIN);
    expect(box.pointerEvents).toBe('box-none');
  });
});
