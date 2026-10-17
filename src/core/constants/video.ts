/**
 * On-device video compression (react-native-compressor) and the limits around it.
 * The server (functions/src/video/policy.ts) skips its own re-encode for files that
 * are within 1080p and SKIP_MAX_KBPS, so keep VIDEO_COMPRESS_BITRATE below 5 Mbps.
 */

/** Longest side after compression, px. The library's own default is 640, so always pass this. */
export const VIDEO_COMPRESS_MAX_SIZE = 1920;

/** Target video bitrate, bits/s. 3 minutes at this rate is about 90 MB (storage rule cap: 300 MB). */
export const VIDEO_COMPRESS_BITRATE = 4_000_000;

/**
 * A source already this small is uploaded as-is: manual mode would otherwise raise a
 * low-bitrate clip up to VIDEO_COMPRESS_BITRATE. Same shape the server accepts untouched.
 */
export const VIDEO_SKIP_COMPRESS_MAX_BPS = 4_000_000;

/**
 * How long the app waits on videoJobs before saying "still processing". Must stay above
 * compressVideo's timeoutSeconds (540 in functions/src/video/index.ts). After it fires the
 * app keeps listening; it is a notice, not a failure.
 */
export const VIDEO_PROCESSING_TIMEOUT_MS = 600_000;
