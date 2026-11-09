const mockResize = jest.fn();
const mockSave = jest.fn(async () => ({ uri: 'file:///out.jpg' }));
let mockDims = { width: 4000, height: 3000 };
const mockManipulate = jest.fn((_src: unknown) => ({
  resize: (size: unknown) => {
    mockResize(size);
    return { renderAsync: async () => ({ width: 1, height: 1, saveAsync: mockSave }) };
  },
  renderAsync: async () => ({ ...mockDims, saveAsync: mockSave }),
}));
let mockMissing = false;

jest.mock('expo-image-manipulator', () => {
  if (mockMissing) throw new Error("Cannot find native module 'ExpoImageManipulator'");
  return { ImageManipulator: { manipulate: mockManipulate }, SaveFormat: { JPEG: 'jpeg' } };
});

const CHAT = { maxSide: 2048, quality: 0.8 };

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  mockMissing = false;
  mockDims = { width: 4000, height: 3000 };
});

it('caps a landscape photo at maxSide by width and saves a JPEG', async () => {
  const { prepareImageForUpload } = require('../prepareImageForUpload');
  await expect(prepareImageForUpload('file:///big.heic', CHAT)).resolves.toBe('file:///out.jpg');
  expect(mockResize).toHaveBeenCalledWith({ width: 2048, height: null });
  expect(mockSave).toHaveBeenCalledWith({ format: 'jpeg', compress: 0.8 });
});

it('caps a portrait photo by height (orientation already applied on load)', async () => {
  mockDims = { width: 3000, height: 4000 };
  const { prepareImageForUpload } = require('../prepareImageForUpload');
  await prepareImageForUpload('file:///p.heic', CHAT);
  expect(mockResize).toHaveBeenCalledWith({ width: null, height: 2048 });
});

it('does not enlarge a small photo, but still re-encodes it as JPEG', async () => {
  mockDims = { width: 800, height: 600 };
  const { prepareImageForUpload } = require('../prepareImageForUpload');
  await expect(prepareImageForUpload('file:///s.heic', CHAT)).resolves.toBe('file:///out.jpg');
  expect(mockResize).not.toHaveBeenCalled();
});

it('uses the portfolio cap and quality when asked', async () => {
  mockDims = { width: 5000, height: 4000 };
  const { prepareImageForUpload, PORTFOLIO_IMAGE } = require('../prepareImageForUpload');
  await prepareImageForUpload('file:///big.jpg', PORTFOLIO_IMAGE);
  expect(mockResize).toHaveBeenCalledWith({ width: 3072, height: null });
  expect(mockSave).toHaveBeenCalledWith({ format: 'jpeg', compress: 0.85 });
});

it('returns the original when the native module is missing', async () => {
  mockMissing = true;
  const { prepareImageForUpload } = require('../prepareImageForUpload');
  await expect(prepareImageForUpload('file:///big.jpg', CHAT)).resolves.toBe('file:///big.jpg');
});

it('returns the original when processing fails', async () => {
  mockSave.mockRejectedValueOnce(new Error('decode failed'));
  const { prepareImageForUpload } = require('../prepareImageForUpload');
  await expect(prepareImageForUpload('file:///big.jpg', CHAT)).resolves.toBe('file:///big.jpg');
});
