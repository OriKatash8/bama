import React from 'react';
import { Platform, StyleSheet, Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { SwipeableMessageRow } from '../SwipeableMessageRow';
import { replyPanConfig } from '../../utils/replySwipe';

jest.mock('../../utils/replySwipe', () => {
  const actual = jest.requireActual('../../utils/replySwipe');
  return { ...actual, replyPanConfig: jest.fn(actual.replyPanConfig) };
});

/**
 * The row that can be swiped to reply.
 *
 * The gesture arithmetic is tested in utils/replySwipe.test.ts; what is tested
 * here is the WIRING — that the row actually hands its drags to that config,
 * that a non-repliable row stands down, and that the two things which have no
 * pure function behind them are right:
 *
 *  - LONG-PRESS, which is the only entry point that exists on the web, where a
 *    mouse cannot swipe. Without it this feature does not exist on
 *    localhost:8081, which is where most of the app is reviewed.
 *  - The WEB page-swipe guard, without which the browser reads a horizontal
 *    drag as "go back in history" and leaves the chat mid-reply.
 */

const SCREEN = 400;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 400, height: 800, scale: 2, fontScale: 1 }),
}));

function show(props: Partial<React.ComponentProps<typeof SwipeableMessageRow>> = {}) {
  return render(
    <SwipeableMessageRow enabled rtl={false} accent="#6D28D9" onReply={() => {}} {...props}>
      <Text>a message</Text>
    </SwipeableMessageRow>,
  );
}

describe('long-press — the web entry point', () => {
  it('replies on a long press', () => {
    const replied: boolean[] = [];
    const r = show({ onReply: () => replied.push(true) });
    fireEvent(r.getByTestId('message-row'), 'longPress');
    expect(replied).toEqual([true]);
  });

  it('does NOT reply on an ordinary press', () => {
    // The anchor: a plain tap has to keep reaching what is under it — opening a
    // photo, playing a voice note, tapping a mention.
    const replied: boolean[] = [];
    const r = show({ onReply: () => replied.push(true) });
    fireEvent.press(r.getByTestId('message-row'));
    expect(replied).toEqual([]);
  });

  it('does not long-press a row that cannot be replied to', () => {
    const replied: boolean[] = [];
    const r = show({ enabled: false, onReply: () => replied.push(true) });
    fireEvent(r.getByTestId('message-row'), 'longPress');
    expect(replied).toEqual([]);
  });

  it('carries a reply label for screen readers', () => {
    expect(show().getByTestId('message-row').props.accessibilityHint ?? '').not.toBe('');
  });
});

describe('what it renders', () => {
  it('renders the bubble it was given', () => {
    expect(show().queryByText('a message')).not.toBeNull();
  });

  it('renders a non-repliable row unchanged, still showing its content', () => {
    expect(show({ enabled: false }).queryByText('a message')).not.toBeNull();
  });
});

describe('the web page-swipe guard', () => {
  const withPlatform = (os: string, fn: () => void) => {
    const prev = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
    try { fn(); } finally { Object.defineProperty(Platform, 'OS', { value: prev, configurable: true }); }
  };

  it('claims the horizontal axis on the web, so the browser does not go back', () => {
    withPlatform('web', () => {
      const s = StyleSheet.flatten(show().getByTestId('message-row').props.style) as Record<string, unknown>;
      expect(s.touchAction).toBe('pan-y');
      expect(s.overscrollBehaviorX).toBe('contain');
    });
  });

  it('adds no such style on native, which has no browser to fight', () => {
    withPlatform('ios', () => {
      const s = StyleSheet.flatten(show().getByTestId('message-row').props.style) as Record<string, unknown>;
      expect(s.touchAction).toBeUndefined();
    });
  });
});

describe('the gesture is actually attached', () => {
  /**
   * PanResponder derives its gestureState from its own internal touch history,
   * so handing its callbacks a synthetic one tests nothing — it is ignored. The
   * arithmetic is covered directly in utils/replySwipe.test.ts; what is left to
   * check here is that this row hands that config the CURRENT enabled, rtl and
   * width, and hooks its callbacks up to the right things.
   */
  const captured = () => (replyPanConfig as jest.Mock).mock.calls.at(-1)![0];

  beforeEach(() => (replyPanConfig as jest.Mock).mockClear());

  it('creates the responder ONCE, however many times the row re-renders', () => {
    // The anchor for every "live value" test below. PanResponder keeps its
    // gestureState in the closure it was created with, so a responder rebuilt
    // mid-render loses the history of a drag already in progress. Reading the
    // newest config cannot tell "read through a ref" apart from "rebuilt every
    // render" — only this can.
    const r = show({ onReply: () => {} });
    r.rerender(
      <SwipeableMessageRow enabled rtl accent="#000" onReply={() => {}}>
        <Text>a message</Text>
      </SwipeableMessageRow>,
    );
    r.rerender(
      <SwipeableMessageRow enabled={false} rtl={false} accent="#fff" onReply={() => {}}>
        <Text>a message</Text>
      </SwipeableMessageRow>,
    );
    expect((replyPanConfig as jest.Mock).mock.calls).toHaveLength(1);
  });

  it('passes the live rtl through, not a value captured at mount', () => {
    const r = show({ rtl: false });
    expect(captured().rtl()).toBe(false);
    r.rerender(
      <SwipeableMessageRow enabled rtl accent="#6D28D9" onReply={() => {}}>
        <Text>a message</Text>
      </SwipeableMessageRow>,
    );
    // The responder is created once. Reading through a ref is what stops a
    // language switch mid-session from leaving the row swiping the old way.
    expect(captured().rtl()).toBe(true);
  });

  it('passes the live enabled through', () => {
    const r = show({ enabled: true });
    expect(captured().enabled()).toBe(true);
    r.rerender(
      <SwipeableMessageRow enabled={false} rtl={false} accent="#6D28D9" onReply={() => {}}>
        <Text>a message</Text>
      </SwipeableMessageRow>,
    );
    expect(captured().enabled()).toBe(false);
  });

  it('passes the screen width, which is what the edge exclusion measures against', () => {
    show();
    expect(captured().screenWidth()).toBe(SCREEN);
  });

  it('calls the CURRENT onReply, not the one from the first render', () => {
    const calls: string[] = [];
    const r = show({ onReply: () => calls.push('first') });
    r.rerender(
      <SwipeableMessageRow enabled rtl={false} accent="#6D28D9" onReply={() => calls.push('second')}>
        <Text>a message</Text>
      </SwipeableMessageRow>,
    );
    captured().onReply();
    expect(calls).toEqual(['second']);
  });

  it('does not attach the pan handlers at all when the row is not repliable', () => {
    // Not merely disabled inside the config: an unrepliable row must not sit
    // between the list and the bubble claiming responders.
    expect(show({ enabled: false }).getByTestId('message-row').props.onMoveShouldSetResponder)
      .toBeUndefined();
    expect(show({ enabled: true }).getByTestId('message-row').props.onMoveShouldSetResponder)
      .toBeDefined();
  });
});
