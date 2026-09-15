import React from 'react';
import { FlatList, Modal, StyleSheet, Dimensions } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { PortfolioViewer } from '../PortfolioViewer';
import type { MediaAsset } from '@core/types/media';

/**
 * The portfolio lightbox is a VERTICAL pager, like Instagram: tapping an item opens
 * the viewer on that item and the user swipes up/down through the whole array
 * without closing it.
 *
 * Guarded here:
 *  - paging is vertical, one viewport height per item (getItemLayout must use
 *    height, not width, or every page settles mid-item)
 *  - it opens on the tapped index (initialScrollIndex + getItemLayout, no visible jump)
 *  - a "3 / 12" counter tracks the swipe, and is hidden when there is nothing to page
 *    through (ChatRoomScreen hands this component a 1-element array)
 *  - only the visible video plays — neighbours are paused, so no background audio
 *  - video slides carry NO swipe-down-to-dismiss: on a vertical pager that is the
 *    same motion as paging to the previous item, so paging owns it outright
 *  - every close path still calls onClose
 *
 * This is the first test that renders PortfolioViewer for real; the three call-site
 * test files all mock it out. expo-video, gesture-handler and reanimated have no
 * shared mocks in this repo, hence the local ones below.
 */

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const mockPlayers = new Map<string, { play: jest.Mock; pause: jest.Mock; loop: boolean }>();

jest.mock('expo-video', () => ({
  useVideoPlayer: (uri: string, setup?: (p: unknown) => void) => {
    if (!mockPlayers.has(uri)) {
      mockPlayers.set(uri, { play: jest.fn(), pause: jest.fn(), loop: false });
    }
    const player = mockPlayers.get(uri);
    setup?.(player);
    return player;
  },
  VideoView: 'VideoView',
}));

jest.mock('react-native-gesture-handler', () => {
  const RN = jest.requireActual('react-native');
  // Gesture builders are chainable and their callbacks never fire under RNTL —
  // the gestures themselves are exercised on-device, not here.
  const chain: unknown = new Proxy(function () {} as never, {
    get: () => () => chain,
    apply: () => chain,
  });
  const builder = () => chain;
  return {
    Gesture: {
      Pinch: builder, Tap: builder, Pan: builder,
      Simultaneous: builder, Exclusive: builder, Race: builder,
    },
    // Tagged so a test can assert which slides attach gestures at all
    GestureDetector: ({ children }: { children: React.ReactNode }) =>
      require('react').createElement(RN.View, { testID: 'gesture-detector' }, children),
    GestureHandlerRootView: RN.View,
    TouchableOpacity: RN.TouchableOpacity,
  };
});

jest.mock('react-native-reanimated', () => {
  const RN = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View: RN.View, Image: RN.Image },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withSpring: (v: unknown) => v,
    runOnJS: (fn: unknown) => fn,
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('lucide-react-native', () => ({ X: 'X' }));

jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));

const asset = (
  i: number,
  type: 'image' | 'video' = 'image',
  caption: string | null = null,
): MediaAsset => ({
  id: `a${i}`,
  url: `https://cdn/${i}.${type === 'video' ? 'mp4' : 'jpg'}`,
  type,
  thumbnailUrl: null,
  caption,
  uploadedAt: { seconds: 100 - i, nanoseconds: 0 },
});

const twelve = Array.from({ length: 12 }, (_, i) => asset(i));

const open = (assets: MediaAsset[], initialIndex = 0, onClose = jest.fn()) =>
  render(
    <PortfolioViewer assets={assets} initialIndex={initialIndex} visible onClose={onClose} />,
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockPlayers.clear();
});

it('pages vertically, one full viewport height per item', () => {
  const list = open(twelve).UNSAFE_getByType(FlatList).props;

  expect(list.horizontal).toBeFalsy();
  expect(list.pagingEnabled).toBe(true);
  expect(list.data).toBe(twelve);
  expect(list.keyExtractor(twelve[3])).toBe('a3');
});

it('opens on the tapped item without a visible jump', () => {
  const list = open(twelve, 7).UNSAFE_getByType(FlatList).props;

  expect(list.initialScrollIndex).toBe(7);
  // getItemLayout must measure the paging axis — height now, not width
  expect(list.getItemLayout(twelve, 7)).toEqual({
    length: SCREEN_HEIGHT,
    offset: SCREEN_HEIGHT * 7,
    index: 7,
  });
});

it('counts from the tapped item', () => {
  expect(open(twelve, 2).getByText('3 / 12')).toBeTruthy();
});

it('the counter follows the swipe', () => {
  const r = open(twelve, 2);
  const list = r.UNSAFE_getByType(FlatList).props;

  act(() => { list.onViewableItemsChanged({ viewableItems: [{ index: 4 }] }); });

  expect(r.getByText('5 / 12')).toBeTruthy();
  expect(r.queryByText('3 / 12')).toBeNull();
});

it('switches the counter only once the swipe has nearly settled', () => {
  const list = open(twelve).UNSAFE_getByType(FlatList).props;
  // Below 80% two neighbours both qualify mid-swipe and a passing video starts playing
  expect(list.viewabilityConfig.itemVisiblePercentThreshold).toBe(80);
});

it('hides the counter when there is nothing to page through', () => {
  // ChatRoomScreen taps a single chat bubble and synthesises a 1-element array
  expect(open([asset(0)]).queryByText('1 / 1')).toBeNull();
});

it('plays only the visible video and pauses the neighbours', () => {
  const assets = [asset(0, 'video'), asset(1, 'video'), asset(2, 'video')];
  const r = open(assets, 0);

  const first = mockPlayers.get(assets[0].url);
  const second = mockPlayers.get(assets[1].url);
  expect(first?.play).toHaveBeenCalled();
  expect(second?.play).not.toHaveBeenCalled();
  expect(second?.pause).toHaveBeenCalled();

  act(() => {
    r.UNSAFE_getByType(FlatList).props.onViewableItemsChanged({ viewableItems: [{ index: 1 }] });
  });

  expect(second?.play).toHaveBeenCalled();
  expect(first?.pause).toHaveBeenCalled();
});

it('video slides carry no gesture of their own, so paging owns the vertical swipe', () => {
  // Swipe-down-to-dismiss and "page to the previous item" are the same motion once
  // the pager is vertical. Paging wins; videos close via the button, back or tap.
  const videos = open([asset(0, 'video'), asset(1, 'video')], 0);
  expect(videos.queryAllByTestId('gesture-detector')).toHaveLength(0);

  // Images still attach their pinch/tap stack — that one does not fight the pager
  const images = open([asset(0), asset(1)], 0);
  expect(images.queryAllByTestId('gesture-detector').length).toBeGreaterThan(0);
});

it('loops the video so a short clip does not freeze on its last frame', () => {
  const clip = asset(0, 'video');
  open([clip, asset(1)], 0);
  expect(mockPlayers.get(clip.url)?.loop).toBe(true);
});

it('closes from the close button', () => {
  const onClose = jest.fn();
  const r = open(twelve, 0, onClose);

  fireEvent.press(r.getByLabelText('close'));

  expect(onClose).toHaveBeenCalled();
});

it('closes from the Android back button', () => {
  const onClose = jest.fn();
  const r = open(twelve, 0, onClose);

  act(() => { r.UNSAFE_getByType(Modal).props.onRequestClose(); });

  expect(onClose).toHaveBeenCalled();
});

it('shows the caption of the item the viewer opened on', () => {
  const shot = [asset(0, 'image', 'Golden hour, Tel Aviv rooftop'), asset(1)];
  expect(open(shot, 0).getByText('Golden hour, Tel Aviv rooftop')).toBeTruthy();
});

it('the caption follows the swipe', () => {
  const shot = [asset(0, 'image', 'First frame'), asset(1, 'image', 'Second frame')];
  const r = open(shot, 0);
  expect(r.getByText('First frame')).toBeTruthy();

  act(() => {
    r.UNSAFE_getByType(FlatList).props.onViewableItemsChanged({ viewableItems: [{ index: 1 }] });
  });

  expect(r.getByText('Second frame')).toBeTruthy();
  expect(r.queryByText('First frame')).toBeNull();
});

it('renders no caption bar for media that has none', () => {
  // The portfolio predates captions, so existing assets carry null
  expect(open([asset(0), asset(1)], 0).queryByTestId('viewer-caption')).toBeNull();
});

it('treats a whitespace-only caption as no caption', () => {
  // Otherwise the client gets an empty dark bar across the bottom of the slide
  expect(open([asset(0, 'image', '   \n  '), asset(1)], 0).queryByTestId('viewer-caption')).toBeNull();
});

it('lifts the caption above the video scrubber on video slides', () => {
  const onImage = open([asset(0, 'image', 'still'), asset(1)], 0);
  const onVideo = open([asset(0, 'video', 'clip'), asset(1)], 0);

  const imageBottom = StyleSheet.flatten(onImage.getByTestId('viewer-caption').props.style).bottom;
  const videoBottom = StyleSheet.flatten(onVideo.getByTestId('viewer-caption').props.style).bottom;

  // expo-video's nativeControls own the bottom of a video slide
  expect(videoBottom).toBeGreaterThan(imageBottom);
});

it('the counter sits opposite the close button on the same baseline', () => {
  const r = open(twelve, 0);
  const counter = StyleSheet.flatten(r.getByTestId('viewer-counter').props.style);
  const close = StyleSheet.flatten(r.getByLabelText('close').props.style);

  expect(counter.position).toBe('absolute');
  expect(counter.left).toBe(16);
  expect(close.right).toBe(16);
  expect(counter.top).toBe(close.top);
});
