import {
  arrivalsSince, isNearNewest, NEAR_NEWEST_PX, SHOW_JUMP_PX, toListOffset, toScrollTop, webRowId,
} from '../chatListScroll';

const m = (id: string, senderId: string) => ({ id, senderId });
const none = () => false;

describe('offset maths (offset = distance from the newest message)', () => {
  it('near-newest is within 80px, inclusive', () => {
    expect(isNearNewest(0)).toBe(true);
    expect(isNearNewest(NEAR_NEWEST_PX)).toBe(true);
    expect(isNearNewest(NEAR_NEWEST_PX + 1)).toBe(false);
  });
  it('the jump button waits until well past "near"', () => {
    expect(SHOW_JUMP_PX).toBeGreaterThan(NEAR_NEWEST_PX);
  });
  it('a column-reverse scrollTop of 0 is offset 0, and scrolling up (negative) is a positive offset', () => {
    expect(toListOffset(0)).toBe(0);
    expect(toListOffset(-300)).toBe(300);
    expect(toListOffset(-0)).toBe(0);
    expect(Object.is(toListOffset(0), -0)).toBe(false);
  });
  it('scrollTo goes back the other way, so the two are inverses', () => {
    for (const y of [0, 1, 80, 5000]) expect(toListOffset(toScrollTop(y))).toBe(y);
    expect(toScrollTop(300)).toBe(-300);
  });
  it('row ids are namespaced', () => expect(webRowId('abc')).toBe('chat-row-abc'));
});

describe('arrivalsSince', () => {
  const base = [m('1', 'a'), m('2', 'b')];

  it('the first snapshot is a baseline, not an arrival', () => {
    expect(arrivalsSince(base, null, 'me', none)).toEqual({ reset: true, fromOthers: 0, mine: false, newestId: '2' });
  });
  it('counts only what landed after the last newest message', () => {
    const a = arrivalsSince([...base, m('3', 'b'), m('4', 'c')], '2', 'me', none);
    expect(a).toMatchObject({ reset: false, fromOthers: 2, mine: false, newestId: '4' });
  });
  it('flags my own message, and does not count it as "new" for the pill', () => {
    const a = arrivalsSince([...base, m('3', 'me')], '2', 'me', none);
    expect(a).toMatchObject({ fromOthers: 0, mine: true });
  });
  it('a mix: mine is flagged, theirs still counted', () => {
    const a = arrivalsSince([...base, m('3', 'b'), m('4', 'me')], '2', 'me', none);
    expect(a).toMatchObject({ fromOthers: 1, mine: true });
  });
  it('nothing new is nothing', () => {
    expect(arrivalsSince(base, '2', 'me', none)).toMatchObject({ reset: false, fromOthers: 0, mine: false });
  });
  it('blocked senders never count (the reader cannot see them)', () => {
    const hidden = (x: { senderId: string }) => x.senderId === 'blocked';
    const a = arrivalsSince([...base, m('3', 'blocked')], '2', 'me', hidden);
    expect(a).toMatchObject({ fromOthers: 0, newestId: '2' });
  });
  it('a baseline that has disappeared (channel switch, deleted) resets instead of miscounting', () => {
    expect(arrivalsSince([m('9', 'b')], '2', 'me', none)).toMatchObject({ reset: true, fromOthers: 0 });
  });
  it('an empty chat has no newest message', () => {
    expect(arrivalsSince([], null, 'me', none)).toEqual({ reset: true, fromOthers: 0, mine: false, newestId: null });
  });
});
