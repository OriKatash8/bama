import {
  canSkipReencode,
  effectiveKbps,
  fitsWithin1080p,
  parseProbe,
  SCALE_TO_1080P_FILTER,
} from '../policy';

// Real `ffmpeg -i` stderr (ffmpeg-static 6.0), trimmed to the lines the parser reads.
const stderr = (opts: {
  video: string;
  audio?: string | null;
  header?: string;
  input?: string;
  videoExtra?: string;
}) => `Input #0, ${opts.input ?? 'mov,mp4,m4a,3gp,3g2,mj2'}, from 'a.mp4':
  Metadata:
    major_brand     : isom
  Duration: ${opts.header ?? '00:00:10.00, start: 0.000000, bitrate: 3800 kb/s'}
  Stream #0:0[0x1](und): Video: ${opts.video}
    Metadata:
      handler_name    : VideoHandler
${opts.videoExtra ?? ''}${
  opts.audio === null
    ? ''
    : `  Stream #0:1[0x2](und): Audio: ${opts.audio ?? 'aac (LC) (mp4a / 0x6134706D), 44100 Hz, mono, fltp, 69 kb/s (default)'}
    Metadata:
      handler_name    : SoundHandler
`
}`;

const H264_1080P =
  'h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709, progressive), 1920x1080 [SAR 1:1 DAR 16:9], 3700 kb/s, 30 fps, 30 tbr, 600 tbn (default)';

describe('parseProbe', () => {
  it('reads codec, size, pixel format, audio, duration and header bitrate', () => {
    const info = parseProbe(stderr({ video: H264_1080P }))!;
    expect(info).toMatchObject({
      width: 1920,
      height: 1080,
      videoCodec: 'h264',
      pixFmt: 'yuv420p',
      audioCodec: 'aac',
      isMp4Family: true,
      durationSec: 10,
      headerKbps: 3800,
    });
  });

  it('does not mistake the 0x31637661 fourcc for a resolution', () => {
    const info = parseProbe(stderr({ video: H264_1080P }))!;
    expect([info.width, info.height]).toEqual([1920, 1080]);
  });

  it('reports no audio for a silent clip', () => {
    expect(parseProbe(stderr({ video: H264_1080P, audio: null }))!.audioCodec).toBeNull();
  });

  it('swaps the sides for a 90/270 degree displaymatrix (iPhone portrait)', () => {
    const extra = '    Side data:\n      displaymatrix: rotation of -90.00 degrees\n';
    const info = parseProbe(stderr({ video: H264_1080P, videoExtra: extra }))!;
    expect([info.width, info.height]).toEqual([1080, 1920]);
  });

  it('swaps the sides for the older "rotate : 90" metadata', () => {
    const extra = '      rotate          : 90\n';
    const info = parseProbe(stderr({ video: H264_1080P, videoExtra: extra }))!;
    expect([info.width, info.height]).toEqual([1080, 1920]);
  });

  it('keeps the sides for a 180 degree rotation', () => {
    const extra = '    Side data:\n      displaymatrix: rotation of 180.00 degrees\n';
    const info = parseProbe(stderr({ video: H264_1080P, videoExtra: extra }))!;
    expect([info.width, info.height]).toEqual([1920, 1080]);
  });

  it('ignores a rotation that belongs to a later stream', () => {
    const text =
      stderr({ video: H264_1080P }) + '    Side data:\n      displaymatrix: rotation of -90.00 degrees\n';
    const info = parseProbe(text)!;
    expect([info.width, info.height]).toEqual([1920, 1080]);
  });

  it('returns null when there is no video stream', () => {
    expect(parseProbe('Input #0, mp3, from a.mp3:\n  Stream #0:0: Audio: mp3, 44100 Hz\n')).toBeNull();
    expect(parseProbe('')).toBeNull();
  });
});

describe('canSkipReencode', () => {
  const info = (video: string, extra: Parameters<typeof stderr>[0] = { video }) =>
    parseProbe(stderr({ ...extra, video }));

  it('skips a 1080p H.264/AAC mp4 under 5 Mbps', () => {
    expect(canSkipReencode(info(H264_1080P), 5_000_000)).toBe(true);
  });

  it('skips a silent clip', () => {
    expect(canSkipReencode(info(H264_1080P, { video: H264_1080P, audio: null }), 4_000_000)).toBe(true);
  });

  it('skips a portrait 1080x1920 clip (display size, not coded size)', () => {
    const extra = '    Side data:\n      displaymatrix: rotation of -90.00 degrees\n';
    expect(canSkipReencode(info(H264_1080P, { video: H264_1080P, videoExtra: extra }), 4_000_000)).toBe(true);
  });

  it('re-encodes 4K', () => {
    const v = H264_1080P.replace('1920x1080', '3840x2160');
    expect(canSkipReencode(info(v), 1_000_000)).toBe(false);
  });

  it('re-encodes 1440p', () => {
    const v = H264_1080P.replace('1920x1080', '2560x1440');
    expect(canSkipReencode(info(v), 1_000_000)).toBe(false);
  });

  it('re-encodes above 5 Mbps by header', () => {
    const header = '00:00:10.00, start: 0.000000, bitrate: 9000 kb/s';
    expect(canSkipReencode(info(H264_1080P, { video: H264_1080P, header }), 1_000_000)).toBe(false);
  });

  it('re-encodes above 5 Mbps by file size even if the header understates it', () => {
    // 10 s, 20 MB => 16 Mbps
    expect(canSkipReencode(info(H264_1080P), 20_000_000)).toBe(false);
  });

  it('re-encodes HEVC', () => {
    expect(canSkipReencode(info(H264_1080P.replace('h264 (High)', 'hevc (Main)').replace(/^h264/, 'hevc')), 4_000_000)).toBe(false);
    expect(canSkipReencode(info('hevc (Main) (hvc1 / 0x31637668), yuv420p(tv, progressive), 1920x1080, 3700 kb/s, 30 fps'), 4_000_000)).toBe(false);
  });

  it('re-encodes 10-bit H.264', () => {
    expect(canSkipReencode(info(H264_1080P.replace('yuv420p(', 'yuv420p10le(')), 4_000_000)).toBe(false);
  });

  it('re-encodes non-AAC audio', () => {
    expect(canSkipReencode(info(H264_1080P, { video: H264_1080P, audio: 'mp3, 44100 Hz, stereo, fltp, 128 kb/s' }), 4_000_000)).toBe(false);
  });

  it('re-encodes a non-mp4 container', () => {
    expect(canSkipReencode(info(H264_1080P, { video: H264_1080P, input: 'matroska,webm' }), 4_000_000)).toBe(false);
  });

  it('re-encodes when the bitrate is unknown', () => {
    const header = '00:00:10.00, start: 0.000000, bitrate: N/A';
    expect(canSkipReencode(info(H264_1080P, { video: H264_1080P, header }), null)).toBe(false);
  });

  it('re-encodes when the probe failed', () => {
    expect(canSkipReencode(null, 1_000_000)).toBe(false);
  });
});

describe('helpers', () => {
  it('fitsWithin1080p accepts both orientations and rejects larger', () => {
    expect(fitsWithin1080p(1920, 1080)).toBe(true);
    expect(fitsWithin1080p(1080, 1920)).toBe(true);
    expect(fitsWithin1080p(1280, 720)).toBe(true);
    expect(fitsWithin1080p(2560, 1440)).toBe(false);
    expect(fitsWithin1080p(2160, 3840)).toBe(false);
  });

  it('effectiveKbps takes the larger of header and size-derived', () => {
    const base = parseProbe(stderr({ video: H264_1080P }))!; // 10 s, header 3800
    expect(effectiveKbps(base, null)).toBe(3800);
    expect(effectiveKbps(base, 5_000_000)).toBe(4000); // 5 MB / 10 s
    expect(effectiveKbps(base, 1_000_000)).toBe(3800);
  });

  it('exports a scale filter that never enlarges', () => {
    expect(SCALE_TO_1080P_FILTER).toContain('min(1,');
  });
});
