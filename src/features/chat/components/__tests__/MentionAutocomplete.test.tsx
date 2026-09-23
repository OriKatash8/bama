import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { TextInput } from 'react-native';
import { MentionAutocomplete } from '../MentionAutocomplete';
import { useMentionAutocomplete, EVERYONE_ID, MAX_MENTIONS } from '../../hooks/useMentionAutocomplete';

/**
 * The picker, driven through its real hook by a real TextInput.
 *
 * A harness rather than the 2000-line chat screen, but the wiring under test is
 * the wiring the screen uses: type into a field, the hook detects the @, the
 * component renders, tapping a row rewrites the text and moves the caret.
 */

const LABELS = {
  loading: 'Loading members…',
  empty: 'No one to mention',
  atLimit: 'Up to 10 people per message',
  everyone: 'everyone — notifies the whole channel',
};

function Harness({
  memberIds = ['u-dana', 'u-ori'],
  memberNames = { 'u-dana': 'Dana Cohen', 'u-ori': 'Ori' } as Record<string, string>,
  canMentionEveryone = false,
  enabled = true,
  rtl = false,
  onSent,
}: {
  memberIds?: string[];
  memberNames?: Record<string, string>;
  canMentionEveryone?: boolean;
  enabled?: boolean;
  rtl?: boolean;
  onSent?: (r: { text: string; mentions: string[]; everyone: boolean }) => void;
}) {
  const [text, setText] = React.useState('');
  const [caret, setCaret] = React.useState(0);
  const [selection, setSelection] = React.useState<{ start: number; end: number } | undefined>();

  const mention = useMentionAutocomplete({
    text, caret, memberIds, memberNames,
    currentUserId: 'u-me',
    canMentionEveryone,
    enabled,
    onChange: (next, nextCaret) => {
      setText(next); setCaret(nextCaret); setSelection({ start: nextCaret, end: nextCaret });
    },
  });

  return (
    <>
      <MentionAutocomplete
        state={mention} rtl={rtl} accent="#6D28D9" tint="#F3EEFE"
        onPick={mention.pick} labels={LABELS}
        onPressStart={mention.notePressStart} onPressEnd={mention.notePressEnd}
      />
      <TextInput
        testID="composer"
        value={text}
        selection={selection}
        onChangeText={(next) => { setText(next); setCaret(next.length); }}
        onSelectionChange={(e) => {
          setCaret(e.nativeEvent.selection.start);
          if (selection) setSelection(undefined);
        }}
        onBlur={mention.handleBlur}
      />
      <TextInput
        testID="send"
        value=""
        onChangeText={() => { onSent?.({ text, ...mention.resolveMentions(text) }); }}
      />
    </>
  );
}

/** Type into the composer the way a person does. */
const type = (r: ReturnType<typeof render>, s: string) =>
  act(() => { fireEvent.changeText(r.getByTestId('composer'), s); });

describe('typing @ opens the picker', () => {
  it('is not mounted before an @ is typed', () => {
    const r = render(<Harness />);
    expect(r.queryByTestId('mention-autocomplete')).toBeNull();
  });

  it('mounts and lists the members on @', () => {
    const r = render(<Harness />);
    type(r, 'hello @');
    expect(r.getByTestId('mention-autocomplete')).toBeTruthy();
    expect(r.getByTestId('mention-row-u-dana')).toBeTruthy();
    expect(r.getByTestId('mention-row-u-ori')).toBeTruthy();
  });

  it('narrows as the query is typed', () => {
    const r = render(<Harness />);
    type(r, 'hello @dan');
    expect(r.getByTestId('mention-row-u-dana')).toBeTruthy();
    expect(r.queryByTestId('mention-row-u-ori')).toBeNull();
  });

  it('never offers you yourself', () => {
    const r = render(<Harness memberIds={['u-me', 'u-dana']} memberNames={{ 'u-me': 'Me', 'u-dana': 'Dana Cohen' }} />);
    type(r, '@');
    expect(r.queryByTestId('mention-row-u-me')).toBeNull();
    expect(r.getByTestId('mention-row-u-dana')).toBeTruthy();
  });

  it('closes once the token is finished', () => {
    const r = render(<Harness />);
    type(r, 'hello @dan there');
    expect(r.queryByTestId('mention-autocomplete')).toBeNull();
  });

  it('does not open on an email address', () => {
    const r = render(<Harness />);
    type(r, 'ori@example.com');
    expect(r.queryByTestId('mention-autocomplete')).toBeNull();
  });

  it('is suppressed entirely in a DM', () => {
    const r = render(<Harness enabled={false} />);
    type(r, 'hello @');
    expect(r.queryByTestId('mention-autocomplete')).toBeNull();
  });
});

describe('the three member-list states', () => {
  it('does not render at all before the chat document has loaded', () => {
    // members [] — not "nobody to mention", "nothing known yet".
    const r = render(<Harness memberIds={[]} memberNames={{}} />);
    type(r, '@');
    expect(r.queryByTestId('mention-autocomplete')).toBeNull();
  });

  it('shows a LOADING row while the names are still resolving', () => {
    // This is the state that looks like a broken picker if it renders as empty
    // — and it fails identically on iOS and web, being the shared data path.
    const r = render(<Harness memberIds={['u-dana']} memberNames={{}} />);
    type(r, '@');
    expect(r.getByTestId('mention-loading')).toBeTruthy();
    expect(r.queryByTestId('mention-empty')).toBeNull();
  });

  it('shows EMPTY only once names are known and nothing matches', () => {
    const r = render(<Harness />);
    type(r, '@zzzz');
    expect(r.getByTestId('mention-empty')).toBeTruthy();
    expect(r.queryByTestId('mention-loading')).toBeNull();
  });
});

describe('picking a member', () => {
  it('inserts the token and puts the caret after it', () => {
    const r = render(<Harness />);
    type(r, 'hello @dan');
    act(() => { fireEvent.press(r.getByTestId('mention-row-u-dana')); });

    const input = r.getByTestId('composer');
    expect(input.props.value).toBe('hello @Dana Cohen ');
    expect(input.props.selection).toEqual({ start: 18, end: 18 });
  });

  it('closes the picker after picking', () => {
    const r = render(<Harness />);
    type(r, 'hello @dan');
    act(() => { fireEvent.press(r.getByTestId('mention-row-u-dana')); });
    expect(r.queryByTestId('mention-autocomplete')).toBeNull();
  });

  it('releases the caret on the next selection change — the one-shot rule', () => {
    // react-native-web applies `selection` in a layout effect keyed on the
    // object, so leaving it set would force the caret back on every keystroke.
    const r = render(<Harness />);
    type(r, '@dan');
    act(() => { fireEvent.press(r.getByTestId('mention-row-u-dana')); });
    expect(r.getByTestId('composer').props.selection).toBeDefined();

    act(() => {
      fireEvent(r.getByTestId('composer'), 'selectionChange', {
        nativeEvent: { selection: { start: 12, end: 12 } },
      });
    });
    expect(r.getByTestId('composer').props.selection).toBeUndefined();
  });
});

describe('the web mousedown race', () => {
  /**
   * On RN Web the input blurs on POINTERDOWN, while TouchableOpacity fires
   * onPress on POINTERUP. A blur handler that closes the picker synchronously
   * therefore unmounts the row between the two, and the press never lands —
   * the popup appears, filters correctly, and picking does nothing at all.
   *
   * The other tests in this file press the row directly, which skips the blur
   * entirely and passes against exactly that bug. This one fires the real
   * ordering.
   */
  it('still inserts when the input blurs first', () => {
    const r = render(<Harness />);
    type(r, 'hello @dan');
    act(() => { fireEvent(r.getByTestId('composer'), 'blur'); });
    act(() => { fireEvent.press(r.getByTestId('mention-row-u-dana')); });
    expect(r.getByTestId('composer').props.value).toBe('hello @Dana Cohen ');
  });

  it('the row is still mounted immediately after the blur', () => {
    const r = render(<Harness />);
    type(r, 'hello @dan');
    act(() => { fireEvent(r.getByTestId('composer'), 'blur'); });
    expect(r.queryByTestId('mention-row-u-dana')).not.toBeNull();
  });

  it('survives a press held longer than the dismiss delay', () => {
    // The deferral alone is not enough — the timer has to RE-CHECK whether a
    // press is underway. Without that, holding the mouse down past 150ms
    // dismisses the popup out from under the finger.
    jest.useFakeTimers();
    try {
      const r = render(<Harness />);
      type(r, 'hello @dan');
      act(() => { fireEvent(r.getByTestId('composer'), 'blur'); });
      act(() => { fireEvent(r.getByTestId('mention-row-u-dana'), 'pressIn'); });
      act(() => { jest.advanceTimersByTime(500); });

      expect(r.queryByTestId('mention-row-u-dana')).not.toBeNull();
      act(() => { fireEvent.press(r.getByTestId('mention-row-u-dana')); });
      expect(r.getByTestId('composer').props.value).toBe('hello @Dana Cohen ');
    } finally {
      jest.useRealTimers();
    }
  });

  it('but a blur with no press does close it', () => {
    // The deferral must not turn into "never closes": tapping away with
    // "@dan" still in the box has to dismiss the popup.
    jest.useFakeTimers();
    try {
      const r = render(<Harness />);
      type(r, 'hello @dan');
      act(() => { fireEvent(r.getByTestId('composer'), 'blur'); });
      act(() => { jest.advanceTimersByTime(500); });
      expect(r.queryByTestId('mention-autocomplete')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('what gets stored', () => {
  const send = (r: ReturnType<typeof render>) =>
    act(() => { fireEvent.changeText(r.getByTestId('send'), 'go'); });

  it('records the picked member', () => {
    let sent: { mentions: string[]; everyone: boolean } | undefined;
    const r = render(<Harness onSent={(x) => { sent = x; }} />);
    type(r, '@dan');
    act(() => { fireEvent.press(r.getByTestId('mention-row-u-dana')); });
    send(r);
    expect(sent!.mentions).toEqual(['u-dana']);
  });

  it('DROPS a mention whose token was edited away', () => {
    // Backspace deletes one character, not the token. Deriving from the final
    // text is what stops a half-deleted "@Dana Coh" still notifying her.
    let sent: { mentions: string[] } | undefined;
    const r = render(<Harness onSent={(x) => { sent = x; }} />);
    type(r, '@dan');
    act(() => { fireEvent.press(r.getByTestId('mention-row-u-dana')); });
    type(r, 'hello @Dana Coh');
    send(r);
    expect(sent!.mentions).toEqual([]);
  });

  it('records nothing for a name merely typed by hand', () => {
    let sent: { mentions: string[] } | undefined;
    const r = render(<Harness onSent={(x) => { sent = x; }} />);
    type(r, 'hey @Dana Cohen');
    send(r);
    expect(sent!.mentions).toEqual([]);
  });
});

describe('@everyone', () => {
  it('is offered only when the viewer may send it', () => {
    const plain = render(<Harness />);
    type(plain, '@');
    expect(plain.queryByTestId(`mention-row-${EVERYONE_ID}`)).toBeNull();

    const owner = render(<Harness canMentionEveryone />);
    type(owner, '@');
    expect(owner.getByTestId(`mention-row-${EVERYONE_ID}`)).toBeTruthy();
  });

  it('inserts the Hebrew token and sets the flag, not a userId', () => {
    let sent: { mentions: string[]; everyone: boolean } | undefined;
    const r = render(<Harness canMentionEveryone onSent={(x) => { sent = x; }} />);
    type(r, '@');
    act(() => { fireEvent.press(r.getByTestId(`mention-row-${EVERYONE_ID}`)); });
    expect(r.getByTestId('composer').props.value).toBe('@כולם ');
    act(() => { fireEvent.changeText(r.getByTestId('send'), 'go'); });
    expect(sent!.everyone).toBe(true);
    expect(sent!.mentions).toEqual([]);
  });
});

describe('the cap', () => {
  const many = Array.from({ length: 15 }, (_, i) => `u-${i}`);
  const names = Object.fromEntries(many.map((id, i) => [id, `Person${i}`]));

  /** Pick member i, returning the composer text afterwards. */
  function pickNth(r: ReturnType<typeof render>, base: string, i: number) {
    act(() => { fireEvent.changeText(r.getByTestId('composer'), `${base}@Person${i}`); });
    const row = r.queryByTestId(`mention-row-u-${i}`);
    if (row) act(() => { fireEvent.press(row); });
    return r.getByTestId('composer').props.value as string;
  }

  it('the PICKER itself refuses an 11th, not just the send path', () => {
    // resolveMentions also slices to the cap, so asserting only on what gets
    // sent passes even with no picker cap at all — mutation testing caught
    // exactly that. This pins the refusal where the user sees it.
    const r = render(<Harness memberIds={many} memberNames={names} />);
    let text = '';
    for (let i = 0; i < MAX_MENTIONS; i++) text = pickNth(r, text, i);

    const before = r.getByTestId('composer').props.value;
    const after = pickNth(r, before, MAX_MENTIONS);
    // The 11th pick changes nothing: the row is offered but does not insert.
    expect(after).toBe(`${before}@Person${MAX_MENTIONS}`);
    expect(after).not.toContain(`@Person${MAX_MENTIONS} `);
  });

  it('says so, rather than looking like there is nobody left', () => {
    const r = render(<Harness memberIds={many} memberNames={names} />);
    let text = '';
    for (let i = 0; i < MAX_MENTIONS; i++) text = pickNth(r, text, i);
    act(() => { fireEvent.changeText(r.getByTestId('composer'), `${text}@zzzz`); });
    expect(r.getByTestId('mention-empty')).toHaveTextContent(LABELS.atLimit);
  });

  it('never sends more than the rule allows', () => {
    let sent: { mentions: string[] } | undefined;
    const r = render(<Harness memberIds={many} memberNames={names} onSent={(x) => { sent = x; }} />);
    let text = '';
    for (let i = 0; i < 12; i++) text = pickNth(r, text, i);
    act(() => { fireEvent.changeText(r.getByTestId('send'), 'go'); });
    expect(sent!.mentions.length).toBeLessThanOrEqual(MAX_MENTIONS);
  });
});
