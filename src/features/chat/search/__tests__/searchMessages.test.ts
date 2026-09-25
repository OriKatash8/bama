import { searchMessages, normalizeForSearch, type SearchableMessage } from '../searchMessages';

/**
 * Community search runs on the device — Firestore has no text search. The rule:
 * a message matches when its text CONTAINS the query, ignoring case, extra
 * spaces and Hebrew vowel marks; results come newest first, each with a
 * snippet around the match and the match's range inside that snippet.
 */

const msg = (id: string, text: string, seconds: number, channelId = 'general'): SearchableMessage => ({
  id, text, channelId, channelName: channelId, senderId: 'u1', timestamp: { seconds, nanoseconds: 0 },
});

describe('normalizeForSearch', () => {
  it('lowercases, collapses spaces and strips niqqud', () => {
    expect(normalizeForSearch('  Hello   World ')).toBe('hello world');
    expect(normalizeForSearch('שָׁלוֹם')).toBe('שלום');
  });
});

describe('searchMessages', () => {
  const index = [
    msg('a', 'Looking for a camera for Friday', 10),
    msg('b', 'מחפש צלם לחתונה בחיפה', 30, 'market'),
    msg('c', 'Anyone has a CAMERA?', 20),
    msg('d', 'nothing here', 40),
  ];

  it('finds a word regardless of case, newest first', () => {
    expect(searchMessages(index, 'camera').map((r) => r.message.id)).toEqual(['c', 'a']);
  });

  it('matches a phrase as typed', () => {
    expect(searchMessages(index, 'for a camera').map((r) => r.message.id)).toEqual(['a']);
  });

  it('matches Hebrew, and a query with niqqud still finds plain text', () => {
    expect(searchMessages(index, 'צָלָם').map((r) => r.message.id)).toEqual(['b']);
  });

  it('needs at least two characters', () => {
    expect(searchMessages(index, 'c')).toEqual([]);
    expect(searchMessages(index, '   ')).toEqual([]);
  });

  it('a message whose timestamp is still pending sorts as newest', () => {
    const pending = { ...msg('p', 'camera now', 0), timestamp: null };
    expect(searchMessages([...index, pending], 'camera')[0].message.id).toBe('p');
  });

  it('returns the whole text as the snippet when it is short, with the match range', () => {
    const [r] = searchMessages([msg('x', 'Need a Camera today', 1)], 'camera');
    expect(r.snippet).toBe('Need a Camera today');
    expect(r.snippet.slice(r.matchStart, r.matchEnd)).toBe('Camera');
  });

  it('cuts a long text around the match and marks the cuts with …', () => {
    const long = `${'a'.repeat(100)} the camera ${'b'.repeat(100)}`;
    const [r] = searchMessages([msg('x', long, 1)], 'camera');
    expect(r.snippet.startsWith('…')).toBe(true);
    expect(r.snippet.endsWith('…')).toBe(true);
    expect(r.snippet.length).toBeLessThan(long.length);
    expect(r.snippet.slice(r.matchStart, r.matchEnd)).toBe('camera');
  });

  it('keeps the match range right in text with niqqud', () => {
    const [r] = searchMessages([msg('x', 'אני צָלָם מקצועי', 1)], 'צלם');
    expect(r.snippet.slice(r.matchStart, r.matchEnd)).toBe('צָלָם');
  });
});
