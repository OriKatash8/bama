import React from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { PortfolioFeed, postMediaHeight } from '../PortfolioFeed';
import { ThemeProvider } from '@core/hooks/useTheme';
import type { MediaAsset } from '@core/types/media';

/**
 * The portfolio's full-screen view is an Instagram-style FEED: photo/video, then
 * its information (the whole caption and the date), then the next one, in one
 * free vertical scroll. It opens on the item that was tapped, and a video plays
 * only while it is on screen — exactly one at a time.
 *
 * Chat media keeps the one-per-page PortfolioViewer (PortfolioViewer.test.tsx).
 */

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

// RN's Modal renders outside the SafeAreaProvider on iOS, so useSafeAreaInsets()
// reports zeros in there. Mocked that way on purpose — it is the real modal case.
let mockWindowMetrics: { insets: { top: number; bottom: number } } | null = null;
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  get initialWindowMetrics() { return mockWindowMetrics; },
}));

jest.mock('lucide-react-native', () => ({ X: 'X' }));
let mockLanguage = 'en';
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLanguage }),
}));
jest.mock('expo-image', () => {
  const RN = jest.requireActual('react-native');
  return { Image: (p: Record<string, unknown>) => require('react').createElement(RN.View, { testID: p.testID }) };
});

const day = (y: number, m: number, d: number) => ({ seconds: new Date(y, m - 1, d, 12).getTime() / 1000, nanoseconds: 0 });
const LONG = 'A long caption that goes on and on. '.repeat(12).trim();
const asset = (id: string, type: 'image' | 'video', caption: string | null, uploadedAt = day(2026, 10, 12)): MediaAsset =>
  ({ id, url: `https://x/${id}`, type, thumbnailUrl: null, caption, uploadedAt: uploadedAt as MediaAsset['uploadedAt'] });
const ASSETS = [
  asset('p1', 'image', 'First photo'),
  asset('v1', 'video', LONG),
  asset('p2', 'image', null, day(2025, 3, 4)),
  asset('v2', 'video', 'Second video'),
];

function renderFeed(props: Partial<React.ComponentProps<typeof PortfolioFeed>> = {}) {
  const onClose = jest.fn();
  const r = render(
    <ThemeProvider>
      <PortfolioFeed assets={ASSETS} initialIndex={0} visible onClose={onClose} {...props} />
    </ThemeProvider>,
  );
  return { ...r, onClose, list: r.UNSAFE_getByType(FlatList) };
}
const viewable = (list: ReturnType<typeof renderFeed>['list'], ...ids: string[]) =>
  act(() => {
    list.props.onViewableItemsChanged({
      viewableItems: ids.map((id) => ({ item: ASSETS.find((a) => a.id === id), index: ASSETS.findIndex((a) => a.id === id), isViewable: true, key: id })),
      changed: [],
    });
  });

beforeEach(() => { mockPlayers.clear(); mockLanguage = 'en'; });

describe('postMediaHeight', () => {
  it('follows the media\'s own shape', () => {
    expect(postMediaHeight(400, 1)).toBe(400);
    expect(postMediaHeight(400, 4 / 3)).toBe(300);
  });
  it('clamps a very tall item to 4:5 and a very wide one to 1.91:1', () => {
    expect(postMediaHeight(400, 9 / 16)).toBe(500);
    expect(postMediaHeight(400, 3)).toBeCloseTo(400 / 1.91);
  });
  it('a vertical VIDEO keeps its full 9:16 shape, so it fills the width', () => {
    expect(postMediaHeight(400, 9 / 16, 'video')).toBeCloseTo(400 * 16 / 9);
    // A photo of the same shape is still held to 4:5.
    expect(postMediaHeight(400, 9 / 16, 'image')).toBe(500);
    // Nothing taller than 9:16 even for a video.
    expect(postMediaHeight(400, 1 / 3, 'video')).toBeCloseTo(400 * 16 / 9);
  });

  it('is square while the shape is unknown', () => {
    expect(postMediaHeight(400, null)).toBe(400);
  });
});

describe('the feed', () => {
  it('is a free scroll, not a pager, with every item as a post in order', () => {
    const { list, getAllByTestId } = renderFeed();
    expect(list.props.pagingEnabled).toBeFalsy();
    expect(list.props.horizontal).toBeFalsy();
    expect(getAllByTestId(/^feed-post-/).map((n) => n.props.testID))
      .toEqual(['feed-post-p1', 'feed-post-v1', 'feed-post-p2', 'feed-post-v2']);
  });

  it('shows the whole caption under the media, never cut', () => {
    const { getByTestId } = renderFeed();
    const caption = getByTestId('feed-caption-v1');
    expect(caption.props.children).toBe(LONG);
    expect(caption.props.numberOfLines).toBeUndefined();
  });

  it('shows the date, with the year only when it is not this year', () => {
    const { getByTestId } = renderFeed();
    const thisYear = new Date().getFullYear();
    expect(getByTestId('feed-date-p1').props.children).toBe(thisYear === 2026 ? 'Oct 12' : 'Oct 12, 2026');
    expect(getByTestId('feed-date-p2').props.children).toBe('Mar 4, 2025');
  });

  it('posts are well apart, and the information sits in its own box, in larger type', () => {
    const { getByTestId } = renderFeed();
    expect(StyleSheet.flatten(getByTestId('feed-post-p1').props.style).marginBottom).toBeGreaterThanOrEqual(32);

    const box = StyleSheet.flatten(getByTestId('feed-info-p1').props.style);
    expect(box.backgroundColor).toBe('#ffffff');
    expect(box.borderRadius).toBeGreaterThanOrEqual(14);
    expect(box.marginHorizontal).toBeGreaterThan(0);

    expect(StyleSheet.flatten(getByTestId('feed-caption-p1').props.style).fontSize).toBeGreaterThanOrEqual(17);
    expect(StyleSheet.flatten(getByTestId('feed-date-p1').props.style).fontSize).toBeGreaterThanOrEqual(14);
  });

  it('an item without a caption shows only its date', () => {
    const { queryByTestId, getByTestId } = renderFeed();
    expect(queryByTestId('feed-caption-p2')).toBeNull();
    expect(getByTestId('feed-date-p2')).toBeTruthy();
  });

  it('follows the language direction in the information block', () => {
    mockLanguage = 'he';
    const { getByTestId } = renderFeed();
    expect(StyleSheet.flatten(getByTestId('feed-caption-p1').props.style).textAlign).toBe('right');
  });

  it('opens on the tapped item', () => {
    const spy = jest.spyOn(FlatList.prototype, 'scrollToIndex').mockImplementation(() => {});
    const { list } = renderFeed({ initialIndex: 2 });
    fireEvent(list, 'layout', { nativeEvent: { layout: { width: 400, height: 800 } } });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ index: 2, animated: false }));
    spy.mockRestore();
  });

  it('photos can be pinched: they sit in a gesture detector', () => {
    const { getByTestId } = renderFeed();
    expect(getByTestId('feed-post-p1').findAllByProps({ testID: 'gesture-detector' }).length).toBeGreaterThan(0);
  });

  it('the X closes', () => {
    const { getByLabelText, onClose } = renderFeed();
    fireEvent.press(getByLabelText('close'));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('videos play only while on screen', () => {
  it('plays the video that is on screen and nothing else', () => {
    const { list } = renderFeed();
    viewable(list, 'v1');
    expect(mockPlayers.get('https://x/v1')!.play).toHaveBeenCalled();
    expect(mockPlayers.get('https://x/v2')!.play).not.toHaveBeenCalled();
  });

  it('pauses it when it scrolls away and plays the next one that comes in', () => {
    const { list } = renderFeed();
    viewable(list, 'v1');
    const v1 = mockPlayers.get('https://x/v1')!;
    v1.pause.mockClear();

    viewable(list, 'p2', 'v2');

    expect(v1.pause).toHaveBeenCalled();
    expect(mockPlayers.get('https://x/v2')!.play).toHaveBeenCalled();
  });

  it('plays nothing while only photos are on screen', () => {
    const { list } = renderFeed();
    viewable(list, 'p1');
    for (const p of mockPlayers.values()) expect(p.play).not.toHaveBeenCalled();
  });

  it('with two videos on screen, only the first plays', () => {
    const { list } = renderFeed();
    viewable(list, 'v1', 'v2');
    expect(mockPlayers.get('https://x/v1')!.play).toHaveBeenCalled();
    expect(mockPlayers.get('https://x/v2')!.play).not.toHaveBeenCalled();
  });
});
