import { detectMentionQuery, insertMention, splitMentionRuns } from '../mentions';

/**
 * The pure half of @mentions: what the composer detects, what it inserts, and
 * how a stored message is split for rendering.
 *
 * Nothing here knows about Firestore or React — the screen is 2000 lines and
 * these are the parts that have to be exactly right.
 */

describe('detectMentionQuery', () => {
  it('opens on an @ at the start of the text', () => {
    expect(detectMentionQuery('@dan', 4)).toEqual({ active: true, query: 'dan', start: 0 });
  });

  it('opens on an @ after a space', () => {
    expect(detectMentionQuery('hello @dan', 10)).toEqual({ active: true, query: 'dan', start: 6 });
  });

  it('opens on a bare @ with nothing typed yet', () => {
    // The whole roster should show before a single letter is typed.
    expect(detectMentionQuery('hello @', 7)).toEqual({ active: true, query: '', start: 6 });
  });

  it('does NOT open on an @ inside a word — an email address is not a mention', () => {
    expect(detectMentionQuery('ori@example.com', 15)).toEqual({ active: false });
    expect(detectMentionQuery('hello@dan', 9)).toEqual({ active: false });
  });

  it('closes once a space is typed after the token', () => {
    // '@dan there' — the caret has moved past the token, so the popup is done.
    expect(detectMentionQuery('hello @dan there', 16)).toEqual({ active: false });
  });

  it('reads the caret, not the end of the string', () => {
    // Caret sitting just after '@dan' while more text follows it.
    expect(detectMentionQuery('hello @dan there', 10)).toEqual({ active: true, query: 'dan', start: 6 });
  });

  it('uses the @ nearest the caret', () => {
    expect(detectMentionQuery('@ori and @dan', 13)).toEqual({ active: true, query: 'dan', start: 9 });
  });

  it('opens after a newline, which is a word boundary too', () => {
    expect(detectMentionQuery('line one\n@dan', 13)).toEqual({ active: true, query: 'dan', start: 9 });
  });

  it('works on Hebrew', () => {
    expect(detectMentionQuery('שלום @דנה', 9)).toEqual({ active: true, query: 'דנה', start: 5 });
  });

  it('is inactive with no @ at all', () => {
    expect(detectMentionQuery('just a message', 14)).toEqual({ active: false });
  });
});

describe('insertMention', () => {
  it('replaces the typed token and returns the caret after it', () => {
    const r = insertMention('hello @da', 6, 9, 'Dana Cohen');
    expect(r.text).toBe('hello @Dana Cohen ');
    // Caret sits after the trailing space, ready for the next word.
    expect(r.caret).toBe(r.text.length);
  });

  it('keeps whatever followed the token', () => {
    const r = insertMention('hello @da there', 6, 9, 'Dana Cohen');
    expect(r.text).toBe('hello @Dana Cohen there');
    expect(r.caret).toBe('hello @Dana Cohen '.length);
  });

  it('does not double the space when one already follows', () => {
    const r = insertMention('hello @da there', 6, 9, 'Dana');
    expect(r.text).toBe('hello @Dana there');
    expect(r.text).not.toContain('  ');
  });

  it('inserts at the start of the text', () => {
    const r = insertMention('@d', 0, 2, 'Dana');
    expect(r.text).toBe('@Dana ');
    expect(r.caret).toBe(6);
  });

  it('handles a Hebrew name', () => {
    const r = insertMention('שלום @ד', 5, 7, 'דנה כהן');
    expect(r.text).toBe('שלום @דנה כהן ');
    expect(r.caret).toBe(r.text.length);
  });
});

describe('splitMentionRuns', () => {
  const dana = { userId: 'u-dana', name: 'Dana Cohen' };
  const ori = { userId: 'u-ori', name: 'Ori' };

  it('returns a single plain run when there is nothing to mark', () => {
    expect(splitMentionRuns('just a message', [])).toEqual([{ text: 'just a message' }]);
  });

  it('marks the mention and leaves the rest plain', () => {
    expect(splitMentionRuns('hey @Dana Cohen look', [dana])).toEqual([
      { text: 'hey ' },
      { text: '@Dana Cohen', userId: 'u-dana' },
      { text: ' look' },
    ]);
  });

  it('marks a mention that is the whole message', () => {
    expect(splitMentionRuns('@Ori', [ori])).toEqual([{ text: '@Ori', userId: 'u-ori' }]);
  });

  it('marks several mentions in one message', () => {
    expect(splitMentionRuns('@Ori and @Dana Cohen', [ori, dana])).toEqual([
      { text: '@Ori', userId: 'u-ori' },
      { text: ' and ' },
      { text: '@Dana Cohen', userId: 'u-dana' },
    ]);
  });

  it('prefers the LONGER name when one is a prefix of another', () => {
    // 'Dana' would otherwise swallow the first four letters of 'Dana Cohen'
    // and leave ' Cohen' dangling as plain text, mis-marking who was mentioned.
    const danaShort = { userId: 'u-short', name: 'Dana' };
    expect(splitMentionRuns('hey @Dana Cohen', [danaShort, dana])).toEqual([
      { text: 'hey ' },
      { text: '@Dana Cohen', userId: 'u-dana' },
    ]);
  });

  it('treats a name containing regex metacharacters literally', () => {
    // A display name is user-controlled. Building a RegExp from it would either
    // throw on '(' or match the wrong thing on '.' and '+'.
    const odd = { userId: 'u-odd', name: 'A. (B) +C*' };
    expect(splitMentionRuns('hi @A. (B) +C* bye', [odd])).toEqual([
      { text: 'hi ' },
      { text: '@A. (B) +C*', userId: 'u-odd' },
      { text: ' bye' },
    ]);
  });

  it('does NOT mark a name that was typed by hand without being picked', () => {
    // No mentions entry means no notification was sent, so highlighting it
    // would promise something that never happened.
    expect(splitMentionRuns('hey @Dana Cohen look', [])).toEqual([{ text: 'hey @Dana Cohen look' }]);
  });

  it('leaves the text alone when a mentioned user cannot be named', () => {
    // The member renamed, or left, or their name has not loaded yet. The
    // notification already fired correctly; only the highlight is lost.
    expect(splitMentionRuns('hey @Dana Cohen look', [{ userId: 'u-dana', name: '' }]))
      .toEqual([{ text: 'hey @Dana Cohen look' }]);
  });

  it('marks every occurrence when a name appears twice', () => {
    expect(splitMentionRuns('@Ori @Ori', [ori])).toEqual([
      { text: '@Ori', userId: 'u-ori' },
      { text: ' ' },
      { text: '@Ori', userId: 'u-ori' },
    ]);
  });

  it('marks @everyone in either language', () => {
    expect(splitMentionRuns('@כולם יש עדכון', [], ['@everyone', '@כולם'])).toEqual([
      { text: '@כולם', everyone: true },
      { text: ' יש עדכון' },
    ]);
    expect(splitMentionRuns('@everyone heads up', [], ['@everyone', '@כולם'])).toEqual([
      { text: '@everyone', everyone: true },
      { text: ' heads up' },
    ]);
  });

  it('does not mark @everyone unless the message actually carried the flag', () => {
    // The caller passes no tokens when mentionsEveryone is absent, so a member
    // typing "@everyone" by hand gets plain text and no push.
    expect(splitMentionRuns('@everyone heads up', [])).toEqual([{ text: '@everyone heads up' }]);
  });
});
