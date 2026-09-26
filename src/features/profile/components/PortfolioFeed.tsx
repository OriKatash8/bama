import { useCallback, useRef, useState } from 'react';
import { FlatList, Modal, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { ViewToken } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { X } from 'lucide-react-native';
import { Gesture, GestureDetector, GestureHandlerRootView, TouchableOpacity } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { AppText } from '@components/ui/AppText';
import { useTheme } from '@core/hooks/useTheme';
import { useSettingsStore } from '@core/stores/settingsStore';
import { MEDIA_VIEWER_CHROME_BG, MEDIA_VIEWER_CHROME_FG } from '@core/constants/mediaViewer';
import { formatShortDay, isoDayFromSeconds } from '@utils/formatters';
import type { MediaAsset } from '@core/types/media';
import { NativeVideoSlide, WebVideoSlide, useModalInsets } from './mediaViewerParts';

/** Instagram's range: nothing taller than 4:5, nothing wider than 1.91:1. */
const MIN_ASPECT = 4 / 5;
const MAX_ASPECT = 1.91;
/**
 * Videos may be as tall as 9:16. Held to 4:5, a phone-shot vertical video was
 * letterboxed to about 70% of the width; at its own shape it fills the width.
 * Still `contain`, so nothing is cropped or stretched.
 */
const MIN_VIDEO_ASPECT = 9 / 16;
const TOP_BAR_HEIGHT = 56;
/** 60% of a post on screen: the one being looked at, not one scrolling past. */
const VIEWABILITY = { itemVisiblePercentThreshold: 60 };

/**
 * How tall a post's media is at this width. The media's own shape (width /
 * height), clamped to Instagram's range so one very tall photo cannot fill
 * several screens — a video may go taller, to 9:16. Square until the shape is
 * known — the media reports it on load.
 */
export function postMediaHeight(width: number, aspect: number | null, type: MediaAsset['type'] = 'image'): number {
  const min = type === 'video' ? MIN_VIDEO_ASPECT : MIN_ASPECT;
  const a = aspect ? Math.min(MAX_ASPECT, Math.max(min, aspect)) : 1;
  return width / a;
}

/**
 * A photo that can be pinched, like Instagram: it scales while held and springs
 * back on release. No double-tap, no pan, no tap-to-close — in a scrolling feed
 * those would all fight the scroll, and the X closes.
 */
function PinchablePhoto({ asset, width, height, onSize, onPinching }: {
  asset: MediaAsset;
  width: number;
  height: number;
  onSize: (w: number, h: number) => void;
  onPinching: (pinching: boolean) => void;
}) {
  const scale = useSharedValue(1);
  const pinch = Gesture.Pinch()
    .onStart(() => { runOnJS(onPinching)(true); })
    .onUpdate((e) => { scale.value = Math.max(1, Math.min(e.scale, 5)); })
    .onEnd(() => {
      scale.value = withSpring(1);
      runOnJS(onPinching)(false);
    });
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <GestureDetector gesture={pinch}>
      <Animated.View style={[{ width, height }, style]}>
        <Image
          source={{ uri: asset.url }}
          style={{ width, height }}
          contentFit="contain"
          cachePolicy="memory-disk"
          onLoad={(e) => onSize(e.source.width, e.source.height)}
        />
      </Animated.View>
    </GestureDetector>
  );
}

/** One post: the media, then its information — the whole caption and the date. */
function FeedPost({ asset, width, isActive, rtl, onPinching }: {
  asset: MediaAsset;
  width: number;
  isActive: boolean;
  rtl: boolean;
  onPinching: (pinching: boolean) => void;
}) {
  const colors = useTheme();
  const [aspect, setAspect] = useState<number | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const onSize = useCallback((w: number, h: number) => { if (w > 0 && h > 0) setAspect(w / h); }, []);
  const handlePinching = useCallback((p: boolean) => { setZoomed(p); onPinching(p); }, [onPinching]);
  const height = postMediaHeight(width, aspect, asset.type);
  const caption = asset.caption?.trim() || null;
  const align = rtl ? 'right' : 'left';

  return (
    // Raised while pinched, so the zoomed photo draws over the posts around it.
    <View testID={`feed-post-${asset.id}`} style={[styles.post, zoomed && styles.postZoomed]}>
      {asset.type === 'video' ? (
        Platform.OS === 'web'
          ? <WebVideoSlide asset={asset} isActive={isActive} width={width} height={height} onSize={onSize} />
          : <NativeVideoSlide asset={asset} isActive={isActive} width={width} height={height} onSize={onSize} />
      ) : (
        <PinchablePhoto asset={asset} width={width} height={height} onSize={onSize} onPinching={handlePinching} />
      )}
      {/* The information in its own white box, like the app's other cards, so it
          reads as belonging to the post above it. */}
      <View testID={`feed-info-${asset.id}`} style={styles.info}>
        {caption && (
          <AppText
            testID={`feed-caption-${asset.id}`}
            weight="regular"
            style={[styles.caption, { color: colors.text, textAlign: align }]}
          >
            {caption}
          </AppText>
        )}
        <AppText testID={`feed-date-${asset.id}`} weight="regular" style={[styles.date, { textAlign: align }]}>
          {formatShortDay(isoDayFromSeconds(asset.uploadedAt.seconds), rtl ? 'he' : 'en')}
        </AppText>
      </View>
    </View>
  );
}

type Props = {
  assets: MediaAsset[];
  initialIndex: number;
  visible: boolean;
  onClose: () => void;
};

/**
 * The portfolio's full-screen view: an Instagram-style feed. Photo/video, then its
 * information, then the next one, in one free vertical scroll — not a pager. It
 * opens on the item that was tapped, and a video plays only while it is on screen.
 *
 * Portfolio only. Chat media keeps PortfolioViewer, the one-per-page pager: chat
 * items carry no caption, so a feed there would be media with empty info blocks.
 */
export function PortfolioFeed({ assets, initialIndex, visible, onClose }: Props) {
  return (
    <Modal visible={visible} transparent={false} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {/* Mounted per opening, so the scroll position and the playing video start
          fresh every time rather than carrying over from the last visit. */}
      {visible && <FeedBody assets={assets} initialIndex={initialIndex} onClose={onClose} />}
    </Modal>
  );
}

function FeedBody({ assets, initialIndex, onClose }: Omit<Props, 'visible'>) {
  const insets = useModalInsets();
  const { width } = useWindowDimensions();
  const colors = useTheme();
  const rtl = useSettingsStore((s) => s.language) === 'he';
  const listRef = useRef<FlatList<MediaAsset>>(null);
  const openedRef = useRef(false);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  // The FIRST viewable video plays; every other video is paused. Stable (no
  // deps): FlatList does not accept a new onViewableItemsChanged after mount.
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const video = viewableItems.find((v) => v.isViewable && (v.item as MediaAsset).type === 'video');
    setActiveVideoId(video ? (video.item as MediaAsset).id : null);
  }, []);

  // Posts have no fixed height (each takes its media's shape), so there is no
  // getItemLayout and no initialScrollIndex: jump once the list has laid out,
  // with the target and a few posts after it already rendered.
  const openOnTapped = useCallback(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    if (initialIndex > 0) listRef.current?.scrollToIndex({ index: initialIndex, animated: false });
  }, [initialIndex]);

  const onPinching = useCallback((p: boolean) => setScrollEnabled(!p), []);

  return (
    <LinearGradient colors={colors.bgGradient} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.root}>
      <GestureHandlerRootView style={StyleSheet.absoluteFill}>
        <FlatList
          ref={listRef}
          data={assets}
          keyExtractor={(a) => a.id}
          renderItem={({ item }) => (
            <FeedPost asset={item} width={width} isActive={item.id === activeVideoId} rtl={rtl} onPinching={onPinching} />
          )}
          scrollEnabled={scrollEnabled}
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={VIEWABILITY}
          onLayout={openOnTapped}
          initialNumToRender={initialIndex + 4}
          onScrollToIndexFailed={({ index, averageItemLength }) => {
            listRef.current?.scrollToOffset({ offset: averageItemLength * index, animated: false });
            setTimeout(() => listRef.current?.scrollToIndex({ index, animated: false }), 50);
          }}
          // Posts above the one on screen change height as their media loads;
          // this keeps what the user is looking at from jumping.
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          contentContainerStyle={{ paddingTop: insets.top + TOP_BAR_HEIGHT, paddingBottom: insets.bottom + 16 }}
        />

        <View style={[styles.topBar, { top: insets.top, flexDirection: rtl ? 'row' : 'row-reverse' }]}>
          {/* RNGH TouchableOpacity, as in PortfolioViewer: it works inside
              GestureHandlerRootView, and already renders a button on web. */}
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            accessibilityLabel="close"
            hitSlop={{ top: 12, right: 20, bottom: 12, left: 20 }}
            activeOpacity={0.7}
          >
            <X size={18} color={MEDIA_VIEWER_CHROME_FG} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      </GestureHandlerRootView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  post: { marginBottom: 36 },
  postZoomed: { zIndex: 10 },
  info: {
    marginHorizontal: 12,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(30,79,163,0.07)',
  },
  caption: { fontSize: 17, lineHeight: 25 },
  date: { fontSize: 14, color: 'rgba(15,15,31,0.5)' },
  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: TOP_BAR_HEIGHT,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: MEDIA_VIEWER_CHROME_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
