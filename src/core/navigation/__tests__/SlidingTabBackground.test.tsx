import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { SlidingTabBackground } from '../SlidingTabBackground';
import { TAB_BAR_CONTENT_HEIGHT, TAB_ITEM_STYLE } from '../floatingTabBar';

jest.mock('expo-router', () => ({ useSegments: () => ['(professional)', '(tabs)', 'dashboard'] }));

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
