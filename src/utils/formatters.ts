import type { Timestamp } from '@core/types/common';

export function formatCurrency(amount: number, currency = 'ILS'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

export function formatDate(timestamp: Pick<Timestamp, 'seconds'>): string {
  return new Date(timestamp.seconds * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * An ISO day string ('2026-09-14') shown as DD/MM/YYYY ('14/09/2026').
 *
 * Reformats the string itself. `new Date('2026-09-14')` is UTC midnight, which is
 * the previous day in any timezone west of UTC. The stored value stays ISO:
 * the calendar, the date-order checks and the server's parseDeadline all read it.
 * Anything that is not exactly an ISO day (e.g. 'flexible') is returned unchanged.
 */
export function formatIsoDay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export function formatRelativeTime(timestamp: Pick<Timestamp, 'seconds'>): string {
  const diff = Math.floor((Date.now() - timestamp.seconds * 1000) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/**
 * A placeholder that ends in "…" (or any neutral punctuation) renders the dots
 * on the wrong side in Hebrew: the app lays out LTR, so a trailing neutral
 * character after Hebrew text falls to the LTR end — before the words. An
 * invisible right-to-left mark after it anchors the dots to the Hebrew side.
 */
export function rtlSafe(text: string, rtl: boolean): string {
  return rtl ? `${text}‏` : text;
}

/**
 * U+2068 FIRST STRONG ISOLATE … U+2069 POP DIRECTIONAL ISOLATE.
 *
 * FSI takes its direction from the first strong character of its CONTENT, so a
 * Hebrew name isolates right-to-left and a Latin one left-to-right with no
 * script detection at the call site. `writingDirection` on a nested Text does
 * not do this: nested Text is one paragraph in RN, and react-native-web maps
 * writingDirection to CSS `direction`, which does not isolate — that needs
 * unicode-bidi:isolate, which RN Web does not emit. Both CoreText and every
 * browser implement UAX#9, so these are the one part that behaves identically
 * on iPhone and on web.
 *
 * Like rtlSafe above, this belongs at the EDGE. Applied at render only — never
 * to stored text, which flows verbatim into push bodies and chat-list previews
 * where an invisible control character would be carried along.
 */
export const FSI = '⁨';
export const PDI = '⁩';

/** A name or other foreign-script run, isolated from the line around it. */
export function isolate(text: string): string {
  return `${FSI}${text}${PDI}`;
}
