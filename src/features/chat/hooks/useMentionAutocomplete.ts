import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { detectMentionQuery, insertMention } from '../utils/mentions';

/** The `@everyone` row, and the literal token it inserts. */
export const EVERYONE_ID = '__everyone__';
/** Both spellings are recognised when rendering, so a message sent in one
 *  language still highlights for a reader in the other. */
export const EVERYONE_TOKENS = ['@everyone', '@כולם'] as const;

/** How many people one message may mention. Mirrors the Firestore rule. */
export const MAX_MENTIONS = 10;

export type MentionRow = { id: string; name: string; everyone?: boolean };

export type MentionAutocompleteState =
  | { open: false }
  /** Members are known but their names have not resolved yet. */
  | { open: true; loading: true; rows: [] }
  | { open: true; loading: false; rows: MentionRow[]; atLimit: boolean };

/**
 * The @-picker's whole decision, kept out of the 2000-line chat screen.
 *
 * THREE STATES, NOT TWO. `chatMembers` is empty until the chat document's
 * snapshot lands and `memberNames` is empty until an async effect resolves one
 * getDoc per member, so "nothing to show" and "not loaded yet" are different
 * things. Rendering an empty list for the second one produces a picker that
 * looks broken — identically on iOS and web, because it is the shared data path
 * and not the RTL layer.
 *
 * Detection runs in an EFFECT keyed on [text, selection] rather than inside
 * either handler: on web `onSelectionChange` carries `nativeEvent.text` and on
 * iOS it does not, so an effect that settles after both sidesteps the ordering
 * difference entirely.
 */
export function useMentionAutocomplete(args: {
  text: string;
  /** Caret position. A logical index, so it is direction-agnostic. */
  caret: number;
  /** Ids from the chat document. Empty until the snapshot lands. */
  memberIds: readonly string[];
  /** uid → display name. Fills asynchronously, all at once. */
  memberNames: Record<string, string>;
  currentUserId: string;
  /** Only a community offers @everyone, and only to its owner. */
  canMentionEveryone: boolean;
  /** DMs never offer the picker — there is nobody to disambiguate. */
  enabled: boolean;
  onChange: (text: string, caret: number) => void;
}): MentionAutocompleteState & {
  /** Pick a row: rewrites the text and asks for the caret to move. */
  pick: (row: MentionRow) => void;
  /** userIds to store on the message, derived from the FINAL text. */
  resolveMentions: (finalText: string) => { mentions: string[]; everyone: boolean };
  /** Close without picking. */
  dismiss: () => void;
  /** Wire to the composer's `onBlur` — NOT `dismiss`. See the note on the race. */
  handleBlur: () => void;
  /** The picker calls these around a row press so a blur cannot cancel it. */
  notePressStart: () => void;
  notePressEnd: () => void;
} {
  const { text, caret, memberIds, memberNames, currentUserId, canMentionEveryone, enabled, onChange } = args;

  /**
   * Everyone picked while composing this message, uid → the name inserted.
   *
   * `mentions` is derived from the FINAL text at send time rather than
   * accumulated here, because backspace deletes one character and not the whole
   * token. Mangling "@Dana Cohen" into "@Dana Coh" must drop the highlight AND
   * the push together; without this the message would still notify someone
   * whose name is no longer in it.
   */
  const [picked, setPicked] = useState<Map<string, string>>(() => new Map());
  /**
   * Where the user dismissed a picker, as the index of the `@` they dismissed.
   *
   * A boolean would need an effect to reset it, and setState inside an effect
   * is a cascading render. Storing the position makes reopening fall out of the
   * comparison: type a new `@` anywhere else and `query.start` differs, so the
   * picker is open again with nothing to reset.
   */
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);

  const query = useMemo(
    () => (enabled ? detectMentionQuery(text, caret) : ({ active: false } as const)),
    [enabled, text, caret],
  );

  const namesReady = memberIds.length > 0 && memberIds.every((id) => memberNames[id]);
  const atLimit = picked.size >= MAX_MENTIONS;
  const dismissed = query.active && dismissedAt === query.start;

  const rows = useMemo<MentionRow[]>(() => {
    if (!query.active || !namesReady) return [];
    const needle = query.query.toLowerCase();
    const people = memberIds
      .filter((id) => id !== currentUserId)
      .map((id) => ({ id, name: memberNames[id] ?? id }))
      .filter((r) => !needle || r.name.toLowerCase().includes(needle));
    const everyone: MentionRow[] =
      canMentionEveryone && EVERYONE_TOKENS.some((t) => t.slice(1).toLowerCase().startsWith(needle))
        ? [{ id: EVERYONE_ID, name: 'everyone', everyone: true }]
        : [];
    return [...everyone, ...people];
  }, [query, namesReady, memberIds, memberNames, currentUserId, canMentionEveryone]);

  const pick = useCallback(
    (row: MentionRow) => {
      // TEMPORARY [mention] tracing — remove once the web insert is confirmed.
      if (__DEV__) console.log('[mention] pick fired', { id: row.id, name: row.name, queryActive: query.active });
      if (!query.active) return;
      // @everyone is a flag on the document, so it does not consume a slot in
      // the bounded `mentions` array.
      if (!row.everyone && picked.size >= MAX_MENTIONS && !picked.has(row.id)) return;
      setPicked((prev) => new Map(prev).set(row.everyone ? EVERYONE_ID : row.id, row.name));
      const name = row.everyone ? EVERYONE_TOKENS[1].slice(1) : row.name;
      const next = insertMention(text, query.start, caret, name);
      if (__DEV__) console.log('[mention] insert', { from: text, to: next.text, caret: next.caret });
      onChange(next.text, next.caret);
    },
    [query, text, caret, onChange, picked],
  );

  const resolveMentions = useCallback((finalText: string) => {
    const mentions: string[] = [];
    let everyone = false;
    for (const [id, name] of picked) {
      if (id === EVERYONE_ID) {
        everyone = EVERYONE_TOKENS.some((t) => finalText.includes(t));
        continue;
      }
      if (finalText.includes(`@${name}`)) mentions.push(id);
    }
    setPicked(new Map());
    return { mentions: mentions.slice(0, MAX_MENTIONS), everyone };
  }, [picked]);

  const dismiss = useCallback(() => {
    setDismissedAt(query.active ? query.start : null);
  }, [query]);

  /**
   * Closing on blur, without cancelling a press that is already underway.
   *
   * On RN Web the input blurs on POINTERDOWN while TouchableOpacity fires
   * onPress on POINTERUP, so a blur handler that dismisses synchronously
   * unmounts the row between the two and the press never lands. The popup
   * appears, filters correctly, and picking does nothing — which is exactly
   * how this shipped.
   *
   * Deferred AND re-checked, because the two orderings both happen: if the
   * blur arrives first the flag is still false when it is scheduled, so the
   * check at fire time is what saves it; if the press starts first the flag is
   * already set. A press that outlives the delay is covered for the same
   * reason.
   */
  const pressingRef = useRef(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notePressStart = useCallback(() => {
    if (__DEV__) console.log('[mention] pressIn — a press is underway');
    pressingRef.current = true;
  }, []);
  const notePressEnd = useCallback(() => { pressingRef.current = false; }, []);

  const handleBlur = useCallback(() => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    if (__DEV__) console.log('[mention] blur — dismiss scheduled');
    blurTimer.current = setTimeout(() => {
      if (__DEV__) console.log('[mention] blur timer fired', { pressing: pressingRef.current });
      if (!pressingRef.current) dismiss();
    }, 150);
  }, [dismiss]);

  useEffect(() => () => { if (blurTimer.current) clearTimeout(blurTimer.current); }, []);

  const state: MentionAutocompleteState =
    !query.active || dismissed || memberIds.length === 0
      ? { open: false }
      : !namesReady
        ? { open: true, loading: true, rows: [] }
        : { open: true, loading: false, rows, atLimit };

  return { ...state, pick, resolveMentions, dismiss, handleBlur, notePressStart, notePressEnd };
}
