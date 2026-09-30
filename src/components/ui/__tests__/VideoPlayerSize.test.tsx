import React from 'react';
import { render, act } from '@testing-library/react-native';
import { VideoPlayer } from '../VideoPlayer';

/** VideoPlayer reports the video's size once the player knows it (for chat bubbles). */

let mockTrackListener: ((e: { videoTrack: unknown }) => void) | undefined;
const mockRemove = jest.fn();
let mockInitialTrack: unknown = null;

jest.mock('expo-video', () => {
  const { View } = jest.requireActual('react-native');
  return {
    VideoView: (p: object) => <View {...p} />,
    useVideoPlayer: () => ({
      loop: false,
      videoTrack: mockInitialTrack,
      addListener: (name: string, fn: (e: { videoTrack: unknown }) => void) => {
        if (name === 'videoTrackChange') mockTrackListener = fn;
        return { remove: mockRemove };
      },
    }),
  };
});

beforeEach(() => { mockTrackListener = undefined; mockInitialTrack = null; jest.clearAllMocks(); });

it('reports the size when the video track arrives', () => {
  const onVideoSize = jest.fn();
  render(<VideoPlayer uri="https://x/v.mp4" thumbnailOnly onVideoSize={onVideoSize} />);
  act(() => mockTrackListener!({ videoTrack: { size: { width: 406, height: 720 } } }));
  expect(onVideoSize).toHaveBeenCalledWith({ width: 406, height: 720 });
});

it('reports a size the player already knows', () => {
  mockInitialTrack = { size: { width: 1280, height: 720 } };
  const onVideoSize = jest.fn();
  render(<VideoPlayer uri="https://x/v.mp4" thumbnailOnly onVideoSize={onVideoSize} />);
  expect(onVideoSize).toHaveBeenCalledWith({ width: 1280, height: 720 });
});

it('ignores a track with no size, and stops listening on unmount', () => {
  const onVideoSize = jest.fn();
  const r = render(<VideoPlayer uri="https://x/v.mp4" thumbnailOnly onVideoSize={onVideoSize} />);
  act(() => mockTrackListener!({ videoTrack: { size: { width: 0, height: 0 } } }));
  expect(onVideoSize).not.toHaveBeenCalled();
  r.unmount();
  expect(mockRemove).toHaveBeenCalled();
});

it('a thumbnail fills its box (cropped, like a photo); the full player letterboxes', () => {
  const thumb = render(<VideoPlayer uri="https://x/v.mp4" thumbnailOnly />);
  expect(thumb.UNSAFE_getByProps({ contentFit: 'cover' })).toBeTruthy();
  const full = render(<VideoPlayer uri="https://x/v.mp4" />);
  expect(full.UNSAFE_getByProps({ contentFit: 'contain' })).toBeTruthy();
});
