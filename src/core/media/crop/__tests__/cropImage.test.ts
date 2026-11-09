const mockCalls: string[] = [];
const mockSave = jest.fn(async (o: unknown) => { mockCalls.push(`save:${JSON.stringify(o)}`); return { uri: 'file:///out.jpg', width: 800, height: 600 }; });
let mockDims = { width: 4000, height: 3000 };
const mockManipulate = jest.fn((_src: unknown) => {
  const ctx = {
    rotate: (d: number) => { mockCalls.push(`rotate:${d}`); return ctx; },
    crop: (r: unknown) => { mockCalls.push(`crop:${JSON.stringify(r)}`); return ctx; },
    resize: (s: unknown) => { mockCalls.push(`resize:${JSON.stringify(s)}`); return ctx; },
    renderAsync: async () => ({ ...mockDims, saveAsync: mockSave }),
  };
  return ctx;
});
jest.mock('expo-image-manipulator', () => ({ ImageManipulator: { manipulate: mockManipulate }, SaveFormat: { JPEG: 'jpeg' } }));

import { applyCrop, normalizeForEditing, MAX_EDIT_SIDE } from '../cropImage';

beforeEach(() => { jest.clearAllMocks(); mockCalls.length = 0; mockDims = { width: 4000, height: 3000 }; });

describe('normalizeForEditing', () => {
  it('re-saves an upright JPEG and returns its size', async () => {
    await expect(normalizeForEditing('file:///in.heic')).resolves.toEqual({ uri: 'file:///out.jpg', width: 800, height: 600 });
    expect(mockManipulate).toHaveBeenCalledWith('file:///in.heic');
    expect(mockCalls).toEqual(['save:{"format":"jpeg","compress":0.95}']);
  });
  it('caps a huge photo on its long side', async () => {
    mockDims = { width: 8000, height: 6000 };
    await normalizeForEditing('file:///big.jpg');
    expect(mockCalls[0]).toBe(`resize:{"width":${MAX_EDIT_SIDE},"height":null}`);
  });
  it('caps a huge portrait by height', async () => {
    mockDims = { width: 6000, height: 8000 };
    await normalizeForEditing('file:///big.jpg');
    expect(mockCalls[0]).toBe(`resize:{"width":null,"height":${MAX_EDIT_SIDE}}`);
  });
});

describe('applyCrop', () => {
  const crop = { originX: 10, originY: 20, width: 300, height: 200 };
  it('crops the original pixels and saves a JPEG', async () => {
    await expect(applyCrop('file:///n.jpg', { quarterTurns: 0, crop })).resolves.toEqual({ uri: 'file:///out.jpg', width: 800, height: 600 });
    expect(mockCalls).toEqual([`crop:${JSON.stringify(crop)}`, 'save:{"format":"jpeg","compress":0.92}']);
  });
  it('rotates first, so the crop is in the rotated image', async () => {
    await applyCrop('file:///n.jpg', { quarterTurns: 1, crop });
    expect(mockCalls.slice(0, 2)).toEqual(['rotate:90', `crop:${JSON.stringify(crop)}`]);
  });
  it('three quarter turns is 270°', async () => {
    await applyCrop('file:///n.jpg', { quarterTurns: 3, crop });
    expect(mockCalls[0]).toBe('rotate:270');
  });
});
