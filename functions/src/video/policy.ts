/**
 * Decides whether compressVideo has to re-encode an upload.
 *
 * The app compresses on the phone first (react-native-compressor: H.264, long
 * side 1920, 4 Mbps). Such a file is already what we would produce, so
 * re-encoding it only adds a minute of ffmpeg and a generation of quality loss.
 * We look at the file with `ffmpeg -i` (ffmpeg-static ships no ffprobe) and, when
 * it is already within budget, only remux it with +faststart.
 */

/** A clip within 1080p: the short side <= 1080 and the long side <= 1920. */
export const MAX_SHORT_SIDE = 1080;
export const MAX_LONG_SIDE = 1920;

/** Total (video + audio) bitrate at or below which we do not re-encode. The app targets 4 Mbps. */
export const SKIP_MAX_KBPS = 5000;

/** Cap for the re-encode path, so a noisy 4K source cannot come out huge. */
export const REENCODE_MAXRATE_KBPS = 5000;

export type ProbeInfo = {
  /** Width/height as displayed, i.e. after applying rotation metadata. */
  width: number;
  height: number;
  videoCodec: string;
  /** e.g. yuv420p, yuv420p10le */
  pixFmt: string | null;
  audioCodec: string | null;
  /** True when the demuxer is the mov/mp4 family. */
  isMp4Family: boolean;
  durationSec: number | null;
  /** Container-level bitrate from the header, kb/s. */
  headerKbps: number | null;
};

/** Parse the stderr of `ffmpeg -i file` (no output). Null when no video stream is found. */
export function parseProbe(stderr: string): ProbeInfo | null {
  const video = /Stream #\d+:\d+[^\n]*?: Video: (\w+)([^\n]*)/.exec(stderr);
  if (!video) return null;
  const rest = video[2];

  const size = /[ ,](\d{2,5})x(\d{2,5})(?=[ ,\[]|$)/m.exec(rest);
  if (!size) return null;
  let width = Number(size[1]);
  let height = Number(size[2]);

  // iPhone portrait clips are stored landscape with a rotation tag. Two spellings:
  // "displaymatrix: rotation of -90.00 degrees" (side data) and "rotate : 90" (metadata).
  const afterVideo = stderr.slice(video.index);
  const nextStream = afterVideo.slice(1).search(/\n\s*Stream #\d+:\d+/);
  const videoBlock = nextStream === -1 ? afterVideo : afterVideo.slice(0, nextStream + 1);
  const rot =
    /rotation of (-?\d+(?:\.\d+)?) degrees/.exec(videoBlock) ?? /\brotate\s*:\s*(-?\d+)/.exec(videoBlock);
  if (rot) {
    const deg = ((Math.round(Number(rot[1])) % 360) + 360) % 360;
    if (deg === 90 || deg === 270) [width, height] = [height, width];
  }

  const audio = /Stream #\d+:\d+[^\n]*?: Audio: (\w+)/.exec(stderr);
  const pix = /\b(yuv\w+|nv12|gray\w*|rgb\w*|bgr\w*)\b/.exec(rest);
  const dur = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  const br = /Duration:[^\n]*?bitrate: (\d+) kb\/s/.exec(stderr);

  return {
    width,
    height,
    videoCodec: video[1].toLowerCase(),
    pixFmt: pix ? pix[1] : null,
    audioCodec: audio ? audio[1].toLowerCase() : null,
    isMp4Family: /Input #0, ([^\n]*?), from /.exec(stderr)?.[1].split(',').includes('mp4') ?? false,
    durationSec: dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : null,
    headerKbps: br ? Number(br[1]) : null,
  };
}

/**
 * Bitrate to judge by: the larger of the header value and size/duration, so a
 * file whose header understates its bitrate is still caught.
 */
export function effectiveKbps(info: ProbeInfo, sizeBytes: number | null): number | null {
  const fromSize =
    sizeBytes && info.durationSec && info.durationSec > 0
      ? (sizeBytes * 8) / 1000 / info.durationSec
      : null;
  if (fromSize == null) return info.headerKbps;
  return info.headerKbps == null ? fromSize : Math.max(info.headerKbps, fromSize);
}

export function fitsWithin1080p(width: number, height: number): boolean {
  return Math.min(width, height) <= MAX_SHORT_SIDE && Math.max(width, height) <= MAX_LONG_SIDE;
}

/** True when the upload can skip the libx264 re-encode (remux only). */
export function canSkipReencode(info: ProbeInfo | null, sizeBytes: number | null): boolean {
  if (!info) return false;
  if (!info.isMp4Family) return false;
  // Only what plays everywhere: 8-bit 4:2:0 H.264, AAC (or silent).
  if (info.videoCodec !== 'h264') return false;
  if (info.pixFmt && info.pixFmt !== 'yuv420p') return false;
  if (info.audioCodec && info.audioCodec !== 'aac') return false;
  if (!fitsWithin1080p(info.width, info.height)) return false;
  const kbps = effectiveKbps(info, sizeBytes);
  // Unknown bitrate: cannot prove it is small, so re-encode.
  return kbps != null && kbps <= SKIP_MAX_KBPS;
}

/**
 * ffmpeg -vf for the re-encode path: shrink to fit 1080p (long side 1920 / short
 * side 1080), never enlarge, keep both sides even (yuv420p). ffmpeg has already
 * applied rotation when the filter runs, so iw/ih are the displayed size.
 */
export const SCALE_TO_1080P_FILTER =
  "scale='trunc(min(1,min(1920/max(iw,ih),1080/min(iw,ih)))*iw/2)*2':" +
  "'trunc(min(1,min(1920/max(iw,ih),1080/min(iw,ih)))*ih/2)*2'";
