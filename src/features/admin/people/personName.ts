/**
 * A person's label in the admin panel: their full name, or a localized "Unknown user". NEVER the uid.
 * The id lives in the details sheet (UserDetailsSheet), where it can be read and copied.
 *
 * `unknown` is the translated fallback. Names that are really ids (some old records stored the uid as
 * the display name) count as unknown too: a label that is the uid is exactly what this exists to remove.
 */
export function personName(
  name: string | null | undefined,
  unknown: string,
  uid?: string | null,
): string {
  const n = (name ?? '').trim();
  if (!n) return unknown;
  if (uid && n === uid) return unknown;
  return n;
}
