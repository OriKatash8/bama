import { buildReplyTo, SNIPPET_MAX } from '../replyTo';
import type { Message } from '../../types';

/**
 * What a reply STORES about the message it quotes.
 *
 * The quote is denormalized — the referenced message is never read back — so
 * this object is the whole of what a reader sees. Two consequences drive every
 * test here:
 *
 *  - It must be BOUNDED. The rules cap the snippet at 100 characters; a client
 *    that sent more would get a permission error on send, which reads as "the
 *    app is broken" rather than "that message was long".
 *  - It must be COMPLETE. A missing key is denied outright by the rules, so a
 *    caption-less photo has to produce `snippet: ''`, not an absent field.
 *
 * `buildReplyTo` is also the not-repliable guard: system notices and shared
 * listing cards return null, and the caller never offers the gesture on them.
 */

const msg = (over: Partial<Message> = {}): Message => ({
  id: 'm1',
  senderId: 'u-dana',
  text: 'the original',
  timestamp: null as unknown as Message['timestamp'],
  readBy: [],
  ...over,
});

describe('what is repliable', () => {
  it('quotes a plain text message', () => {
    expect(buildReplyTo(msg())).toEqual({
      messageId: 'm1', senderId: 'u-dana', kind: 'text', snippet: 'the original',
    });
  });

  it('refuses a system notice', () => {
    expect(buildReplyTo(msg({ system: true, text: '🎬 הצוות נסגר' }))).toBeNull();
  });

  it("refuses a message FROM 'system', which is the other way it is marked", () => {
    // renderItem treats `msg.system || msg.senderId === 'system'` as the pill,
    // so checking only the boolean would leave half the notices repliable.
    expect(buildReplyTo(msg({ senderId: 'system' }))).toBeNull();
  });

  it('refuses a shared listing card', () => {
    expect(buildReplyTo(msg({ type: 'listing', title: 'Tripod', price: 200 }))).toBeNull();
  });

  it('is not fooled by a message that merely mentions the word system', () => {
    // The anchor: without it, a guard matching on text would pass everything
    // above and quietly make ordinary messages unrepliable.
    expect(buildReplyTo(msg({ text: 'the system is down' }))).not.toBeNull();
  });
});

describe('which kind it records', () => {
  it('image', () => {
    expect(buildReplyTo(msg({ imageURL: 'https://x/i.jpg', text: '' }))?.kind).toBe('image');
  });

  it('video', () => {
    expect(buildReplyTo(msg({ videoUrl: 'https://x/v.mp4', text: '' }))?.kind).toBe('video');
  });

  it('audio', () => {
    expect(buildReplyTo(msg({ audioUrl: 'https://x/a.m4a', audioDuration: 12, text: '' }))?.kind).toBe('audio');
  });

  it('text when there is no media', () => {
    expect(buildReplyTo(msg())?.kind).toBe('text');
  });

  it('matches the order renderItem branches in: video wins over image', () => {
    // A message carrying both would render as a video, so the quote must say
    // video too — otherwise the label disagrees with the bubble above it.
    const both = msg({ videoUrl: 'https://x/v.mp4', imageURL: 'https://x/i.jpg' });
    expect(buildReplyTo(both)?.kind).toBe('video');
  });
});

describe('the snippet', () => {
  it('keeps a short message whole', () => {
    expect(buildReplyTo(msg({ text: 'hi' }))?.snippet).toBe('hi');
  });

  it('carries the CAPTION for a photo', () => {
    expect(buildReplyTo(msg({ imageURL: 'u', text: 'on set' }))?.snippet).toBe('on set');
  });

  it("is '' — present but empty — for a caption-less photo", () => {
    // Not undefined: the rules require all four keys, so an absent snippet is
    // a denied write, which surfaces as a send that silently fails.
    const r = buildReplyTo(msg({ imageURL: 'u', text: '' }));
    expect(r?.snippet).toBe('');
    expect(Object.keys(r!).sort()).toEqual(['kind', 'messageId', 'senderId', 'snippet']);
  });

  it("is '' for a voice note, which never has text", () => {
    expect(buildReplyTo(msg({ audioUrl: 'u', text: '' }))?.snippet).toBe('');
  });

  it('truncates at the cap the rules enforce', () => {
    const r = buildReplyTo(msg({ text: 'x'.repeat(500) }));
    expect(r!.snippet.length).toBeLessThanOrEqual(SNIPPET_MAX);
  });

  it('counts HEBREW characters the same way', () => {
    // Firestore rules size() counts characters, not UTF-8 bytes — confirmed
    // against the emulator — so a Hebrew snippet gets the same 100 as a Latin
    // one rather than being cut to a third of the length.
    const r = buildReplyTo(msg({ text: 'א'.repeat(500) }));
    expect(r!.snippet.length).toBeLessThanOrEqual(SNIPPET_MAX);
    expect(r!.snippet.length).toBeGreaterThan(SNIPPET_MAX / 2);
  });

  it('leaves a message of exactly the cap untouched', () => {
    // The anchor for truncation: without it, a build that always trimmed a
    // character would pass every test above.
    const exact = 'y'.repeat(SNIPPET_MAX);
    expect(buildReplyTo(msg({ text: exact }))?.snippet).toBe(exact);
  });

  it('collapses newlines, so a quote stays one block', () => {
    expect(buildReplyTo(msg({ text: 'line one\nline two' }))?.snippet).toBe('line one line two');
  });

  it('never stores an invisible bidi control character', () => {
    // FSI/PDI are applied at RENDER only. Anything stored here flows into the
    // push body and the chat-list preview, which read it verbatim.
    const r = buildReplyTo(msg({ text: 'דנה Dana כהן' }));
    expect(r!.snippet).not.toMatch(/[⁦-⁩‎‏]/);
  });
});

describe('who it says wrote the original', () => {
  it('records the original sender, not the replier', () => {
    expect(buildReplyTo(msg({ senderId: 'u-dana' }))?.senderId).toBe('u-dana');
  });

  it('records the message id, which is what the jump needs', () => {
    expect(buildReplyTo(msg({ id: 'm-42' }))?.messageId).toBe('m-42');
  });
});
