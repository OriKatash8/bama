import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * THE CHAT HEADER READS LIKE WHATSAPP IN EACH LANGUAGE.
 * Back, then the chat's picture right beside it, then the name — mirrored in
 * Hebrew, so there the back button sits at the right edge next to the picture.
 * A COMMUNITY is mirrored in English too (asked for): back and its picture on
 * the right, search on the left — the same as in Hebrew.
 */
const SRC = readFileSync(join(__dirname, '..', 'ChatRoomScreen.tsx'), 'utf8');
const header = SRC.slice(SRC.indexOf('{/* Header */}'), SRC.indexOf('{/* Channel tab bar (community only) */}'));

it('mirrors in Hebrew, and in a community in either language', () => {
  expect(SRC).toMatch(/const headerFlip = rtl \|\| chatType === 'community';/);
  expect(header).toMatch(/style=\{\[styles\.header, \{ flexDirection: headerFlip \? 'row-reverse' : 'row'/);
});

it('back comes first, then the picture, then the name', () => {
  const back = header.indexOf('style={styles.headerBack}');
  const photo = header.indexOf('chatStyles.headerPhotoBtn');
  const name = header.indexOf('<View style={[styles.headerCenter');
  expect(back).toBeGreaterThan(-1);
  expect(photo).toBeGreaterThan(back);
  expect(name).toBeGreaterThan(photo);
});

it('the back arrow points outward in each language, as an icon rather than a text glyph', () => {
  expect(header).toMatch(/headerFlip \? <ChevronRight[^>]*\/> : <ChevronLeft[^>]*\/>/);
  expect(header).not.toMatch(/>‹</);
});

it('the name sits next to the picture', () => {
  expect(header).toMatch(/styles\.headerCenter, \{ alignItems: headerFlip \? 'flex-end' : 'flex-start' \}/);
  expect(header).not.toMatch(/styles\.headerName, \{ textAlign: rtl \?/);
});

describe('search, at the far end of the header', () => {
  it('is the last thing in the row, so it sits left when mirrored and right otherwise', () => {
    const search = header.indexOf('testID="chat-search"');
    expect(search).toBeGreaterThan(header.indexOf('<View style={[styles.headerCenter'));
    // Nothing but closing tags between the button and the end of the row.
    const after = header.slice(header.indexOf('</TouchableOpacity>', search) + '</TouchableOpacity>'.length);
    expect(after.trim()).toMatch(/^<\/View>\s*$/);
  });

  it('opens a sheet over the chat, not another page', () => {
    const btn = header.slice(header.indexOf('testID="chat-search"'), header.indexOf('testID="chat-search"') + 300);
    expect(btn).toMatch(/onPress=\{\(\) => setSearchOpen\(true\)\}/);
    expect(SRC).not.toMatch(/chat\/community-search\?chatId=\$\{chatId\}&kind=/);
    expect(SRC).toMatch(/<ChatSearchSheet[\s\S]*?kind=\{chatType === 'community' \? 'community' : 'chat'\}/);
  });

  it('a picked result closes the sheet and jumps in the room', () => {
    expect(SRC).toMatch(/onPick=\{\(j\) => \{ setSearchOpen\(false\); searchJump\(j\); \}\}/);
  });

  it('is a search icon with a spoken label', () => {
    const btn = header.slice(header.indexOf('testID="chat-search"') - 300, header.indexOf('testID="chat-search"') + 500);
    expect(btn).toMatch(/<Search /);
    expect(btn).toMatch(/accessibilityLabel=\{t\('community_search\.open'\)\}/);
  });
});
