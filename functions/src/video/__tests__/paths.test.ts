import { compressedPathFor, jobIdFor, parseOwnedVideoPath } from '../paths';

const ME = 'uid123';

describe('parseOwnedVideoPath', () => {
  it('accepts the exact shapes the app uploads', () => {
    expect(parseOwnedVideoPath(`portfolio/${ME}/1760000000000.mp4`, ME)).toEqual({
      filePath: `portfolio/${ME}/1760000000000.mp4`,
      jobId: jobIdFor(`portfolio/${ME}/1760000000000.mp4`),
      compressedPath: `portfolio/${ME}/1760000000000_compressed.mp4`,
    });
    expect(parseOwnedVideoPath(`chat-videos/${ME}/1.mp4`, ME)).not.toBeNull();
  });

  it('rejects another user\'s path', () => {
    expect(parseOwnedVideoPath('portfolio/someoneElse/1.mp4', ME)).toBeNull();
    expect(parseOwnedVideoPath('chat-videos/someoneElse/1.mp4', ME)).toBeNull();
  });

  it.each([
    [`portfolio/${ME}/../other/1.mp4`],
    [`portfolio/${ME}/..%2Fother/1.mp4`],
    [`portfolio/${ME}/../../users/x.mp4`],
    [`portfolio/../${ME}/1.mp4`],
    [`portfolio/${ME}/..`],
    [`portfolio/${ME}/.mp4`],
    [`portfolio//1.mp4`],
    [`portfolio/${ME}//1.mp4`],
    [`/portfolio/${ME}/1.mp4`],
    [`portfolio/${ME}/sub/1.mp4`],
    [`portfolio\\${ME}\\1.mp4`],
    [`portfolio/${ME}/1.mp4/`],
    [`portfolio/${ME}/a b.mp4`],
    [`portfolio/${ME}/1.mp4\n`],
  ])('rejects traversal / malformed path %j', (p) => {
    expect(parseOwnedVideoPath(p, ME)).toBeNull();
  });

  it.each([
    ['courses'], ['avatars'], ['chat-images'], ['users'], ['reports'],
  ])('rejects other folders (%s)', (folder) => {
    expect(parseOwnedVideoPath(`${folder}/${ME}/1.mp4`, ME)).toBeNull();
  });

  it('rejects non-mp4, compressed outputs and non-strings', () => {
    expect(parseOwnedVideoPath(`portfolio/${ME}/1.mov`, ME)).toBeNull();
    expect(parseOwnedVideoPath(`portfolio/${ME}/1_compressed.mp4`, ME)).toBeNull();
    expect(parseOwnedVideoPath(undefined, ME)).toBeNull();
    expect(parseOwnedVideoPath({ toString: () => `portfolio/${ME}/1.mp4` }, ME)).toBeNull();
    expect(parseOwnedVideoPath(`portfolio/${ME}/${'a'.repeat(400)}.mp4`, ME)).toBeNull();
  });

  it('rejects an empty or odd caller uid', () => {
    expect(parseOwnedVideoPath('portfolio//1.mp4', '')).toBeNull();
    expect(parseOwnedVideoPath('portfolio/a/b/1.mp4', 'a/b')).toBeNull();
  });
});

describe('derived values match compressVideo', () => {
  it('compressedPathFor mirrors path.join(dir, name + _compressed.mp4)', () => {
    expect(compressedPathFor('portfolio/u/123.mp4')).toBe('portfolio/u/123_compressed.mp4');
  });
  it('jobIdFor mirrors the client and the function', () => {
    const p = 'portfolio/u/123.mp4';
    expect(jobIdFor(p)).toBe(btoa(p).replace(/[/+=]/g, '_'));
  });
});
