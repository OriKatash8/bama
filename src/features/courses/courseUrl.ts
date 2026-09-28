/**
 * The link a course's "Visit course" button opens, cleaned for saving.
 * '' means no link (the button is hidden). A bare address gets https://, or
 * Linking.openURL could not open it. Anything that is not an http(s) address
 * with a dotted host is refused (null).
 *
 * A pattern, not `new URL()`: React Native's URL class doesn't implement
 * `hostname`/`protocol` on every version.
 */
const WEB_URL = /^https?:\/\/[^\s/?#.:@]+(\.[^\s/?#.:@]+)+(:\d+)?([/?#]\S*)?$/i;

export function normalizeCourseUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  return WEB_URL.test(withScheme) ? withScheme : null;
}
