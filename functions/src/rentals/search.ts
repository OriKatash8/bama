import { tokenize, wordForms } from './keywords';

/** Longest prefix stored per word, and the most keys one item may carry. */
export const SEARCH_PREFIX_MAX = 15;
export const SEARCH_KEYS_MAX = 250;

/**
 * Every 2..15-letter prefix of every word of a name (with the Hebrew-prefix-free
 * forms too), so `array-contains` on one typed word finds "aputure" from "apu"
 * and "פנסים" from "לפנסים". The app normalises the typed word the same way:
 * lower-case, geresh/quotes removed, cut to SEARCH_PREFIX_MAX
 * (src/features/rentals/search.ts).
 */
export function searchKeys(text: string): string[] {
  const keys = new Set<string>();
  for (const word of tokenize(text)) {
    for (const form of wordForms(word)) {
      for (let n = 2; n <= Math.min(form.length, SEARCH_PREFIX_MAX); n++) keys.add(form.slice(0, n));
    }
    if (keys.size >= SEARCH_KEYS_MAX) break;
  }
  return [...keys].slice(0, SEARCH_KEYS_MAX);
}
