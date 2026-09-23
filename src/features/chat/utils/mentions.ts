/**
 * @mentions: detection in the composer, insertion, and splitting a stored
 * message for rendering.
 *
 * The storage contract this implements, and why it is shaped this way:
 *
 *   text      "@דנה כהן תוכל לבדוק?"   — exactly what was typed, human readable
 *   mentions  ['u-dana']               — flat userIds
 *
 * **No character offsets are stored anywhere.** Highlighting is recovered by
 * scanning the text at render time, which buys two things. Every consumer that
 * reads `text` verbatim — the push body and the chat-list preview — is already
 * correct with no changes, where an opaque `@[u:UID]` token would leak raw ids
 * into both. And if message editing is ever added, an edit that keeps the
 * `@Name` substring keeps its highlight while an edit that removes it simply
 * loses the highlight; nothing can be left pointing at the wrong characters.
 *
 * `mentions` is the notification manifest and `text` is the display. The
 * renderer trusts `text`; the server trusts `mentions`. When editing arrives,
 * the edit path must RECOMPUTE `mentions` from the new text and must never be
 * allowed to grow it — otherwise editing an old message becomes a way to ping
 * someone retroactively, which would bypass the rule that a mention overrides
 * mute.
 */

/** A member the message actually mentioned, paired with the name to look for. */
export type MentionTarget = { userId: string; name: string };

/** One piece of a rendered message. `userId`/`everyone` mark it as a mention. */
export type MentionRun = { text: string; userId?: string; everyone?: boolean };

export type MentionQuery =
  | { active: false }
  | { active: true; query: string; start: number };

/** An `@` only opens the picker at a word boundary, so an email address does not. */
function isBoundary(ch: string | undefined): boolean {
  return ch === undefined || /\s/.test(ch);
}

/**
 * Is the caret currently inside an `@token`, and if so what has been typed?
 *
 * `start` is the index of the `@` itself, which `insertMention` needs in order
 * to replace the token rather than append to it.
 *
 * The query deliberately stops at whitespace even though display names contain
 * spaces: the list filters on a substring of the whole name, so typing `@דנה`
 * already finds "דנה כהן" and picking it inserts the full name. Letting the
 * query run past a space would make "is the user still choosing?" ambiguous
 * after every word.
 */
export function detectMentionQuery(text: string, caret: number): MentionQuery {
  const upTo = text.slice(0, caret);
  const at = upTo.lastIndexOf('@');
  if (at === -1) return { active: false };
  if (!isBoundary(at === 0 ? undefined : upTo[at - 1])) return { active: false };
  const query = upTo.slice(at + 1);
  if (/\s/.test(query)) return { active: false };
  return { active: true, query, start: at };
}

/**
 * Replace the `@token` between `start` and `caret` with the chosen name.
 *
 * Returns the caret as a LOGICAL character index, which is what a TextInput's
 * `selection` takes — so the same value is correct in Hebrew and in English and
 * the visual caret lands on the right side of the token by itself.
 */
export function insertMention(
  text: string,
  start: number,
  caret: number,
  name: string,
): { text: string; caret: number } {
  const after = text.slice(caret);
  // A space so the next word is not glued to the name — unless one is there.
  const gap = /^\s/.test(after) ? '' : ' ';
  const token = `@${name}${gap}`;
  // The caret lands PAST the separator either way, so the next keystroke starts
  // a new word. When the space was already in the text we step over it rather
  // than leaving the caret wedged between the name and it.
  return {
    text: `${text.slice(0, start)}${token}${after}`,
    caret: start + token.length + (gap === '' ? 1 : 0),
  };
}

/**
 * Split a stored message into plain and mention runs.
 *
 * Matching is by `indexOf`, never a RegExp: a display name is user-controlled,
 * and `A. (B) +C*` would either throw when compiled or match the wrong thing.
 *
 * Longest name first, because one member's name can be a prefix of another's —
 * matching "Dana" first inside "@Dana Cohen" would mark the wrong person and
 * leave " Cohen" dangling as plain text.
 *
 * A target with no usable name is skipped: the member renamed, or left the
 * chat, or their name has not loaded yet. The notification already fired
 * correctly, so only the highlight is lost — never the meaning.
 */
export function splitMentionRuns(
  text: string,
  targets: readonly MentionTarget[],
  everyoneTokens: readonly string[] = [],
): MentionRun[] {
  type Needle = { token: string; userId?: string; everyone?: boolean };
  const needles: Needle[] = [
    ...targets.filter((t) => t.name).map((t) => ({ token: `@${t.name}`, userId: t.userId })),
    ...everyoneTokens.map((token) => ({ token, everyone: true })),
  ].sort((a, b) => b.token.length - a.token.length);

  if (needles.length === 0) return [{ text }];

  const runs: MentionRun[] = [];
  let plain = '';
  let i = 0;
  while (i < text.length) {
    const hit = text[i] === '@'
      ? needles.find((n) => text.startsWith(n.token, i))
      : undefined;
    if (hit) {
      if (plain) { runs.push({ text: plain }); plain = ''; }
      runs.push(hit.userId ? { text: hit.token, userId: hit.userId } : { text: hit.token, everyone: true });
      i += hit.token.length;
    } else {
      plain += text[i];
      i += 1;
    }
  }
  if (plain) runs.push({ text: plain });
  return runs.length > 0 ? runs : [{ text }];
}
