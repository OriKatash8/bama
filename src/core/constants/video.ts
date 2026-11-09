/**
 * On-device video compression (react-native-compressor) and the limits around it.
 * The server (functions/src/video/policy.ts) only remuxes (no re-encode) files that are
 * h264/AAC, within 1080p and at or under SKIP_MAX_KBPS (5000), so every preset's bitrate
 * must stay below 5 Mbps — otherwise compressVideo re-encodes and the send gets slow.
 */

/** Longest side after compression, px. The library's own default is 640, so always pass this. */
export const VIDEO_COMPRESS_MAX_SIZE = 1920;

/** Target video bitrate, bits/s. 3 minutes at this rate is about 90 MB (storage rule cap: 300 MB). */
export const VIDEO_COMPRESS_BITRATE = 4_000_000;

/** What the on-device compressor aims for. */
export type VideoPreset = {
  /** Longest side after compression, px. */
  maxSize: number;
  /** Target video bitrate, bits/s. */
  bitrate: number;
};

/** Portfolio (and the default): what the app has always used. */
export const PORTFOLIO_VIDEO: VideoPreset = {
  maxSize: VIDEO_COMPRESS_MAX_SIZE,
  bitrate: VIDEO_COMPRESS_BITRATE,
};

/** Chat: seen on a phone screen and sent often, so smaller and faster to upload. */
export const CHAT_VIDEO: VideoPreset = { maxSize: 1280, bitrate: 2_000_000 };

/**
 * A source already this small is uploaded as-is: manual mode would otherwise raise a
 * low-bitrate clip up to VIDEO_COMPRESS_BITRATE. Only applies when the codec is known to be
 * H.264 (see isAlreadySmall); the picker does not report one, so on a phone this never fires.
 */
export const VIDEO_SKIP_COMPRESS_MAX_BPS = 4_000_000;

/**
 * How long the app waits on videoJobs before saying "still processing". Must stay above
 * compressVideo's timeoutSeconds (540 in functions/src/video/index.ts). After it fires the
 * app keeps listening; it is a notice, not a failure.
 */
export const VIDEO_PROCESSING_TIMEOUT_MS = 600_000;

/** Longest portfolio video, seconds. */
export const MAX_PORTFOLIO_VIDEO_SECONDS = 180;

/** Longest chat video, seconds. Separate from the portfolio limit so each can change on its own. */
export const MAX_CHAT_VIDEO_SECONDS = 180;

/** Slack for container/clock rounding, so a clip shown as "3:00" is not refused at 180.2 s. */
export const VIDEO_DURATION_TOLERANCE_SECONDS = 0.5;
