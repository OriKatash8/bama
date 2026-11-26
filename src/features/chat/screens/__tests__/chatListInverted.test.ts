import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * THE MESSAGE LIST OPENS AT THE NEWEST MESSAGE BY LAYOUT, NOT BY SCROLLING.
 *
 * It used to open by scrollToEnd on every layout / content-size change, which landed short
 * whenever a photo or listing card loaded late, and a new message could jump the view or not
 * show. Now the list is newest-first and inverted (native) / column-reverse (web), so offset 0
 * is the newest message and nothing has to be scrolled there. Real scrolling can't be rendered
 * in jest; this pins the wiring. (The web mechanics were verified in a real browser.)
 */
const SRC = readFileSync(join(__dirname, '..', 'ChatRoomScreen.tsx'), 'utf8');
const LIST = SRC.slice(SRC.indexOf('<FlatList\n          ref={flatListRef}'), SRC.indexOf('{(showScrollDown || newBelow > 0) && ('));

describe('data and platform props', () => {
  it('is newest-first: the list items are reversed from the oldest-first build', () => {
    expect(SRC).toMatch(/return result\.reverse\(\);/);
  });
  it('gets `inverted` natively / column-reverse on web from the one shared helper', () => {
    expect(LIST).toMatch(/\{\.\.\.chatListPlatformProps\(listItems\.length\)\}/);
    expect(LIST).not.toMatch(/\binverted\b=/);
  });
});

describe('nothing scrolls to the end any more', () => {
  it('no scrollToEnd on the message list (the channel strip\'s RTL one is a different ScrollView)', () => {
    expect(SRC.match(/flatListRef\.current\?\.scrollToEnd/g) ?? []).toHaveLength(0);
  });
  it('there is no "bottom" pin: a pin is only ever a jump to a message', () => {
    expect(SRC).not.toMatch(/kind: 'bottom'/);
  });
  it('content growth does not re-scroll to the bottom', () => {
    const grow = LIST.slice(LIST.indexOf('onContentSizeChange'));
    expect(grow).not.toMatch(/scrollToEnd/);
  });
});

describe('near the newest message', () => {
  it('reads the offset as the distance from the newest message, on both platforms', () => {
    expect(LIST).toMatch(/const y = e\.nativeEvent\.contentOffset\.y;/);
    expect(LIST).toMatch(/isNearNewest\(y\)/);
    expect(LIST).toMatch(/y > SHOW_JUMP_PX/);
  });
  it('does not use the old top-down distance (contentSize - offset - layout)', () => {
    expect(LIST).not.toMatch(/contentSize\.height - \(contentOffset\.y/);
  });
});

describe('new messages', () => {
  it('every snapshot is noted, in both the chat and the community-channel listener', () => {
    expect(SRC.match(/noteArrivals\(msgs\);\n\s+setMessages\(msgs\);/g) ?? []).toHaveLength(2);
  });
  it('my own message scrolls to the newest; others\' only count while I am scrolled up', () => {
    const fn = SRC.slice(SRC.indexOf('const noteArrivals = useCallback'), SRC.indexOf('const noteArrivals = useCallback') + 1400);
    expect(fn).toMatch(/if \(a\.mine\) \{\s+flatListRef\.current\?\.scrollToOffset\(\{ offset: 0, animated: true \}\);/);
    expect(fn).toMatch(/a\.fromOthers > 0 && !isAtBottomRef\.current/);
  });
  it('is stable (listed in both listener effects\' deps), so a re-render never re-subscribes a snapshot listener', () => {
    expect(SRC).toMatch(/\}, \[currentUserId\]\);\n\n  const hiddenBlockedSenders|\}, \[currentUserId\]\);/);
    expect(SRC.match(/currentUserId, noteArrivals\]\);/g) ?? []).toHaveLength(2);
  });
  it('blocked senders are not counted', () => {
    expect(SRC).toMatch(/isHiddenByBlock\(m as Message, blockedNow\)/);
  });
  it('native: a message inserted at the newest end does not shove what the reader is looking at', () => {
    expect(LIST).toMatch(/shiftPendingRef\.current && Platform\.OS !== 'web'/);
    expect(LIST).toMatch(/offset: offsetRef\.current \+ grew/);
  });
});

describe('the pill', () => {
  const pill = SRC.slice(SRC.indexOf('{(showScrollDown || newBelow > 0) && ('), SRC.indexOf('{/* + Action bar'));
  it('shows for a far scroll OR waiting new messages, and says how many', () => {
    expect(pill).toMatch(/newBelow === 1 \? t\('chats\.unread_banner_one'\) : t\('chats\.unread_banner', \{ count: String\(newBelow\) \}\)/);
  });
  it('tapping scrolls to the newest (offset 0) and clears the count', () => {
    expect(pill).toMatch(/scrollToOffset\(\{ offset: 0, animated: true \}\)/);
    expect(pill).toMatch(/setNewBelow\(0\)/);
  });
  it('the count clears by itself on reaching the newest message', () => {
    expect(LIST).toMatch(/if \(near\) setNewBelow\(\(n\) => \(n === 0 \? n : 0\)\);/);
  });
});

describe('jumping to a message', () => {
  const apply = SRC.slice(SRC.indexOf('const applyPin = useCallback'), SRC.indexOf('}, [listItems]);') + 20);
  it('web: scrollIntoView on the row\'s DOM id (scrollToIndex drifts on a long web list)', () => {
    expect(apply).toMatch(/Platform\.OS === 'web'/);
    expect(apply).toMatch(/document\.getElementById\(webRowId\(target\.id\)\)\?\.scrollIntoView\(\{ block: 'center' \}\)/);
  });
  it('native: scrollToIndex, centred (0.5 means the same in an inverted list)', () => {
    expect(apply).toMatch(/scrollToIndex\(\{ index, animated: false, viewPosition: 0\.5 \}\)/);
  });
  it('native keeps its onScrollToIndexFailed fallback', () => {
    expect(LIST).toMatch(/onScrollToIndexFailed=/);
  });
  it('web rows carry the DOM id the jump looks for', () => {
    expect(SRC).toMatch(/<View nativeID=\{webRowId\(id\)\}>/);
    expect(LIST).toMatch(/renderItem=\{\(\{ item \}\) => rowWithId\(item\.id, \(\(\) => \{/);
  });
  it('web: any input releases a jump\'s pin (onScrollBeginDrag does not fire for wheel, keys or the scrollbar)', () => {
    expect(SRC).toMatch(/\['wheel', 'touchstart', 'keydown', 'pointerdown'\] as const/);
  });
});

describe('opening', () => {
  it('switching chat or channel returns a reused list to the newest and forgets the old arrivals', () => {
    const e = SRC.slice(SRC.indexOf('// Entering a chat — or switching channel'), SRC.indexOf('// ...unless a mention is waiting here'));
    expect(e).toMatch(/lastNewestIdRef\.current = null;/);
    expect(e).toMatch(/setNewBelow\(0\);/);
    expect(e).toMatch(/scrollToOffset\(\{ offset: 0, animated: false \}\)/);
    expect(e).not.toMatch(/scrollToEnd/);
  });
});
