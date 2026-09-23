/**
 * Recognising the server's system messages from their stored text.
 *
 * System messages are written in HEBREW by the Cloud Functions and carry no
 * type field — the variant is derived from the text at render time, so the
 * reader's language can be applied to the headline while user-authored detail
 * is left verbatim (see parseSystemMessage in ChatRoomScreen).
 *
 * The predicates live here because more than one surface needs them: the chat
 * room renders a pill, and the chat list has to replace its preview line. A
 * literal `'הצוות נסגר'` copied into a second file is exactly the kind of thing
 * that drifts when the server wording changes.
 */

/**
 * "The crew is set" — written by activateProject when the last seat is filled
 * (`functions/src/lifecycle/candidates.ts:258`), as either `🎬 הצוות נסגר` or
 * `🎬 הצוות נסגר: <names>`.
 *
 * Both forms are matched, and the emoji alone is enough, so a wording change
 * that keeps the marker still lands.
 */
export function isCrewReady(text: string | null | undefined): boolean {
  if (!text) return false;
  return text.startsWith('🎬') || text.includes('הצוות נסגר');
}
