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
  for (const k of ['crop', 'crop_free', 'crop_reset', 'crop_done', 'crop_rotate', 'crop_failed', 'trim', 'trim_done', 'trim_working', 'trim_failed_title', 'trim_failed_body', 'trim_failed_close', 'media_send_in_progress', 'media_preparing', 'leave_sending_title', 'leave_sending_video', 'leave_sending_image', 'leave_sending_leave', 'leave_sending_stay']) {
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

describe('crop in the preview', () => {
  it('offers Crop for photos only, and opens the editor inside the same Modal', () => {
    expect(SRC).toMatch(/pendingMedia\?\.type === 'image' && \(\s*<TouchableOpacity\s+testID="media-crop-button"/);
    expect(SRC).toMatch(/\{cropping && pendingMedia\?\.type === 'image' && \(\s*<CropEditor/);
    expect(SRC.indexOf('<CropEditor')).toBeLessThan(SRC.indexOf('{/* Fullscreen media viewer'));
    expect(SRC.indexOf('<CropEditor')).toBeGreaterThan(SRC.indexOf('visible={pendingMedia !== null}'));
  });
  it('keeps the caption: the edit swaps uri/asset, never the caption state', () => {
    const done = SRC.slice(SRC.indexOf('onDone={(r) =>'), SRC.indexOf('onDone={(r) =>') + 400);
    expect(done).toMatch(/setPendingMedia\(\(p\) => p && \{ \.\.\.p, uri: r\.uri, asset: \{ \.\.\.p\.asset, uri: r\.uri/);
    expect(done).not.toMatch(/setPendingCaption/);
  });
  it('Android back closes the editor first, not the whole preview', () => {
    expect(SRC).toMatch(/onRequestClose=\{\(\) => \{\s*if \(cropping\) \{ setCropping\(false\); return; \}/);
  });
});

describe('trim in the preview', () => {
  it('offers Trim for videos only, behind the flag', () => {
    expect(SRC).toMatch(/pendingMedia\?\.type === 'video' && canTrimVideo\(\) && \(\s*<TouchableOpacity\s+testID="media-trim-button"/);
  });
  it('hides the preview Modal while the native trimmer is up', () => {
    expect(SRC).toMatch(/visible=\{pendingMedia !== null && !trimming\}/);
  });
  it('replaces the too-long dialog with the trimmer, capped at the chat limit', () => {
    const fn = SRC.slice(SRC.indexOf('async function handleAttachMedia()'));
    const body = fn.slice(0, fn.indexOf('\n  }\n'));
    expect(body).toMatch(/exceedsDuration\(await getVideoSeconds\(asset\), MAX_CHAT_VIDEO_SECONDS\)/);
    expect(body).toMatch(/if \(canTrimVideo\(\)\) \{\s*const trimmed = await trimAsset\(asset\);\s*if \(!trimmed\) return;/);
    expect(body).toMatch(/else if \(!\(await ensureVideoWithinLimit\(asset, MAX_CHAT_VIDEO_SECONDS, t\)\)\) return;/);
    expect(SRC).toMatch(/maxDurationMs: MAX_CHAT_VIDEO_SECONDS \* 1000/);
  });
  it('the trimmed file is still compressed: it only swaps the asset uri/duration', () => {
    expect(SRC).toMatch(/\{ \.\.\.asset, uri: out\.uri, duration: out\.durationMs, fileSize: undefined \}/);
    expect(SRC).not.toMatch(/startVideoCompression/);
  });
  it('cleans the temporary copies only when nothing previews or uploads one', () => {
    expect(SRC).toMatch(/trimmedRef\.current && !pendingMedia && !mediaSend\.pending && !trimming/);
  });
});
