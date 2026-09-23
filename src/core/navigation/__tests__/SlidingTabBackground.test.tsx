import React from 'react';
import { Animated, StyleSheet } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { SlidingTabBackground } from '../SlidingTabBackground';
import { TAB_BAR_CONTENT_HEIGHT, TAB_ITEM_STYLE } from '../floatingTabBar';

let mockSegments: string[] = ['(professional)', '(tabs)', 'dashboard'];
jest.mock('expo-router', () => ({ useSegments: () => mockSegments }));

/**
 * The highlight pill must contain the whole tab — icon and label — or its edge
 * runs through the text. Heebo's line box is 16pt at the 10pt label size.
 */
it('the pill spans the icon and the Hebrew label, top to bottom', async () => {
  const r = render(
    <SlidingTabBackground
      numTabs={4}
      tabNames={['dashboard', 'marketplace', 'chats', 'profile']}
      activeColor="#6D28D9"
      bandHeight={TAB_BAR_CONTENT_HEIGHT}
      radius={TAB_BAR_CONTENT_HEIGHT / 2}
    />,
  );
  const band = r.UNSAFE_root.findAll((n) => n.props.onLayout)[0];
  await act(async () => { fireEvent(band, 'layout', { nativeEvent: { layout: { width: 358, height: TAB_BAR_CONTENT_HEIGHT } } }); });
  const pill = StyleSheet.flatten(
    r.UNSAFE_root.findAll((n) => StyleSheet.flatten(n.props.style)?.borderRadius === 100)[0].props.style,
  );
  const pillTop = pill.top as number;
  const pillBottom = TAB_BAR_CONTENT_HEIGHT - (pill.bottom as number);

  // Tab content: icon box 28, then the label (16pt line box) pulled up 4 —
  // centred in the item between its top and bottom padding.
  const content = 28 + 16 - 4;
  const padTop = TAB_ITEM_STYLE.paddingTop as number;
  const padBottom = TAB_ITEM_STYLE.paddingBottom as number;
  const contentTop = padTop + (TAB_BAR_CONTENT_HEIGHT - padTop - padBottom - content) / 2;
  const contentBottom = contentTop + content;
  // Not just inside — clear of the text by a visible margin on both sides.
  expect(contentTop - pillTop).toBeGreaterThanOrEqual(4);
  expect(pillBottom - contentBottom).toBeGreaterThanOrEqual(4);
});


/**
 * The pill follows the TABS. A route that is not one leaves it alone.
 *
 * The chat room moved above the tab navigator, so its segments are
 * ['(client)', 'chat', '[chatId]'] — no tab name among them. The old
 * `?? tabNames[0]` read that as "home": the pill sprang to the first tab while
 * the chat covered it, and sliding back to the list animated it the whole way
 * across. "Not a tab" means the selection has not changed, not that it is home.
 */
describe('a route that is not a tab', () => {
  const TABS = ['home', 'browse', 'chats', 'projects'];

  function renderOn(segments: string[]) {
    mockSegments = segments;
    return render(
      <SlidingTabBackground
        numTabs={4}
        tabNames={TABS}
        activeColor="#6D28D9"
        bandHeight={TAB_BAR_CONTENT_HEIGHT}
        radius={TAB_BAR_CONTENT_HEIGHT / 2}
      />,
    );
  }

  let spring: jest.SpyInstance;
  beforeEach(() => {
    spring = jest.spyOn(Animated, 'spring');
  });
  afterEach(() => { spring.mockRestore(); });

  /** The `toValue` of every spring started since the spy was installed. */
  const targets = () => spring.mock.calls.map((c) => (c[1] as { toValue: number }).toValue);

  it('moves the pill for a real tab change', () => {
    // The anchor: without it, "never animates" would pass on a broken component.
    const r = renderOn(['(client)', '(tabs)', 'chats']);
    expect(targets()).toEqual([2]);

    mockSegments = ['(client)', '(tabs)', 'projects'];
    act(() => { r.rerender(
      <SlidingTabBackground numTabs={4} tabNames={TABS} activeColor="#6D28D9"
        bandHeight={TAB_BAR_CONTENT_HEIGHT} radius={TAB_BAR_CONTENT_HEIGHT / 2} />,
    ); });
    expect(targets()).toEqual([2, 3]);
  });

  it('does NOT move it when the route above the tabs is not one', () => {
    const r = renderOn(['(client)', '(tabs)', 'chats']);
    expect(targets()).toEqual([2]);

    // Into the chat room, which sits above the tab navigator.
    mockSegments = ['(client)', 'chat', '[chatId]'];
    act(() => { r.rerender(
      <SlidingTabBackground numTabs={4} tabNames={TABS} activeColor="#6D28D9"
        bandHeight={TAB_BAR_CONTENT_HEIGHT} radius={TAB_BAR_CONTENT_HEIGHT / 2} />,
    ); });
    // Nothing new: the pill is still on chats, where it was left.
    expect(targets()).toEqual([2]);
  });

  it('is already there when the list comes back, so the return is instant', () => {
    const r = renderOn(['(client)', '(tabs)', 'chats']);
    const rerenderOn = (segments: string[]) => {
      mockSegments = segments;
      act(() => { r.rerender(
        <SlidingTabBackground numTabs={4} tabNames={TABS} activeColor="#6D28D9"
          bandHeight={TAB_BAR_CONTENT_HEIGHT} radius={TAB_BAR_CONTENT_HEIGHT / 2} />,
      ); });
    };
    rerenderOn(['(client)', 'chat', '[chatId]']);
    rerenderOn(['(client)', '(tabs)', 'chats']);
    // Across the whole round trip the pill is never aimed anywhere but chats.
    //
    // Asserted as a set, not a list, because coming back does re-run the effect
    // and start a spring — but one whose target is the index the pill is
    // already sitting on, which moves nothing. A repeated 2 is invisible; a 0
    // in here is the bug, because that is a real distance to travel and the
    // user watches it cross the bar.
    expect(new Set(targets())).toEqual(new Set([2]));
    expect(targets()).not.toContain(0);
  });
});
