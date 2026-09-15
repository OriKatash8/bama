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
  VideoExportPreset: { H264_1280x720: 'H264_1280x720' },
}));
jest.mock('expo-video', () => ({
  useVideoPlayer: () => ({ play: jest.fn(), pause: jest.fn(), muted: false }),
  VideoView: 'VideoView',
}));
jest.mock('../PortfolioViewer', () => ({ PortfolioViewer: () => null }));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { id: string } }) => unknown) => s({ user: { id: 'u1' } }),
}));
let mockLang: 'he' | 'en' = 'en';
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLang }),
}));
const mockUploadVideo = jest.fn();
jest.mock('@core/hooks/useVideoUpload', () => ({
  useVideoUpload: () => ({
    uploading: false, processing: false, uploadVideo: mockUploadVideo,
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
    'file:///tmp/shot.jpg', 'Golden hour, Tel Aviv rooftop',
  ));
});

it('Skip still uploads, and discards anything already typed', async () => {
  const { r, onAdd } = setup();
  await pressAdd(r);

  // Type first: Skip must mean "no caption", not "save what I half-wrote"
  fireEvent.changeText(r.getByTestId('caption-input'), 'half a thought');
  await act(async () => { fireEvent.press(r.getByText(en.media.caption_skip)); });

  await waitFor(() => expect(onAdd).toHaveBeenCalledWith('file:///tmp/shot.jpg', null));
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
