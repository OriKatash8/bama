import { splitMentionRuns } from '../mentions';

/**
 * The rendering contract the bubble relies on, stated where it can be tested
 * without mounting the 2000-line chat screen.
 *
 * MessageBody wraps each mention run in U+2068 FSI … U+2069 PDI. FSI takes its
 * direction from the first strong character of the CONTENT, so a Latin name
 * isolates LTR inside a Hebrew line and a Hebrew name isolates RTL inside an
 * English one — with no script detection in the component. `writingDirection`
 * on a nested Text cannot do this: nested Text is one paragraph in RN, and
 * react-native-web maps it to CSS `direction`, which does not isolate.
 */

const FSI = '⁨';
const PDI = '⁩';
/** What MessageBody renders for a run. */
const rendered = (runs: ReturnType<typeof splitMentionRuns>) =>
  runs.map((r) => (r.userId || r.everyone ? `${FSI}${r.text}${PDI}` : r.text)).join('');

describe('a Latin name inside a Hebrew line', () => {
  const dana = { userId: 'u-dana', name: 'Dana Cohen' };
  const hebrew = 'שלום @Dana Cohen תוכל לבדוק?';

  it('splits the Latin name out as its own run', () => {
    expect(splitMentionRuns(hebrew, [dana])).toEqual([
      { text: 'שלום ' },
      { text: '@Dana Cohen', userId: 'u-dana' },
      { text: ' תוכל לבדוק?' },
    ]);
  });

  it('isolates it, so it cannot drag the surrounding Hebrew', () => {
    const out = rendered(splitMentionRuns(hebrew, [dana]));
    expect(out).toContain(`${FSI}@Dana Cohen${PDI}`);
    // The Hebrew either side is untouched and still adjacent to the isolate.
    expect(out).toBe(`שלום ${FSI}@Dana Cohen${PDI} תוכל לבדוק?`);
  });

  it('isolates a Hebrew name in an English line the same way', () => {
    const ori = { userId: 'u-ori', name: 'אורי' };
    expect(rendered(splitMentionRuns('can you check @אורי please', [ori])))
      .toBe(`can you check ${FSI}@אורי${PDI} please`);
  });

  it('puts NOTHING invisible into a message with no mentions', () => {
    // `text` is read verbatim by the push body and the chat-list preview, so a
    // stray control character would ship straight into both.
    const out = rendered(splitMentionRuns(hebrew, []));
    expect(out).toBe(hebrew);
    expect(out).not.toContain(FSI);
    expect(out).not.toContain(PDI);
  });

  it('leaves the stored text itself free of isolates', () => {
    // The isolation is applied at RENDER only; splitMentionRuns never rewrites
    // the run text it was given.
    const runs = splitMentionRuns(hebrew, [dana]);
    for (const run of runs) {
      expect(run.text).not.toContain(FSI);
      expect(run.text).not.toContain(PDI);
    }
  });
});

describe('@everyone in a Hebrew line', () => {
  it('isolates the token', () => {
    const out = rendered(splitMentionRuns('@כולם יש עדכון', [], ['@everyone', '@כולם']));
    expect(out).toBe(`${FSI}@כולם${PDI} יש עדכון`);
  });

  it('isolates the English token inside Hebrew, which is the mixed case', () => {
    const out = rendered(splitMentionRuns('@everyone יש עדכון', [], ['@everyone', '@כולם']));
    expect(out).toBe(`${FSI}@everyone${PDI} יש עדכון`);
  });
});
