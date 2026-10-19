const mockCompress = jest.fn();
const mockCancel = jest.fn();
jest.mock('react-native-compressor', () => ({
  Video: { compress: (...a: unknown[]) => mockCompress(...a), cancelCompression: (id: string) => mockCancel(id) },
}));

import { Platform } from 'react-native';
import { CompressionCancelled, isAlreadySmall, startVideoCompression } from '../compressForUpload';

const BIG = { width: 3840, height: 2160, duration: 60_000, fileSize: 400_000_000 };

beforeEach(() => {
  jest.clearAllMocks();
  (Platform as { OS: string }).OS = 'ios';
});

const H264 = { codec: 'h264' };

describe('isAlreadySmall', () => {
  it('is true for 1080p at 2 Mbps', () => {
    expect(isAlreadySmall({ ...H264, width: 1920, height: 1080, duration: 10_000, fileSize: 2_500_000 })).toBe(true);
  });
  it('is true for portrait 1080x1920', () => {
    expect(isAlreadySmall({ ...H264, width: 1080, height: 1920, duration: 10_000, fileSize: 2_500_000 })).toBe(true);
  });
  it('is false above the bitrate', () => {
    expect(isAlreadySmall({ ...H264, width: 1920, height: 1080, duration: 10_000, fileSize: 10_000_000 })).toBe(false);
  });
  it('is false for 4K even at a low bitrate', () => {
    expect(isAlreadySmall({ ...H264, ...BIG, fileSize: 1_000_000 })).toBe(false);
  });
  it.each([['hevc'], ['h265'], ['HEVC'], [undefined], [null], ['']])(
    'is false for a small clip whose codec is %p (iPhone HEVC must be converted to H.264)',
    (codec) => {
      expect(isAlreadySmall({ codec, width: 1280, height: 720, duration: 10_000, fileSize: 500_000 })).toBe(false);
    },
  );
  it.each([['h264'], ['H.264'], ['avc1']])('accepts %s as H.264', (codec) => {
    expect(isAlreadySmall({ codec, width: 1280, height: 720, duration: 10_000, fileSize: 500_000 })).toBe(true);
  });
  it('is false when anything is unknown', () => {
    expect(isAlreadySmall({})).toBe(false);
    expect(isAlreadySmall({ width: 1920, height: 1080, duration: 10_000 })).toBe(false);
  });
});

describe('startVideoCompression', () => {
  it('compresses with manual mode, 1920 and 4 Mbps and reports clamped progress', async () => {
    const progress = jest.fn();
    mockCompress.mockImplementation(async (_u: string, _o: unknown, cb: (p: number) => void) => {
      cb(0.5);
      cb(1.4);
      return 'file:///out.mp4';
    });
    const { promise } = startVideoCompression('file:///in.mov', BIG, progress);
    await expect(promise).resolves.toBe('file:///out.mp4');
    expect(mockCompress).toHaveBeenCalledWith(
      'file:///in.mov',
      expect.objectContaining({ compressionMethod: 'manual', maxSize: 1920, bitrate: 4_000_000 }),
      expect.any(Function),
    );
    expect(progress.mock.calls.map((c) => c[0])).toEqual([0.5, 1]);
  });

  it('skips on web', async () => {
    (Platform as { OS: string }).OS = 'web';
    await expect(startVideoCompression('blob:x', BIG).promise).resolves.toBe('blob:x');
    expect(mockCompress).not.toHaveBeenCalled();
  });

  it('compresses a small HEVC clip (no codec reported by the picker)', async () => {
    mockCompress.mockResolvedValue('file:///h264.mp4');
    const hevcSmall = { width: 1280, height: 720, duration: 10_000, fileSize: 1_000_000 };
    await expect(startVideoCompression('file:///s.mov', hevcSmall).promise).resolves.toBe('file:///h264.mp4');
    expect(mockCompress).toHaveBeenCalled();
  });

  it('skips an already-small clip', async () => {
    const small = { codec: 'h264', width: 1280, height: 720, duration: 10_000, fileSize: 1_000_000 };
    await expect(startVideoCompression('file:///s.mp4', small).promise).resolves.toBe('file:///s.mp4');
    expect(mockCompress).not.toHaveBeenCalled();
  });

  it('falls back to the original when compression throws', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockCompress.mockRejectedValue(new Error('codec'));
    await expect(startVideoCompression('file:///in.mov', BIG).promise).resolves.toBe('file:///in.mov');
  });

  it('cancel() cancels natively and rejects with CompressionCancelled', async () => {
    let finish!: (v: string) => void;
    mockCompress.mockImplementation((_u: string, o: { getCancellationId: (id: string) => void }) => {
      o.getCancellationId('abc');
      return new Promise<string>((r) => { finish = r; });
    });
    const job = startVideoCompression('file:///in.mov', BIG);
    await Promise.resolve();
    job.cancel();
    expect(mockCancel).toHaveBeenCalledWith('abc');
    finish('file:///out.mp4');
    await expect(job.promise).rejects.toBeInstanceOf(CompressionCancelled);
  });
});
