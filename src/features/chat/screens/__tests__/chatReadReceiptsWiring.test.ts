import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * How ChatRoomScreen is wired to read receipts. The pieces have their own tests
 * (readReceipts, readMarker, useReadReceipts, ReadReceiptIcon, MessageInfoSheet,
 * ContentActionSheet); this pins the GATING, which is the part that must never loosen:
 * project / marketplace chats, viewer is a MEMBER, my own messages only.
 */
const SRC = readFileSync(join(__dirname, '..', 'ChatRoomScreen.tsx'), 'utf8');

it('is on only for a project / marketplace chat the viewer is a MEMBER of', () => {
  expect(SRC).toMatch(
    /const receiptsOn = isReceiptChat\(chatType\) && !!currentUserId && chatMembers\.includes\(currentUserId\);/,
  );
});

it('the hook gets that flag as `enabled`, so an admin / non-member gets no listener or write', () => {
  expect(SRC).toMatch(/useReadReceipts\(\{\s+chatId,\s+enabled: receiptsOn,/);
});

it('the icon appears on MY messages only, and only when receipts are on', () => {
  expect(SRC).toMatch(/if \(!\(receiptsOn && isOwn\)\) \{\n\s+return <Text style=\{\[styles\.messageTime/);
  expect(SRC).toMatch(/<ReadReceiptIcon/);
});

it('all four timestamp sites go through timeLine (no site keeps a bare timestamp Text)', () => {
  expect(SRC.match(/\{timeLine\(msg, isOwn/g)).toHaveLength(4);
  expect(SRC.match(/<Text style=\{\[styles\.messageTime, \{ color: isOwn/g)).toBeNull();
});

it('hold on my own message opens the own-message sheet ONLY when receipts are on; else hold-to-reply', () => {
  expect(SRC).toMatch(
    /onLongPress=\{isOwn \? \(receiptsOn \? \(\) => setOwnActionMessage\(msg\) : undefined\) : \(\) => setActionMessage\(msg\)\}/,
  );
});

it('the own-message sheet offers Reply and Message info, and nothing to report or block', () => {
  const block = SRC.slice(SRC.indexOf('visible={!!ownActionMessage}'), SRC.indexOf('visible={headerMenuOpen}'));
  expect(block).toMatch(/onReply=\{ownActionMessage \? \(\) => startReply\(ownActionMessage\)/);
  expect(block).toMatch(/onInfo=\{ownActionMessage \? \(\) => setInfoMessageId\(ownActionMessage\.id\)/);
  expect(block).not.toMatch(/onReport|onBlock/);
});

it('the info sheet renders only while receipts are on, from the live message', () => {
  expect(SRC).toMatch(/if \(!receiptsOn \|\| !infoMsg\) return null;/);
});

it('community channels never touch it: no readState or receipts code in the community path', () => {
  expect(SRC).not.toMatch(/readState/);
  const channelListener = SRC.slice(SRC.indexOf("if (chatType !== 'community') return;"));
  expect(channelListener.slice(0, 4000)).not.toMatch(/receiptStatus|useReadReceipts|ReadReceiptIcon/);
});
