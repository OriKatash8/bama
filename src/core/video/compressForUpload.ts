import { Platform } from 'react-native';
import {
  PORTFOLIO_VIDEO,
  VIDEO_SKIP_COMPRESS_MAX_BPS,
  type VideoPreset,
} from '@core/constants/video';

/** The bits of an ImagePickerAsset that decide whether compressing is worthwhile. */
export type VideoSourceInfo = {
  width?: number | null;
  height?: number | null;
  /** milliseconds */
  duration?: number | null;
  /** bytes */
  fileSize?: number | null;
  /**
   * Source video codec, if known. ImagePicker assets and the compressor's metadata do not
   * report one, so in practice this is unset and every clip is compressed.
   */
  codec?: string | null;
};

export class CompressionCancelled extends Error {
  constructor() {
    super('Video compression cancelled');
    this.name = 'CompressionCancelled';
  }
}

/**
 * True when the clip is provably H.264, within 1080p and at or under the target bitrate,
 * so compressing could only make it bigger. Same codec rule as the server's skip: iPhones
 * record HEVC by default, and a small HEVC clip must still be turned into H.264 here
 * rather than re-encoded on the server. Unknown codec/size/duration => compress.
 */
export function isAlreadySmall(info: VideoSourceInfo, preset: VideoPreset = PORTFOLIO_VIDEO): boolean {
  const { width, height, duration, fileSize, codec } = info;
  if (!/^(h\.?264|avc1?)$/i.test(codec ?? '')) return false;
  if (!width || !height || !duration || !fileSize) return false;
  const fits =
    Math.max(width, height) <= preset.maxSize && Math.min(width, height) <= 1080;
  const bps = (fileSize * 8) / (duration / 1000);
  return fits && bps <= Math.min(VIDEO_SKIP_COMPRESS_MAX_BPS, preset.bitrate);
}

export type VideoCompression = {
  /**
   * Resolves to the URI to upload: the compressed file, or the original when
   * compression is unavailable (web), unnecessary, or fails. Rejects only with
   * CompressionCancelled.
   */
  promise: Promise<string>;
  cancel: () => void;
};

/**
 * Compress `uri` to the preset's size and bitrate (portfolio's 1920 / 4 Mbps by default). Native only; on web the
 * original is returned untouched. Any failure falls back to the original so a
 * compressor problem never blocks an upload.
 */
export function startVideoCompression(
  uri: string,
  info: VideoSourceInfo = {},
  onProgress?: (fraction: number) => void,
  preset: VideoPreset = PORTFOLIO_VIDEO,
): VideoCompression {
  let cancelled = false;
  let cancellationId: string | null = null;
  let Video: typeof import('react-native-compressor').Video | null = null;

  const promise = (async () => {
    if (Platform.OS === 'web' || isAlreadySmall(info, preset)) return uri;
    try {
      // Lazy: the module has no web build, and a missing native module must not crash import.
      Video = require('react-native-compressor').Video;
      const out = await Video!.compress(
        uri,
        {
          compressionMethod: 'manual',
          maxSize: preset.maxSize,
          bitrate: preset.bitrate,
          getCancellationId: (id: string) => {
            cancellationId = id;
            if (cancelled) Video?.cancelCompression(id);
          },
        },
        (p: number) => onProgress?.(Math.min(1, Math.max(0, p))),
      );
      if (cancelled) throw new CompressionCancelled();
      return out || uri;
    } catch (e) {
      if (cancelled || e instanceof CompressionCancelled) throw new CompressionCancelled();
      console.warn('[compressVideo] on-device compression failed, uploading original:', e);
      return uri;
    }
  })();

  return {
    promise,
    cancel: () => {
      cancelled = true;
      if (cancellationId) Video?.cancelCompression(cancellationId);
    },
  };
}
