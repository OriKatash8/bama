import React from 'react';
import { StyleSheet } from 'react-native';
import { render, act } from '@testing-library/react-native';
import { ChatVideo } from '../ChatVideo';

/**
 * A chat video takes its own shape, like ChatImage — a vertical video used to
 * sit small inside a fixed 16:9 box. Same caps and per-URL memory.
 */

let mockLast: { style?: unknown; onVideoSize?: (s: { width: number; height: number }) => void } = {};
jest.mock('@components/ui/VideoPlayer', () => ({
  VideoPlayer: (p: typeof mockLast) => { mockLast = p; return null; },
}));

const ratio = () => (StyleSheet.flatten(mockLast.style as never) as { aspectRatio?: number }).aspectRatio;

it('starts 16:9 and takes the vertical shape (capped at 3:4) once the size is known', () => {
  render(<ChatVideo uri="https://x/portrait.mp4" />);
  expect(ratio()).toBe(16 / 9);
  act(() => mockLast.onVideoSize!({ width: 406, height: 720 }));
  expect(ratio()).toBe(3 / 4);
});

it('a square video stays square', () => {
  render(<ChatVideo uri="https://x/square.mp4" />);
  act(() => mockLast.onVideoSize!({ width: 720, height: 720 }));
  expect(ratio()).toBe(1);
});

it('remembers the shape per video', () => {
  render(<ChatVideo uri="https://x/portrait.mp4" />);
  expect(ratio()).toBe(3 / 4);
});
