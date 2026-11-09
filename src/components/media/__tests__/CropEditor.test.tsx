import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';

const mockNormalize = jest.fn();
const mockApply = jest.fn();
jest.mock('@core/media/crop/cropImage', () => ({
  normalizeForEditing: (...a: unknown[]) => mockNormalize(...a),
  applyCrop: (...a: unknown[]) => mockApply(...a),
}));
jest.mock('lucide-react-native', () => ({ Check: 'Check', RotateCw: 'RotateCw', X: 'X' }));
jest.mock('react-native-gesture-handler', () => {
  const RN = jest.requireActual('react-native');
  const chain: unknown = new Proxy(function () {} as never, { get: () => () => chain, apply: () => chain });
  return {
    Gesture: { Pan: () => chain },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    GestureHandlerRootView: RN.View,
  };
});

import { CropEditor } from '../CropEditor';

const t = (k: string) => k;
const onCancel = jest.fn();
const onDone = jest.fn();

// A 2000x1000 photo in a 400x600 stage -> shown at 400x200, 0.2 points per pixel.
async function open() {
  const r = render(<CropEditor uri="file:///o.heic" onCancel={onCancel} onDone={onDone} accent="#004aad" rtl={false} t={t} topInset={0} bottomInset={0} />);
  await act(async () => { await Promise.resolve(); });
  fireEvent(r.getByTestId('crop-stage'), 'layout', { nativeEvent: { layout: { width: 400, height: 600 } } });
  await waitFor(() => r.getByTestId('crop-frame'));
  return r;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNormalize.mockResolvedValue({ uri: 'file:///norm.jpg', width: 2000, height: 1000 });
  mockApply.mockResolvedValue({ uri: 'file:///cropped.jpg', width: 1000, height: 1000 });
});

it('normalises the original first, then shows the frame and handles', async () => {
  const r = await open();
  expect(mockNormalize).toHaveBeenCalledWith('file:///o.heic');
  for (const c of ['tl', 'tr', 'bl', 'br']) expect(r.getByTestId(`crop-handle-${c}`)).toBeTruthy();
});

it('Done on an untouched photo is a cancel (nothing to apply)', async () => {
  const r = await open();
  await act(async () => { fireEvent.press(r.getByTestId('crop-done')); });
  expect(onCancel).toHaveBeenCalled();
  expect(mockApply).not.toHaveBeenCalled();
});

it('1:1 crops the centred square in real pixels', async () => {
  const r = await open();
  fireEvent.press(r.getByTestId('crop-aspect-1:1'));
  await act(async () => { fireEvent.press(r.getByTestId('crop-done')); });
  expect(mockApply).toHaveBeenCalledWith('file:///norm.jpg', {
    quarterTurns: 0,
    crop: { originX: 500, originY: 0, width: 1000, height: 1000 },
  });
  expect(onDone).toHaveBeenCalledWith({ uri: 'file:///cropped.jpg', width: 1000, height: 1000 });
});

it('rotate turns the frame space: the whole rotated image is a real edit', async () => {
  const r = await open();
  fireEvent.press(r.getByTestId('crop-rotate'));
  await act(async () => { fireEvent.press(r.getByTestId('crop-done')); });
  // Rotated image is 1000x2000; fitted to 400x600 it is 300x600 (0.3 per pixel).
  expect(mockApply).toHaveBeenCalledWith('file:///norm.jpg', {
    quarterTurns: 1,
    crop: { originX: 0, originY: 0, width: 1000, height: 2000 },
  });
});

it('tapping 4:5 twice flips it to 5:4', async () => {
  const r = await open();
  fireEvent.press(r.getByTestId('crop-aspect-4:5'));
  fireEvent.press(r.getByTestId('crop-aspect-4:5'));
  await act(async () => { fireEvent.press(r.getByTestId('crop-done')); });
  const { crop } = mockApply.mock.calls[0][1];
  expect(crop.width / crop.height).toBeCloseTo(5 / 4, 1);
});

it('Reset returns to the whole photo with no rotation', async () => {
  const r = await open();
  fireEvent.press(r.getByTestId('crop-rotate'));
  fireEvent.press(r.getByTestId('crop-aspect-1:1'));
  fireEvent.press(r.getByTestId('crop-reset'));
  await act(async () => { fireEvent.press(r.getByTestId('crop-done')); });
  expect(mockApply).not.toHaveBeenCalled();
  expect(onCancel).toHaveBeenCalled();
});

it('X cancels without touching the file', async () => {
  const r = await open();
  fireEvent.press(r.getByTestId('crop-cancel'));
  expect(onCancel).toHaveBeenCalled();
  expect(mockApply).not.toHaveBeenCalled();
});

it('shows a message when the photo cannot be opened', async () => {
  mockNormalize.mockRejectedValue(new Error('decode'));
  const r = render(<CropEditor uri="file:///x" onCancel={onCancel} onDone={onDone} accent="#000" rtl={false} t={t} topInset={0} bottomInset={0} />);
  await waitFor(() => r.getByText('chats.crop_failed'));
});
