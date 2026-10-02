import React from 'react';
import { render, act } from '@testing-library/react-native';
import { VideoPlayer } from '../VideoPlayer';

/** VideoPlayer reports the video's size once the player knows it (for chat bubbles). */

let mockTrackListener: ((e: { videoTrack: unknown }) => void) | undefined;
const mockRemove = jest.fn();
let mockInitialTrack: unknown = null;
let mockStatus = 'loading';
let mockStatusListener: ((e: { status: string }) => void) | undefined;

jest.mock('expo-video', () => {
  const { View } = jest.requireActual('react-native');
  return {
    VideoView: (p: object) => <View {...p} />,
    // One player per mount, like the real hook (a fresh object each render
    // would re-run every effect keyed on it).
    useVideoPlayer: () => jest.requireActual('react').useRef({
      loop: false,
      videoTrack: mockInitialTrack,
      status: mockStatus,
      addListener: (name: string, fn: (e: never) => void) => {
        if (name === 'videoTrackChange') mockTrackListener = fn as typeof mockTrackListener;
        if (name === 'statusChange') mockStatusListener = fn as typeof mockStatusListener;
        return { remove: mockRemove };
      },
    }).current,
  };
});

beforeEach(() => { mockTrackListener = undefined; mockStatusListener = undefined; mockInitialTrack = null; mockStatus = 'loading'; jest.clearAllMocks(); });

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

describe('the thumbnail\'s own play icon', () => {
  const { Play } = jest.requireActual('lucide-react-native');

  it('shows by default (chat bubbles rely on it)', () => {
    const r = render(<VideoPlayer uri="https://x/v.mp4" thumbnailOnly />);
    expect(r.UNSAFE_queryAllByType(Play)).toHaveLength(1);
  });

  it('can be turned off when the caller draws its own (the media grid)', () => {
    const r = render(<VideoPlayer uri="https://x/v.mp4" thumbnailOnly playIcon={false} />);
    expect(r.UNSAFE_queryAllByType(Play)).toHaveLength(0);
  });
});

describe('a thumbnail never shows the native player\'s own marks', () => {
  // iOS draws a crossed-out play icon in a video view that can't load its video.
  // A thumbnail keeps the view hidden until the video is ready: until then, and
  // on an error, it is a plain black box.
  const { StyleSheet } = jest.requireActual('react-native');
  const videoOpacity = (r: ReturnType<typeof render>) =>
    StyleSheet.flatten(r.UNSAFE_getByProps({ contentFit: 'cover' }).props.style).opacity;

  it('hidden while loading, shown once ready', () => {
    const r = render(<VideoPlayer uri="https://x/v.mp4" thumbnailOnly />);
    expect(videoOpacity(r)).toBe(0);
    act(() => mockStatusListener!({ status: 'readyToPlay' }));
    expect(videoOpacity(r)).toBe(1);
  });

  it('stays hidden when the video fails to load', () => {
    const r = render(<VideoPlayer uri="https://x/v.mp4" thumbnailOnly />);
    act(() => mockStatusListener!({ status: 'error' }));
    expect(videoOpacity(r)).toBe(0);
  });

  it('shown at once when the player is already ready', () => {
    mockStatus = 'readyToPlay';
    expect(videoOpacity(render(<VideoPlayer uri="https://x/v.mp4" thumbnailOnly />))).toBe(1);
  });

  it('the full player is never hidden', () => {
    const full = render(<VideoPlayer uri="https://x/v.mp4" />);
    expect(StyleSheet.flatten(full.UNSAFE_getByProps({ contentFit: 'contain' }).props.style).opacity).toBeUndefined();
  });
});
