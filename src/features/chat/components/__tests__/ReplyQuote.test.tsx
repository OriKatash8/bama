import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import type { ReactTestInstance } from 'react-test-renderer';
import { ReplyQuote } from '../ReplyQuote';
import type { ReplyTo } from '../../utils/replyTo';

/**
 * The quote block — the same component above the composer and inside a bubble.
 *
 * Three things here are not cosmetic:
 *
 *  - The FONT. AppText picks Heebo vs Montserrat by regex-testing
 *    extractString(children), which returns '' for ELEMENT children, so any
 *    component built from nested <Text> silently renders Hebrew in the Latin
 *    face. MessageBody already works around it; this block has to as well.
 *  - The SIDE of the accent bar. The app is layout-LTR-locked, so `start`/`end`
 *    are permanent aliases for left/right and cannot be used — the side is
 *    chosen explicitly from `rtl`, like everything else in this screen.
 *  - The EMPTY snippet. A voice note always has `text: ''` and a photo usually
 *    has no caption, so the common case renders a blank strip unless the kind
 *    label stands in for it.
 */

jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'he' }),
}));

const T: Record<string, string> = {
  'chats.reply_to_you': 'You',
  'chats.reply_photo': 'Photo',
  'chats.reply_video': 'Video',
  'chats.reply_voice': 'Voice message',
  'chats.reply_message': 'Message',
  'chats.cancel_reply': 'Cancel reply',
};
const t = (k: string) => T[k] ?? k;

const quote = (over: Partial<ReplyTo> = {}): ReplyTo => ({
  messageId: 'm0', senderId: 'u-dana', kind: 'text', snippet: 'the original', ...over,
});

function show(props: Partial<React.ComponentProps<typeof ReplyQuote>> = {}) {
  return render(
    <ReplyQuote
      replyTo={quote()}
      rtl={false}
      accent="#6D28D9"
      color="#000"
      names={{ 'u-dana': 'Dana Cohen' }}
      currentUserId="u-me"
      t={t}
      variant="bubble"
      {...props}
    />,
  );
}

const flat = (n: ReactTestInstance) => StyleSheet.flatten(n.props.style) as Record<string, unknown>;

describe('what it says', () => {
  it('names the person who wrote the original', () => {
    expect(show().queryByText(/Dana Cohen/)).not.toBeNull();
  });

  it("says 'You' when you are quoting yourself", () => {
    expect(show({ replyTo: quote({ senderId: 'u-me' }) }).queryByText(/You/)).not.toBeNull();
  });

  it('falls back without blanking when the name has not loaded', () => {
    // Names arrive from an async effect. A quote rendered before they land must
    // still show its snippet rather than an empty strip.
    const r = show({ names: {} });
    expect(r.queryByText('the original')).not.toBeNull();
  });

  it('shows the snippet', () => {
    expect(show().queryByText('the original')).not.toBeNull();
  });
});

describe('a quote with no text of its own', () => {
  it('labels a caption-less photo', () => {
    expect(show({ replyTo: quote({ kind: 'image', snippet: '' }) }).queryByText('Photo')).not.toBeNull();
  });

  it('labels a video', () => {
    expect(show({ replyTo: quote({ kind: 'video', snippet: '' }) }).queryByText('Video')).not.toBeNull();
  });

  it('labels a voice note, which never has text', () => {
    expect(show({ replyTo: quote({ kind: 'audio', snippet: '' }) }).queryByText('Voice message')).not.toBeNull();
  });

  it('labels a text message that somehow arrived empty', () => {
    expect(show({ replyTo: quote({ kind: 'text', snippet: '' }) }).queryByText('Message')).not.toBeNull();
  });

  it('prefers the CAPTION over the label when a photo has one', () => {
    // The anchor: without it, always printing the label would pass every case
    // above and silently drop every caption in the app.
    const r = show({ replyTo: quote({ kind: 'image', snippet: 'on set' }) });
    expect(r.queryByText('on set')).not.toBeNull();
    expect(r.queryByText('Photo')).toBeNull();
  });
});

describe('the font trap', () => {
  it('renders a Hebrew snippet in Heebo, not the Latin face', () => {
    const r = show({ replyTo: quote({ snippet: 'שלום לכולם' }) });
    expect(flat(r.getByTestId('reply-quote-snippet')).fontFamily).toMatch(/Heebo/);
  });

  it('renders a Latin snippet in Montserrat', () => {
    const r = show({ replyTo: quote({ snippet: 'see above' }) });
    expect(flat(r.getByTestId('reply-quote-snippet')).fontFamily).toBe('Montserrat');
  });

  it('picks the face per STRING, so a Hebrew name over a Latin snippet still works', () => {
    // The anchor for the two above: one hardcoded family would satisfy either
    // test alone. They have to disagree within a single render.
    const r = show({ names: { 'u-dana': 'דנה כהן' }, replyTo: quote({ snippet: 'see above' }) });
    expect(flat(r.getByTestId('reply-quote-name')).fontFamily).toMatch(/Heebo/);
    expect(flat(r.getByTestId('reply-quote-snippet')).fontFamily).toBe('Montserrat');
  });
});

describe('RTL', () => {
  it('puts the accent bar on the left in English', () => {
    const s = flat(show({ rtl: false }).getByTestId('reply-quote'));
    expect(s.borderLeftWidth).toBeGreaterThan(0);
    expect(s.borderRightWidth ?? 0).toBe(0);
  });

  it('puts it on the right in Hebrew', () => {
    const s = flat(show({ rtl: true }).getByTestId('reply-quote'));
    expect(s.borderRightWidth).toBeGreaterThan(0);
    expect(s.borderLeftWidth ?? 0).toBe(0);
  });

  it('never uses start/end, which are dead in a forceRTL(false) app', () => {
    const s = flat(show({ rtl: true }).getByTestId('reply-quote'));
    expect(s.borderStartWidth).toBeUndefined();
    expect(s.borderEndWidth).toBeUndefined();
  });

  it('aligns the text to the reading side', () => {
    expect(flat(show({ rtl: true }).getByTestId('reply-quote-snippet')).textAlign).toBe('right');
    expect(flat(show({ rtl: false }).getByTestId('reply-quote-snippet')).textAlign).toBe('left');
  });

  it('isolates the name so a Latin one cannot scramble a Hebrew line', () => {
    // U+2068 FSI … U+2069 PDI. Applied at render only — the stored snippet must
    // stay free of invisible characters.
    const r = show({ rtl: true, names: { 'u-dana': 'Dana Cohen' } });
    expect(r.getByTestId('reply-quote-name').props.children).toMatch(/⁨.*⁩/);
  });
});

describe('the bubble is sized by the QUOTE, not by the reply', () => {
  /**
   * Replying "ok" to a long message must not squeeze the quote to the width of
   * the word "ok".
   *
   * `styles.bubble` is `maxWidth: '75%'` with no width of its own, so the bubble
   * takes the intrinsic width of its widest child. `flex: 1` in React Native is
   * `flexGrow:1, flexShrink:1, flexBasis:0` — and a flexBasis of 0 means the
   * quote contributes NOTHING to that intrinsic width. The bubble then sizes
   * itself to the reply text alone and the quote is crushed into the remainder.
   *
   * Jest runs no layout, so this pins the flex properties that decide it rather
   * than a measured width.
   */
  it('lets the quote contribute its own width to the bubble', () => {
    const s = flat(show().getByTestId('reply-quote-body'));
    // Asserting `flexBasis !== 0` alone would NOT catch this: the shorthand
    // flattens to `{ flex: 1 }` and leaves flexBasis undefined, so the bug
    // would sail past. The shorthand itself is what has to be absent.
    expect(s.flex).toBeUndefined();
    expect(s.flexBasis).toBe('auto');
  });

  it('still lets the quote grow into a wide bubble', () => {
    expect(flat(show().getByTestId('reply-quote-body')).flexGrow).toBe(1);
  });

  it('still lets the quote shrink rather than overflow a bubble at its 75% cap', () => {
    // The anchor for the two above: flexBasis:'auto' with no shrink would push
    // the bubble past maxWidth and clip on the other side instead.
    expect(flat(show().getByTestId('reply-quote-body')).flexShrink).toBe(1);
  });

  it('does not cap the quote to some fixed width of its own', () => {
    const s = flat(show().getByTestId('reply-quote-body'));
    expect(s.width).toBeUndefined();
    expect(s.maxWidth).toBeUndefined();
  });

  it('leaves the snippet free to use the width it just won', () => {
    // Two lines is the cap; anything narrower is the quote being re-squeezed
    // after the bubble already made room for it.
    const snippet = show({ replyTo: quote({ snippet: 'x'.repeat(100) }) }).getByTestId('reply-quote-snippet');
    expect(snippet.props.numberOfLines).toBe(2);
    expect(flat(snippet).width).toBeUndefined();
  });
});

describe('the two variants', () => {
  it('offers a cancel in the composer', () => {
    const cancelled: boolean[] = [];
    const r = show({ variant: 'composer', onCancel: () => cancelled.push(true) });
    fireEvent.press(r.getByTestId('reply-quote-cancel'));
    expect(cancelled).toEqual([true]);
  });

  it('has no cancel inside a bubble — a sent quote cannot be withdrawn', () => {
    expect(show({ variant: 'bubble' }).queryByTestId('reply-quote-cancel')).toBeNull();
  });

  it('jumps to the original when the bubble quote is tapped', () => {
    const jumped: string[] = [];
    const r = show({ variant: 'bubble', onPress: (id: string) => jumped.push(id) });
    fireEvent.press(r.getByTestId('reply-quote'));
    expect(jumped).toEqual(['m0']);
  });

  it('does not jump from the composer preview — there is nothing sent to jump to', () => {
    const jumped: string[] = [];
    const r = show({ variant: 'composer', onPress: (id: string) => jumped.push(id), onCancel: () => {} });
    fireEvent.press(r.getByTestId('reply-quote'));
    expect(jumped).toEqual([]);
  });
});
