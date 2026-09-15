import { useRef, useState, useEffect, useCallback } from 'react';
import {
  View, FlatList, Modal, StyleSheet, Platform, useWindowDimensions,
} from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, runOnJS,
} from 'react-native-reanimated';
import type { ViewToken } from 'react-native';
import { AppText } from '@components/ui/AppText';
import type { MediaAsset } from '@core/types/media';

// Slide size is measured live rather than captured once at module load: the pager
// is vertical, so a stale viewport height would settle every page mid-item after
// any resize or rotation.
type SlideSize = { width: number; height: number };

// Rough height of expo-video's nativeControls bar; the caption clears it on video
// slides so the scrubber stays reachable.
const VIDEO_CONTROLS_HEIGHT = 64;

type ImageSlideProps = SlideSize & {
  asset: MediaAsset;
  onZoomChange: (zoomed: boolean) => void;
  onClose: () => void;
};

function ZoomableImageSlide({ asset, width, height, onZoomChange, onClose }: ImageSlideProps) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const [isZoomed, setIsZoomed] = useState(false);

  const onZoom = useCallback((zoomed: boolean) => {
    setIsZoomed(zoomed);
    onZoomChange(zoomed);
  }, [onZoomChange]);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(1, Math.min(savedScale.value * e.scale, 5));
    })
    .onEnd(() => {
      if (scale.value < 1.1) {
        scale.value = withSpring(1);
        savedScale.value = 1;
        tx.value = withSpring(0);
        ty.value = withSpring(0);
        savedTx.value = 0;
        savedTy.value = 0;
        runOnJS(onZoom)(false);
      } else {
        savedScale.value = scale.value;
        runOnJS(onZoom)(true);
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(250)
    .onEnd(() => {
      if (savedScale.value > 1) {
        scale.value = withSpring(1);
        savedScale.value = 1;
        tx.value = withSpring(0);
        ty.value = withSpring(0);
        savedTx.value = 0;
        savedTy.value = 0;
        runOnJS(onZoom)(false);
      } else {
        scale.value = withSpring(2.5);
        savedScale.value = 2.5;
        runOnJS(onZoom)(true);
      }
    });

  // Single tap closes when not zoomed. requireExternalGestureToFail ensures
  // it waits for doubleTap to time out before firing (~300ms delay).
  const singleTap = Gesture.Tap()
    .maxDuration(500)
    .onEnd((_e, success) => {
      if (success && savedScale.value <= 1) {
        runOnJS(onClose)();
      }
    });
  singleTap.requireExternalGestureToFail(doubleTap);

  // Only active when zoomed — pans the image within bounds
  const panZoomed = Gesture.Pan()
    .enabled(isZoomed)
    .onUpdate((e) => {
      const maxX = (width * (scale.value - 1)) / 2;
      const maxY = (height * (scale.value - 1)) / 2;
      tx.value = Math.max(-maxX, Math.min(maxX, savedTx.value + e.translationX));
      ty.value = Math.max(-maxY, Math.min(maxY, savedTy.value + e.translationY));
    })
    .onEnd(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });

  // Exclusive: singleTap/doubleTap/panZoomed compete — only one wins per touch.
  // Simultaneous with pinch so two-finger actions still work.
  const composed = Gesture.Simultaneous(
    pinch,
    Gesture.Exclusive(singleTap, doubleTap, panZoomed),
  );

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  return (
    <View style={[slide.container, { width, height }]}>
      <GestureDetector gesture={composed}>
        <Animated.Image
          source={{ uri: asset.url }}
          style={[{ width, height }, imageStyle]}
          resizeMode="contain"
        />
      </GestureDetector>
    </View>
  );
}

// ── Video slides ──────────────────────────────────────────────────────────────

// No gesture of its own. Swipe-down-to-dismiss used to live here, but on a vertical
// pager that is the same motion as paging to the previous item — the two raced on
// every downward swipe. Paging owns it; the close button, Android back and the
// image slides' tap-to-close remain the ways out.
function NativeVideoSlide({ asset, isActive, width, height }: SlideSize & { asset: MediaAsset; isActive: boolean }) {
  const { VideoView, useVideoPlayer } = require('expo-video') as typeof import('expo-video');
  const player = useVideoPlayer(asset.url, (p: import('expo-video').VideoPlayer) => {
    p.loop = true;
  });

  useEffect(() => {
    if (isActive) player.play();
    else player.pause();
  }, [isActive, player]);

  return (
    <View style={[slide.container, { width, height }]}>
      <VideoView player={player} style={{ width, height }} contentFit="contain" nativeControls />
    </View>
  );
}

function WebVideoSlide({ asset, isActive, width, height }: SlideSize & { asset: MediaAsset; isActive: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isActive) video.play().catch(() => {});
    else video.pause();
  }, [isActive]);

  return (
    <View style={[slide.container, { width, height, alignItems: 'center', justifyContent: 'center' }]}>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        src={asset.url}
        style={{ maxWidth: '100%', maxHeight: '100%' } as React.CSSProperties}
        controls
        playsInline
        loop
      />
    </View>
  );
}

// ── Slide dispatcher ──────────────────────────────────────────────────────────

type SlideProps = SlideSize & {
  asset: MediaAsset;
  isActive: boolean;
  onZoomChange: (zoomed: boolean) => void;
  onClose: () => void;
};

function Slide({ asset, isActive, width, height, onZoomChange, onClose }: SlideProps) {
  if (asset.type === 'video') {
    return Platform.OS === 'web'
      ? <WebVideoSlide asset={asset} isActive={isActive} width={width} height={height} />
      : <NativeVideoSlide asset={asset} isActive={isActive} width={width} height={height} />;
  }
  return (
    <ZoomableImageSlide
      asset={asset}
      width={width}
      height={height}
      onZoomChange={onZoomChange}
      onClose={onClose}
    />
  );
}

const slide = StyleSheet.create({
  container: { backgroundColor: '#000' },
});

// ── Viewer ────────────────────────────────────────────────────────────────────

type Props = {
  assets: MediaAsset[];
  initialIndex: number;
  visible: boolean;
  onClose: () => void;
};

export function PortfolioViewer({ assets, initialIndex, visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const flatListRef = useRef<FlatList<MediaAsset>>(null);

  useEffect(() => {
    if (!visible) return;
    setActiveIndex(initialIndex);
    setScrollEnabled(true);
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToIndex({ index: initialIndex, animated: false });
    });
  }, [visible, initialIndex]);

  const handleZoomChange = useCallback((zoomed: boolean) => {
    setScrollEnabled(!zoomed);
  }, []);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems[0]) setActiveIndex(viewableItems[0].index ?? 0);
  }).current;

  // 80, not 50: below ~80% two neighbours both qualify mid-swipe, so a video the
  // user is only swiping past would start playing before the page settles.
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;

  // Vertical pager: the paging axis is height, so that is what the layout measures.
  const getItemLayout = useCallback(
    (_: ArrayLike<MediaAsset> | null | undefined, index: number) => ({
      length: height,
      offset: height * index,
      index,
    }),
    [height],
  );

  const activeAsset = assets[activeIndex];
  const activeCaption = activeAsset?.caption?.trim() || null;
  const activeIsVideo = activeAsset?.type === 'video';

  const renderItem = useCallback(
    ({ item, index }: { item: MediaAsset; index: number }) => (
      <Slide
        asset={item}
        isActive={index === activeIndex}
        width={width}
        height={height}
        onZoomChange={handleZoomChange}
        onClose={onClose}
      />
    ),
    [activeIndex, width, height, handleZoomChange, onClose],
  );

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <GestureHandlerRootView style={StyleSheet.absoluteFill}>
          <FlatList
            ref={flatListRef}
            data={assets}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            pagingEnabled
            scrollEnabled={scrollEnabled}
            showsVerticalScrollIndicator={false}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            getItemLayout={getItemLayout}
            initialScrollIndex={initialIndex}
            maxToRenderPerBatch={3}
            windowSize={3}
          />

          {/* What the professional wrote about this piece, for the client viewing it.
              One overlay driven by activeIndex rather than one per slide, so it can
              clear expo-video's nativeControls on video slides. */}
          {activeCaption && (
            <View
              testID="viewer-caption"
              style={[
                styles.caption,
                { bottom: Math.max(insets.bottom, 16) + (activeIsVideo ? VIDEO_CONTROLS_HEIGHT : 0) },
              ]}
              pointerEvents="none"
            >
              <AppText weight="regular" style={styles.captionText}>{activeCaption}</AppText>
            </View>
          )}

          {/* Counter, not dots: one View per asset stops scaling past a dozen items.
              Hidden for a single asset — ChatRoomScreen passes a 1-element array. */}
          {assets.length > 1 && (
            <View
              testID="viewer-counter"
              style={[styles.counter, { top: Math.max(insets.top, 20) + 8 }]}
              pointerEvents="none"
            >
              <AppText weight="semiBold" style={styles.counterText}>
                {`${activeIndex + 1} / ${assets.length}`}
              </AppText>
            </View>
          )}

          {/* RNGH TouchableOpacity — works correctly within GestureHandlerRootView */}
          <TouchableOpacity
            style={[styles.closeBtn, { top: Math.max(insets.top, 20) + 8 }]}
            onPress={onClose}
            // Label only, no accessibilityRole: RNGH's TouchableOpacity already
            // renders a <button> on web, and a role here nests a second one inside it.
            accessibilityLabel="close"
            hitSlop={{ top: 20, right: 20, bottom: 20, left: 20 }}
            activeOpacity={0.7}
          >
            <X size={26} color="#fff" strokeWidth={2.5} />
          </TouchableOpacity>
        </GestureHandlerRootView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  closeBtn: {
    position: 'absolute',
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  // Mirrors closeBtn on the opposite edge, same baseline, so the two read as a pair.
  // Left-anchored in both languages: the glyphs are digits and the layout is forced
  // LTR app-wide (src/app/_layout.tsx calls I18nManager.allowRTL(false)).
  counter: {
    position: 'absolute',
    left: 16,
    height: 48,
    minWidth: 48,
    paddingHorizontal: 14,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  counterText: {
    color: '#fff',
    fontSize: 15,
  },
  caption: {
    position: 'absolute',
    left: 16,
    right: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  captionText: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 21,
  },
});
