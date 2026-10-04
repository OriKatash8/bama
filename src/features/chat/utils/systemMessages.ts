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

/** "Project completed" — chatClose.ts posts `🏁 הפרויקט הושלם`. */
export function isCompletionDone(text: string | null | undefined): boolean {
  return !!text && text.includes('הפרויקט הושלם');
}

/** "Project completion request" — completion.ts posts `🏁 בקשת סיום פרויקט[: <name> מבקש/ת …]`. */
export function isCompletionRequest(text: string | null | undefined): boolean {
  return !!text && text.includes('בקשת סיום פרויקט');
}

/** The requesting professional's name from a completion request, or '' when it carries none. */
export function completionRequestName(text: string): string {
  return /בקשת סיום פרויקט:?\s*(.*?)\s*מבקש\/ת לסמן את הפרויקט כהושלם/.exec(text)?.[1] ?? '';
}

type Translate = (key: string, params?: Record<string, string>) => string;

/**
 * The chat list's preview line for a stored Hebrew system message, in the
 * reader's language: the same headline the chat room's pill shows. Null for
 * anything that is not a recognised system message (user text stays verbatim).
 */
export function localizedSystemPreview(text: string | null | undefined, t: Translate): string | null {
  if (!text) return null;
  if (isCrewReady(text)) return t('chats.crew_ready');
  // closingNotice.ts: "🏁 הפרויקט הסתיים|בוטל — פרטי הקשר של הצוות" (+ the roster below).
  if (text.includes('פרטי הקשר של הצוות')) {
    return text.includes('הפרויקט בוטל') ? t('chats.cancelled_title') : t('chats.closed_title');
  }
  if (isCompletionDone(text)) return t('chats.system_completion_done');
  if (isCompletionRequest(text)) return t('chats.system_completion_title');
  if (text.startsWith('📅') || text.includes('פגישה חדשה')) return t('chats.system_meeting_title');
  if (text.startsWith('📋') || text.includes('משימה חדשה')) return t('chats.system_mission_title');
  if (text.startsWith('💰') || text.includes('בקשת שינוי מחיר')) return t('chats.system_price_title');
  const declined = text.includes('החליט/ה לא להמשיך בפרויקט');
  if (declined || text.includes('עזב את הפרויקט')) {
    const phrase = declined ? 'החליט/ה לא להמשיך בפרויקט' : 'עזב את הפרויקט';
    return t(declined ? 'chats.system_declined' : 'chats.system_left', { name: text.split(phrase)[0]?.trim() ?? '' });
  }
  return null;
}
