import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { PortfolioGrid } from '../PortfolioGrid';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

/**
 * Uploading to the portfolio asks the professional for a caption first — it is the
 * only chance to write one, and clients read it on the full-screen slide.
 *
 * Guarded here:
 *  - picking media opens the caption sheet instead of uploading straight away
 *  - Save passes the typed caption through to the upload handler
 *  - Skip uploads with no caption rather than blocking the upload
 *  - cancelling the picker never opens the sheet
 *  - the sheet is Hebrew-aware, like every other input in the app
 */

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  UIImagePickerPreferredAssetRepresentationMode: { Compatible: 'compatible' },
}));
jest.mock('expo-video', () => ({
  useVideoPlayer: () => ({ play: jest.fn(), pause: jest.fn(), muted: false }),
  VideoView: 'VideoView',
}));
jest.mock('../PortfolioFeed', () => ({ PortfolioFeed: () => null }));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { id: string } }) => unknown) => s({ user: { id: 'u1' } }),
}));
let mockLang: 'he' | 'en' = 'en';
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLang }),
}));
const mockUploadVideo = jest.fn();
const mockCancelVideo = jest.fn();
const mockHook = {
  stage: 'idle' as string, progress: 0, slow: false, error: null as string | null, outcome: null as string | null,
};
jest.mock('@core/hooks/useVideoUpload', () => ({
  useVideoUpload: () => ({
    ...mockHook, cancel: mockCancelVideo, getOutcome: () => mockHook.outcome, uploadVideo: mockUploadVideo,
  }),
}));

const pick = ImagePicker.launchImageLibraryAsync as jest.MockedFunction<
  typeof ImagePicker.launchImageLibraryAsync
>;

const pickedPhoto = {
  canceled: false,
  assets: [{ uri: 'file:///tmp/shot.jpg', type: 'image' }],
} as unknown as ImagePicker.ImagePickerResult;

function setup() {
  const onAdd = jest.fn().mockResolvedValue(undefined);
  const onAddVideo = jest.fn().mockResolvedValue(undefined);
  const r = render(
    <PortfolioGrid assets={[]} isEditing onAdd={onAdd} onAddVideo={onAddVideo} />,
  );
  return { r, onAdd, onAddVideo };
}

async function pressAdd(r: ReturnType<typeof render>) {
  await act(async () => { fireEvent.press(r.getByText(en.profile_sections.add_media)); });
}

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockHook, { stage: 'idle', progress: 0, slow: false, error: null, outcome: null });
  mockLang = 'en';
  pick.mockResolvedValue(pickedPhoto);
});

it('asks for a caption before uploading, instead of uploading straight away', async () => {
  const { r, onAdd } = setup();
  await pressAdd(r);

  expect(r.getByText(en.media.caption_title)).toBeTruthy();
  expect(onAdd).not.toHaveBeenCalled();
});

it('passes the typed caption to the upload', async () => {
  const { r, onAdd } = setup();
  await pressAdd(r);

  fireEvent.changeText(r.getByTestId('caption-input'), 'Golden hour, Tel Aviv rooftop');
  await act(async () => { fireEvent.press(r.getByText(en.media.caption_save)); });

  await waitFor(() => expect(onAdd).toHaveBeenCalledWith(
    'file:///tmp/shot.jpg', 'Golden hour, Tel Aviv rooftop', expect.any(Object),
  ));
});

it('Skip still uploads, and discards anything already typed', async () => {
  const { r, onAdd } = setup();
  await pressAdd(r);

  // Type first: Skip must mean "no caption", not "save what I half-wrote"
  fireEvent.changeText(r.getByTestId('caption-input'), 'half a thought');
  await act(async () => { fireEvent.press(r.getByText(en.media.caption_skip)); });

  await waitFor(() => expect(onAdd).toHaveBeenCalledWith('file:///tmp/shot.jpg', null, expect.any(Object)));
});

it('closes the sheet once the upload is away', async () => {
  const { r } = setup();
  await pressAdd(r);
  await act(async () => { fireEvent.press(r.getByText(en.media.caption_skip)); });

  await waitFor(() => expect(r.queryByText(en.media.caption_title)).toBeNull());
});

it('cancelling the picker never opens the sheet', async () => {
  pick.mockResolvedValue({ canceled: true } as ImagePicker.ImagePickerResult);
  const { r, onAdd } = setup();
  await pressAdd(r);

  expect(r.queryByText(en.media.caption_title)).toBeNull();
  expect(onAdd).not.toHaveBeenCalled();
});

it('captions a video upload too', async () => {
  pick.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///tmp/clip.mov', type: 'video' }],
  } as unknown as ImagePicker.ImagePickerResult);
  mockUploadVideo.mockResolvedValue('https://cdn/clip.mp4');

  const { r, onAddVideo } = setup();
  await pressAdd(r);

  fireEvent.changeText(r.getByTestId('caption-input'), 'Wedding highlight reel');
  await act(async () => { fireEvent.press(r.getByText(en.media.caption_save)); });

  await waitFor(() => expect(onAddVideo).toHaveBeenCalledWith(
    'https://cdn/clip.mp4', 'Wedding highlight reel',
  ));
});

it('Hebrew: the caption sheet reads right-to-left', async () => {
  mockLang = 'he';
  const { r } = setup();
  await act(async () => { fireEvent.press(r.getByText(he.profile_sections.add_media)); });

  expect(r.getByText(he.media.caption_title)).toBeTruthy();
  expect(r.getByTestId('caption-input').props.textAlign).toBe('right');
});

it('refuses a video over 3 minutes: message shown, sheet never opens, nothing uploaded', async () => {
  const confirm = jest.spyOn(require('@utils/confirmDialog'), 'confirmDialog').mockResolvedValue(true);
  pick.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///tmp/long.mov', type: 'video', duration: 200_000 }],
  } as unknown as ImagePicker.ImagePickerResult);

  const { r, onAddVideo } = setup();
  await pressAdd(r);

  expect(confirm).toHaveBeenCalledWith(en.media.video_too_long_title, expect.stringContaining('3 minutes'), expect.anything());
  expect(r.queryByText(en.media.caption_title)).toBeNull();
  expect(mockUploadVideo).not.toHaveBeenCalled();
  expect(onAddVideo).not.toHaveBeenCalled();
  confirm.mockRestore();
});

it('accepts exactly 3 minutes', async () => {
  pick.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///tmp/ok.mov', type: 'video', duration: 180_000 }],
  } as unknown as ImagePicker.ImagePickerResult);
  const { r } = setup();
  await pressAdd(r);
  expect(r.getByText(en.media.caption_title)).toBeTruthy();
});


const pickedVideo = {
  canceled: false,
  assets: [{ uri: 'file:///tmp/clip.mov', type: 'video', duration: 30_000 }],
} as unknown as ImagePicker.ImagePickerResult;

describe('uploading tile: the single cancel control', () => {
  it('Save closes the sheet at once and the photo uploads on a grid tile with an X', async () => {
    let finish!: () => void;
    const { r, onAdd } = setup();
    onAdd.mockImplementation(() => new Promise<void>((res) => { finish = res; }));
    await pressAdd(r);
    await act(async () => { fireEvent.press(r.getByText(en.media.caption_save)); });

    expect(r.queryByText(en.media.caption_title)).toBeNull();
    expect(r.getByTestId('uploading-tile')).toBeTruthy();
    expect(r.getByTestId('uploading-tile-cancel')).toBeTruthy();

    await act(async () => { finish(); });
    await waitFor(() => expect(r.queryByTestId('uploading-tile')).toBeNull());
  });

  it('X during a photo upload cancels the upload and removes the tile', async () => {
    const cancel = jest.fn();
    const { r, onAdd } = setup();
    onAdd.mockImplementation((_u: string, _c: unknown, opts: { control: { cancel?: () => void } }) => {
      opts.control.cancel = cancel;
      return new Promise<void>(() => {});
    });
    await pressAdd(r);
    await act(async () => { fireEvent.press(r.getByText(en.media.caption_skip)); });
    await act(async () => { fireEvent.press(r.getByTestId('uploading-tile-cancel')); });

    expect(cancel).toHaveBeenCalled();
    expect(r.queryByTestId('uploading-tile')).toBeNull();
  });

  it('a video shows its stage on the tile; X cancels and removes it, nothing is added', async () => {
    pick.mockResolvedValue(pickedVideo);
    mockUploadVideo.mockImplementation(() => new Promise<string | null>(() => {}));
    mockHook.stage = 'uploading';
    mockHook.progress = 0.42;
    const { r, onAddVideo } = setup();
    await pressAdd(r);
    await act(async () => { fireEvent.press(r.getByText(en.media.caption_save)); });

    expect(r.getByTestId('uploading-tile-label').props.children).toContain('42%');
    await act(async () => { fireEvent.press(r.getByTestId('uploading-tile-cancel')); });
    expect(mockCancelVideo).toHaveBeenCalled();
    expect(r.queryByTestId('uploading-tile')).toBeNull();
    expect(onAddVideo).not.toHaveBeenCalled();
  });

  it('X works in the processing stage too', async () => {
    pick.mockResolvedValue(pickedVideo);
    mockUploadVideo.mockImplementation(() => new Promise<string | null>(() => {}));
    mockHook.stage = 'processing';
    const { r } = setup();
    await pressAdd(r);
    await act(async () => { fireEvent.press(r.getByText(en.media.caption_skip)); });
    await act(async () => { fireEvent.press(r.getByTestId('uploading-tile-cancel')); });
    expect(mockCancelVideo).toHaveBeenCalled();
    expect(r.queryByTestId('uploading-tile')).toBeNull();
  });

  it('a failed video stays on the tile with Retry; Retry uploads again, X dismisses', async () => {
    pick.mockResolvedValue(pickedVideo);
    mockUploadVideo.mockResolvedValue(null);
    mockHook.outcome = 'failed';
    mockHook.error = 'network';
    const { r } = setup();
    await pressAdd(r);
    await act(async () => { fireEvent.press(r.getByText(en.media.caption_skip)); });

    expect(r.getByTestId('uploading-tile-retry')).toBeTruthy();
    await act(async () => { fireEvent.press(r.getByTestId('uploading-tile-retry')); });
    expect(mockUploadVideo).toHaveBeenCalledTimes(2);
    await act(async () => { fireEvent.press(r.getByTestId('uploading-tile-cancel')); });
    expect(r.queryByTestId('uploading-tile')).toBeNull();
  });

  it('a failed photo shows Retry on the tile', async () => {
    const { r, onAdd } = setup();
    onAdd.mockRejectedValueOnce(new Error('boom'));
    await pressAdd(r);
    await act(async () => { fireEvent.press(r.getByText(en.media.caption_skip)); });
    expect(r.getByTestId('uploading-tile-retry')).toBeTruthy();
    await act(async () => { fireEvent.press(r.getByTestId('uploading-tile-retry')); });
    await waitFor(() => expect(r.queryByTestId('uploading-tile')).toBeNull());
    expect(onAdd).toHaveBeenCalledTimes(2);
  });

  it('adding while an item uploads is blocked with a message (no second picker)', async () => {
    const onError = jest.fn();
    const onAdd = jest.fn(() => new Promise<void>(() => {}));
    const r = render(<PortfolioGrid assets={[]} isEditing onAdd={onAdd} onError={onError} />);
    await pressAdd(r);
    await act(async () => { fireEvent.press(r.getByText(en.media.caption_skip)); });
    pick.mockClear();
    await pressAdd(r);
    expect(pick).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(en.media.upload_in_progress);
  });

  it('closing the caption sheet with its X uploads nothing', async () => {
    const { r, onAdd } = setup();
    await pressAdd(r);
    await act(async () => { fireEvent.press(r.getByTestId('caption-close')); });
    expect(r.queryByText(en.media.caption_title)).toBeNull();
    expect(onAdd).not.toHaveBeenCalled();
    expect(r.queryByTestId('uploading-tile')).toBeNull();
  });

  it('the cancel X sits on the leading corner in RTL (left) and right in LTR', async () => {
    const { StyleSheet } = require('react-native');
    mockLang = 'he';
    const he = require('@core/i18n/translations/he.json');
    const { r, onAdd } = setup();
    onAdd.mockImplementation(() => new Promise<void>(() => {}));
    await act(async () => { fireEvent.press(r.getByText(he.profile_sections.add_media)); });
    await act(async () => { fireEvent.press(r.getByText(he.media.caption_skip)); });
    const x = StyleSheet.flatten(r.getByTestId('uploading-tile-cancel').props.style);
    expect(x.left).toBe(6);
    expect(x.right).toBeUndefined();
  });
});
