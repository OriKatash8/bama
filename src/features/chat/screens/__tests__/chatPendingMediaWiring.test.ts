import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** How ChatRoomScreen is wired to the pending media bubble (the pieces have their own tests). */
const SRC = readFileSync(join(__dirname, '..', 'ChatRoomScreen.tsx'), 'utf8');

it('keeps the composer free: it is no longer swapped for an upload status row', () => {
  expect(SRC).not.toMatch(/mediaActive/);
  expect(SRC).not.toMatch(/<VideoUploadStatus/);
});

it('both pickers refuse a second media while one is sending', () => {
  expect(SRC).toMatch(/async function handleAttachMedia\(\) \{\n\s+if \(!currentUserId \|\| !mediaSend\.canStartNew\(\)\) return;/);
  expect(SRC).toMatch(/async function handleAttachCamera\(\) \{\n\s+if \(!currentUserId \|\| !mediaSend\.canStartNew\(\)\) return;/);
});

it('guards leaving while a send is in flight, and cancels on Leave', () => {
  expect(SRC).toMatch(/useLeaveGuard\(\s*mediaSend\.inFlight,/);
  expect(SRC).toMatch(/mediaSend\.cancel,\n\s*\);/);
});

it('renders the bubble as the list footer, for its own chat and channel only', () => {
  expect(SRC).toMatch(/ListFooterComponent=\{pendingBubble\}/);
  expect(SRC).toMatch(/p\.chatId !== chatId/);
  expect(SRC).toMatch(/p\.channelId !== \(chatType === 'community' \? activeChannelId : ''\)/);
  expect(SRC).toMatch(/pendingHasLanded\(p, messages\)/);
});

it('has the strings in both languages', () => {
  const en = JSON.parse(readFileSync(join(__dirname, '../../../../core/i18n/translations/en.json'), 'utf8'));
  const he = JSON.parse(readFileSync(join(__dirname, '../../../../core/i18n/translations/he.json'), 'utf8'));
  for (const k of ['media_send_in_progress', 'media_preparing', 'leave_sending_title', 'leave_sending_video', 'leave_sending_image', 'leave_sending_leave', 'leave_sending_stay']) {
    expect(en.chats[k]).toBeTruthy();
    expect(he.chats[k]).toBeTruthy();
  }
});

it('checks photo-library access just before opening the media picker, and times the pick', () => {
  const body = SRC.slice(SRC.indexOf('async function handleAttachMedia()'));
  const fn = body.slice(0, body.indexOf('\n  }\n'));
  expect(fn.indexOf('await ensurePhotoLibraryAccess()')).toBeGreaterThan(-1);
  expect(fn.indexOf('await ensurePhotoLibraryAccess()')).toBeLessThan(fn.indexOf('launchImageLibraryAsync'));
  expect(fn).toMatch(/timing\.mark\('preview shown'\)/);
});
