/**
 * A profile photo is shown at 28–120px, and was uploaded at full camera size —
 * several MB each, which is what made the chat's pictures slow to arrive. It is
 * shrunk to 512px wide, JPEG at 0.8, before upload.
 *
 * The native module arrives with a new build; on a build without it the photo
 * goes up as it is, exactly as before, rather than failing the upload.
 */

const mockResize = jest.fn();
const mockSave = jest.fn(async () => ({ uri: 'file:///small.jpg', width: 512, height: 512 }));
const mockManipulate = jest.fn(() => ({
  resize: (size: unknown) => {
    mockResize(size);
    return { renderAsync: async () => ({ saveAsync: mockSave }) };
  },
}));
let mockMissing = false;

jest.mock('expo-image-manipulator', () => {
  if (mockMissing) throw new Error("Cannot find native module 'ExpoImageManipulator'");
  return { ImageManipulator: { manipulate: mockManipulate }, SaveFormat: { JPEG: 'jpeg' } };
});

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  mockMissing = false;
});

it('resizes to 512 wide, keeping the ratio, and saves a compressed JPEG', async () => {
  const { shrinkAvatar } = require('../shrinkAvatar');
  await expect(shrinkAvatar('file:///big.jpg')).resolves.toBe('file:///small.jpg');
  expect(mockManipulate).toHaveBeenCalledWith('file:///big.jpg');
  expect(mockResize).toHaveBeenCalledWith({ width: 512, height: null });
  expect(mockSave).toHaveBeenCalledWith({ format: 'jpeg', compress: 0.8 });
});

it('uploads the original when the native module is not in this build', async () => {
  mockMissing = true;
  const { shrinkAvatar } = require('../shrinkAvatar');
  await expect(shrinkAvatar('file:///big.jpg')).resolves.toBe('file:///big.jpg');
});

it('uploads the original when resizing fails', async () => {
  mockSave.mockRejectedValueOnce(new Error('decode failed'));
  const { shrinkAvatar } = require('../shrinkAvatar');
  await expect(shrinkAvatar('file:///big.jpg')).resolves.toBe('file:///big.jpg');
});
