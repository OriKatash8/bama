import React from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import { render } from '@testing-library/react-native';
import type { ReactTestInstance } from 'react-test-renderer';
import { SwipeableMessageRow } from '../SwipeableMessageRow';

/**
 * THE WRAPPER MUST NOT CHANGE HOW A MESSAGE LAYS OUT OR WHO HANDLES ITS TOUCHES.
 *
 * This file exists because a release shipped where every bubble in every chat
 * was clipped and the swipe never fired, and 1404 tests caught neither. Nothing
 * rendered a real message through the real wrapper, and the one gesture
 * assertion there was — `onMoveShouldSetResponder` is defined — happened to be
 * satisfied by the single handler that still worked.
 *
 * Jest does not run Yoga, so none of this measures pixels. It pins the CAUSES
 * of the two failures instead, both of which are structural and both of which
 * are visible in the rendered tree:
 *
 *  1. The bubble's own parent must be the box carrying the caller's layout
 *     style. `styles.bubble` is `maxWidth: '75%'` and `styles.mediaBubble` is
 *     `width: '75%'`; a percentage resolves against the PARENT's width, so an
 *     unstyled, content-sized box between the row and the bubble silently
 *     reinterprets both.
 *  2. Every handler PanResponder produced must reach the node by identity. A
 *     Pressable renders `<View {...restProps} {...pressabilityHandlers}>`, so
 *     spreading panHandlers onto one overwrites five of them with Pressability's
 *     and leaves a gesture that claims the touch and then does nothing.
 */

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true, default: () => ({ width: 400, height: 800, scale: 2, fontScale: 1 }),
}));

/** What ChatRoomScreen actually passes: bubbleWrapper + wrapperOwn. */
const CALLER_STYLE = [{ flexDirection: 'row' as const }, { justifyContent: 'flex-end' as const }];
const LONG = 'זו הודעה ארוכה מאוד שצריכה להישבר להרבה שורות בתוך הבועה. '.repeat(12);

function showMessage(style: object[] = CALLER_STYLE) {
  return render(
    <SwipeableMessageRow enabled rtl={false} accent="#6D28D9" onReply={() => {}} style={style}>
      <View testID="bubble" style={{ maxWidth: '75%', paddingHorizontal: 14, paddingVertical: 10 }}>
        <Text testID="body">{LONG}</Text>
      </View>
    </SwipeableMessageRow>,
  );
}

const flat = (n?: ReactTestInstance | null) =>
  (StyleSheet.flatten(n?.props?.style) ?? {}) as Record<string, unknown>;

/**
 * The next box up that is genuinely a different element.
 *
 * `.parent` walks the fiber tree, and RN's `View` is a forwardRef composite
 * around a host view — so it yields a second node carrying the SAME testID and
 * the same style. Walking one step lands back on the element you started from,
 * which silently makes every assertion below about the wrong node.
 */
function boxAbove(n: ReactTestInstance): ReactTestInstance | null {
  let p: ReactTestInstance | null = n.parent;
  while (p && p.props?.testID === n.props?.testID) p = p.parent;
  return p;
}

/** Every distinct box from `from` up to and including `to`. */
function chainUp(from: ReactTestInstance, to: ReactTestInstance): ReactTestInstance[] {
  const out: ReactTestInstance[] = [from];
  let n: ReactTestInstance | null = from;
  while (n && n.props?.testID !== to.props?.testID) {
    n = boxAbove(n);
    if (n) out.push(n);
  }
  return out;
}

describe('a long message is not truncated by the wrapper', () => {
  it('sets no numberOfLines on the message body or anything above it', () => {
    const r = showMessage();
    for (const n of chainUp(r.getByTestId('body'), r.getByTestId('message-row'))) {
      expect(n.props.numberOfLines ?? undefined).toBeUndefined();
    }
  });

  it('imposes no height, maxHeight or overflow anywhere above the bubble', () => {
    // A row that clipped for the swipe reveal would clip the bubble with it.
    const r = showMessage();
    for (const n of chainUp(r.getByTestId('bubble'), r.getByTestId('message-row'))) {
      const s = flat(n);
      expect(s.height).toBeUndefined();
      expect(s.maxHeight).toBeUndefined();
      expect(s.overflow).not.toBe('hidden');
    }
  });

  it('does not let the wrapper shrink the bubble', () => {
    const r = showMessage();
    for (const n of chainUp(r.getByTestId('bubble'), r.getByTestId('message-row'))) {
      const s = flat(n);
      expect(s.flexShrink ?? 0).toBe(0);
      expect(s.flex ?? 0).toBe(0);
    }
  });
});

describe("the bubble's percentage width still has a real parent to measure against", () => {
  it("puts the caller's layout style on the bubble's OWN parent", () => {
    // THE REGRESSION. maxWidth:'75%' resolves against the parent's width, so
    // the parent has to be the full-width row the caller styled — not an
    // unstyled box sized by the very content it is supposed to be bounding.
    const r = showMessage();
    const parent = flat(boxAbove(r.getByTestId('bubble')));
    expect(parent.flexDirection).toBe('row');
    expect(parent.justifyContent).toBe('flex-end');
  });

  it('keeps the peer alignment on that same parent', () => {
    const r = render(
      <SwipeableMessageRow enabled rtl={false} accent="#000" onReply={() => {}}
        style={[{ flexDirection: 'row' }, { justifyContent: 'flex-start' }]}>
        <View testID="bubble" style={{ maxWidth: '75%' }}><Text>hi</Text></View>
      </SwipeableMessageRow>,
    );
    expect(flat(boxAbove(r.getByTestId('bubble'))).justifyContent).toBe('flex-start');
  });

  it('puts no box carrying a width or maxWidth between that parent and the bubble', () => {
    // Anything with its own width in between would re-anchor the percentage a
    // second time, which is the same bug wearing a different hat.
    const r = showMessage();
    const bubble = r.getByTestId('bubble');
    const between = chainUp(bubble, r.getByTestId('message-row')).slice(1, -1);
    for (const n of between) {
      const s = flat(n);
      expect(s.width).toBeUndefined();
      expect(s.maxWidth).toBeUndefined();
    }
  });
});

describe('the gesture handlers actually reach the node', () => {
  it('delivers EVERY PanResponder handler by identity, none overwritten', () => {
    const real = PanResponder.create;
    let panHandlers: Record<string, unknown> = {};
    const spy = jest.spyOn(PanResponder, 'create').mockImplementation((cfg) => {
      const inst = real(cfg);
      panHandlers = inst.panHandlers as unknown as Record<string, unknown>;
      return inst;
    });

    const r = showMessage();
    const target = r.UNSAFE_getAllByType(View).find((n) => {
      const keys = Object.keys(panHandlers);
      return keys.length > 0 && n.props[keys[0]] === panHandlers[keys[0]];
    });

    const overwritten = Object.keys(panHandlers).filter((k) => target?.props[k] !== panHandlers[k]);
    expect({ overwritten }).toEqual({ overwritten: [] });
    spy.mockRestore();
  });

  it('keeps the long-press and the pan on DIFFERENT nodes', () => {
    // They cannot share one. Pressable spreads its own handlers last, so the
    // node that owns onLongPress is precisely the node that would clobber
    // onResponderGrant/Move/Release/Terminate/TerminationRequest.
    const real = PanResponder.create;
    let panHandlers: Record<string, unknown> = {};
    const spy = jest.spyOn(PanResponder, 'create').mockImplementation((cfg) => {
      const inst = real(cfg);
      panHandlers = inst.panHandlers as unknown as Record<string, unknown>;
      return inst;
    });

    const r = showMessage();
    // By props, not by type: the long-press node is a Pressable and the pan
    // node is a View, so searching either type finds only one of the two.
    const panNode = r.UNSAFE_root.findAll(
      (n) => n.props?.onMoveShouldSetResponder === panHandlers.onMoveShouldSetResponder,
      { deep: true },
    )[0];
    const pressNode = r.UNSAFE_root.findAll(
      (n) => typeof n.props?.onLongPress === 'function',
      { deep: true },
    )[0];

    expect(panNode).toBeDefined();
    expect(pressNode).toBeDefined();
    expect(pressNode.props.testID).not.toBe(panNode.props.testID);
    // And the long-press node must not be carrying the pan handlers at all —
    // if it were, Pressability would overwrite five of them.
    expect(pressNode.props.onMoveShouldSetResponder).toBeUndefined();
    expect(pressNode.props.onResponderRelease).not.toBe(panHandlers.onResponderRelease);
    spy.mockRestore();
  });
});
