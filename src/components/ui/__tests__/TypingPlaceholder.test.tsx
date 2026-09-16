import React from 'react';
import { render, act } from '@testing-library/react-native';
import { TypingPlaceholder, TYPE_MS, HOLD_MS } from '../TypingPlaceholder';

/**
 * The description field's placeholder types out example briefs so a client can
 * see what "enough detail" looks like.
 *
 * It sits BEHIND an input that has no placeholder of its own, because RN's
 * `placeholder` prop takes a string: driving it per character would re-render
 * the TextInput about thirty times per example, on a screen that also holds a
 * FlatList of role tiles. Here the per-character state is owned by this leaf, so
 * nothing above it re-renders.
 *
 * Four rules, all load-bearing:
 *  - it stops for good the moment the field is touched. Nothing moves while
 *    someone is typing their own answer.
 *  - reduce-motion gets no typing at all, just one example.
 *  - it LOOPS through the list. The guard against a field that animates under
 *    someone trying to read it is the latch below, not a finite run.
 *  - in Hebrew the string builds right-to-left with the caret on its left.
 */

const EXAMPLES = ['abc', 'de'] as const;
const FALLBACK = 'static fallback';

let mockReducedMotion = false;
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  useReducedMotion: () => mockReducedMotion,
}));

function setup(over: Partial<React.ComponentProps<typeof TypingPlaceholder>> = {}) {
  return render(
    <TypingPlaceholder
      examples={EXAMPLES}
      fallback={FALLBACK}
      rtl={false}
      stopped={false}
      hidden={false}
      {...over}
    />,
  );
}

/** Advance far enough to type `chars` characters. */
const type = (chars: number) => act(() => { jest.advanceTimersByTime(TYPE_MS * chars); });
const hold = () => act(() => { jest.advanceTimersByTime(HOLD_MS + TYPE_MS); });

beforeEach(() => {
  jest.useFakeTimers();
  mockReducedMotion = false;
});
afterEach(() => {
  act(() => { jest.runOnlyPendingTimers(); });
  jest.useRealTimers();
});

it('types the first example one character at a time', () => {
  const r = setup();
  expect(r.getByTestId('typing-text')).toHaveTextContent('');

  type(1);
  expect(r.getByTestId('typing-text')).toHaveTextContent('a');
  type(1);
  expect(r.getByTestId('typing-text')).toHaveTextContent('ab');
  type(1);
  expect(r.getByTestId('typing-text')).toHaveTextContent('abc');
});

it('loops back to the first example after the last, and keeps going', () => {
  const r = setup();
  type(3);
  expect(r.getByTestId('typing-text')).toHaveTextContent('abc');

  hold();
  type(2);
  expect(r.getByTestId('typing-text')).toHaveTextContent('de');

  // Past the end of the list it wraps rather than settling.
  hold();
  type(3);
  expect(r.getByTestId('typing-text')).toHaveTextContent('abc');
  expect(jest.getTimerCount()).toBeGreaterThan(0);
});

it('stops for good the moment the field is touched, and shows the fallback', () => {
  const r = setup();
  type(2);

  r.rerender(
    <TypingPlaceholder examples={EXAMPLES} fallback={FALLBACK} rtl={false} stopped hidden={false} />,
  );
  expect(r.getByTestId('typing-text')).toHaveTextContent(FALLBACK);
  expect(jest.getTimerCount()).toBe(0);

  // Blurring an empty field must NOT restart it — the latch is permanent.
  r.rerender(
    <TypingPlaceholder
      examples={EXAMPLES} fallback={FALLBACK} rtl={false} stopped={false} hidden={false}
    />,
  );
  type(5);
  expect(r.getByTestId('typing-text')).toHaveTextContent(FALLBACK);
  expect(jest.getTimerCount()).toBe(0);
});

it('never types under reduce-motion — one example, no timers', () => {
  mockReducedMotion = true;
  const r = setup();

  expect(r.getByTestId('typing-text')).toHaveTextContent(EXAMPLES[0]);
  expect(jest.getTimerCount()).toBe(0);
});

it('renders nothing once the field has content', () => {
  const r = setup({ hidden: true });
  expect(r.queryByTestId('typing-placeholder')).toBeNull();
  expect(jest.getTimerCount()).toBe(0);
});

describe('RTL', () => {
  it('builds right-to-left with the caret trailing, so it sits on the left', () => {
    const r = setup({ rtl: true });
    type(2);
    const node = r.getByTestId('typing-placeholder');
    const style = Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean));

    expect(style.textAlign).toBe('right');
    expect(style.writingDirection).toBe('rtl');
    // The caret is last in the logical string; an RTL paragraph renders it leftmost.
    expect(r.getByTestId('typing-text')).toHaveTextContent('ab');
    expect(r.getByTestId('typing-caret')).toBeTruthy();
  });

  it('is left-aligned in English', () => {
    const r = setup({ rtl: false });
    const node = r.getByTestId('typing-placeholder');
    const style = Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean));
    expect(style.textAlign).toBe('left');
    expect(style.writingDirection).toBe('ltr');
  });
});
