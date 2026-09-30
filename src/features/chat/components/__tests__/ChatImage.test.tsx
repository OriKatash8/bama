import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import type { ReactTestInstance } from 'react-test-renderer';
import { ChatImage, clampRatio } from '../ChatImage';

/**
 * A chat photo takes its own shape instead of a fixed 16:9 box — a vertical
 * photo used to be cut to a landscape strip. Sized like WhatsApp: taller than
 * 3:4 is cropped at 3:4, wider than 16:9 at 16:9.
 */

const ratioOf = (el: ReactTestInstance) =>
  (StyleSheet.flatten(el.props.style) as { aspectRatio?: number }).aspectRatio;

it('keeps ordinary shapes as they are', () => {
  expect(clampRatio(0.75)).toBe(0.75);
  expect(clampRatio(1)).toBe(1);
  expect(clampRatio(4 / 3)).toBe(4 / 3);
});

it('caps tall photos at 3:4 (a screenshot is cropped, like WhatsApp) and wide ones at 16:9', () => {
  expect(clampRatio(9 / 16)).toBe(3 / 4);
  expect(clampRatio(0.3)).toBe(3 / 4);
  expect(clampRatio(3)).toBe(16 / 9);
});

it('falls back to square for a missing size', () => {
  expect(clampRatio(0)).toBe(1);
  expect(clampRatio(NaN)).toBe(1);
  expect(clampRatio(Infinity)).toBe(1);
});

it('a vertical photo gets a vertical box once it loads', () => {
  const r = render(<ChatImage uri="https://x/portrait.jpg" />);
  const img = r.getByTestId('chat-image');
  expect(ratioOf(img)).toBe(1);
  fireEvent(img, 'load', { nativeEvent: { source: { width: 1080, height: 1440 } } });
  expect(ratioOf(r.getByTestId('chat-image'))).toBe(0.75);
});

it('remembers the shape, so scrolling back does not jump', () => {
  const r = render(<ChatImage uri="https://x/portrait.jpg" />);
  expect(ratioOf(r.getByTestId('chat-image'))).toBe(0.75);
});
