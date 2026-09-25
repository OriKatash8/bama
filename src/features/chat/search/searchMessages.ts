/**
 * On-device search over a community's messages. Firestore has no text search,
 * so the screen loads the messages once (useCommunitySearchIndex) and filters
 * them here on every keystroke. Pure, so it is tested without the screen.
 */

export type SearchableMessage = {
  id: string;
  channelId: string;
  channelName: string;
  senderId: string;
  text: string;
  /** Null while the server timestamp is still pending: sorts as newest. */
  timestamp: { seconds: number; nanoseconds: number } | null;
};

export type SearchResult = {
  message: SearchableMessage;
  /** The message text, or a window of it around the match with "…" where cut. */
  snippet: string;
  /** The match inside `snippet`, for bolding. */
  matchStart: number;
  matchEnd: number;
};

export const MIN_QUERY_LENGTH = 2;
/** Characters of context kept on each side of the match. */
const CONTEXT = 40;

/**
 * Hebrew points and cantillation — the COMBINING marks only. The punctuation in
 * the same Unicode block (maqaf ־, paseq ׀, sof pasuq ׃, nun hafukha ׆) is kept:
 * dropping the maqaf would glue two words together.
 */
const HEBREW_MARK = /[֑-ׇֽֿׁׂׅׄ]/;

/**
 * The text as it is compared, plus where each compared character came from in
 * the original — so a match found in the normalised text can be bolded in the
 * text the user actually sees.
 */
function normalizeWithMap(text: string): { norm: string; map: number[] } {
  let norm = '';
  const map: number[] = [];
  let pendingSpace = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (HEBREW_MARK.test(ch)) continue;
    if (/\s/.test(ch)) { pendingSpace = norm.length > 0; continue; }
    if (pendingSpace) { norm += ' '; map.push(i - 1); pendingSpace = false; }
    norm += ch.toLowerCase();
    map.push(i);
  }
  return { norm, map };
}

/** Lowercase, collapsed spaces, no Hebrew vowel marks. */
export function normalizeForSearch(text: string): string {
  return normalizeWithMap(text).norm;
}

const sortKey = (m: SearchableMessage) =>
  m.timestamp ? m.timestamp.seconds + m.timestamp.nanoseconds / 1e9 : Number.POSITIVE_INFINITY;

export function searchMessages(index: SearchableMessage[], query: string): SearchResult[] {
  const q = normalizeForSearch(query);
  if (q.length < MIN_QUERY_LENGTH) return [];

  const results: SearchResult[] = [];
  for (const message of index) {
    const { norm, map } = normalizeWithMap(message.text);
    const at = norm.indexOf(q);
    if (at < 0) continue;

    // Back to the original text: from the first matched character to just past
    // the last one (which carries any vowel marks that followed it).
    const start = map[at];
    let end = map[at + q.length - 1] + 1;
    while (end < message.text.length && HEBREW_MARK.test(message.text[end])) end++;

    const from = Math.max(0, start - CONTEXT);
    const to = Math.min(message.text.length, end + CONTEXT);
    const head = from > 0 ? '…' : '';
    const tail = to < message.text.length ? '…' : '';
    results.push({
      message,
      snippet: `${head}${message.text.slice(from, to)}${tail}`,
      matchStart: head.length + (start - from),
      matchEnd: head.length + (end - from),
    });
  }
  return results.sort((a, b) => sortKey(b.message) - sortKey(a.message));
}
