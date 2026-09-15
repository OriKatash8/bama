import { useRef, useState, useEffect, useCallback } from 'react';
import {
  View, FlatList, Modal, StyleSheet, Platform, useWindowDimensions,
} from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { X, Info as InfoIcon } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets, initialWindowMetrics } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, runOnJS,
} from 'react-native-reanimated';
import type { ViewToken } from 'react-native';
import { AppText } from '@components/ui/AppText';
import { useSettingsStore } from '@core/stores/settingsStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import { useTheme } from '@core/hooks/useTheme';
import {
  MEDIA_VIEWER_CHROME_BG, MEDIA_VIEWER_CHROME_FG,
  MEDIA_VIEWER_LABEL_FG, MEDIA_VIEWER_BOTTOM_SCRIM,
} from '@core/constants/mediaViewer';
import type { MediaAsset } from '@core/types/media';

// Slide size is measured live rather than captured once at module load: the pager
// is vertical, so a stale viewport height would settle every page mid-item after
// any resize or rotation.
type SlideSize = { width: number; height: number };

// Rough height of expo-video's nativeControls bar; the caption clears it on video
// slides so the scrubber stays reachable.
const VIDEO_CONTROLS_HEIGHT = 64;

const TOP_BAR_HEIGHT = 56;

/**
 * Safe-area insets inside a React Native `Modal`.
 *
 * `useSafeAreaInsets()` reports zeros in here on iOS: the modal is presented
 * outside the app's SafeAreaProvider, so there is nothing to measure against.
 * Trusting it put the close button underneath the notch, and since videos have no
 * dismiss gesture that left no way out of the viewer at all.
 *
 * `initialWindowMetrics` is captured natively at startup and stays correct inside a
 * modal, so it is the real source. The floors are the last resort if both are
 * missing — enough to clear a status bar and most of a notch.
 */
function useModalInsets() {
  const insets = useSafeAreaInsets();
  const fallback = initialWindowMetrics?.insets;
  return {
    top: Math.max(insets.top, fallback?.top ?? 0, 44),
    bottom: Math.max(insets.bottom, fallback?.bottom ?? 0, 20),
  };
}

// Same shape as PortfolioGrid's and ChatMediaSection's — the local-t convention
// these components use instead of the react-i18next hook.
type Translations = typeof en;
function makeT(translations: Translations) {
  return (key: string): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
}

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
    <View testID={`viewer-slide-${asset.id}`} style={[slide.container, { width, height }]}>
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
    <View testID={`viewer-slide-${asset.id}`} style={[slide.container, { width, height }]}>
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
    <View
      testID={`viewer-slide-${asset.id}`}
      style={[slide.container, { width, height, alignItems: 'center', justifyContent: 'center' }]}
    >
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
  // Transparent on purpose: media is letterboxed by `contain`, and an opaque slide
  // would paint over the page gradient wherever the photo does not reach.
  container: { backgroundColor: 'transparent' },
});

// ── Viewer ────────────────────────────────────────────────────────────────────

type Props = {
  assets: MediaAsset[];
  initialIndex: number;
  visible: boolean;
  onClose: () => void;
};

export function PortfolioViewer({ assets, initialIndex, visible, onClose }: Props) {
  const insets = useModalInsets();
  const { width, height } = useWindowDimensions();
  const colors = useTheme();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  // The app forces LTR layout (src/app/_layout.tsx calls I18nManager.allowRTL(false)),
  // so rows never flip on their own — every screen drives direction off the language.
  const rtl = language === 'he';
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
      {/* Same gradient Screen paints on every page, so the lightbox reads as part
          of the profile rather than a black void dropped over it. */}
      <LinearGradient
        testID="viewer-root"
        colors={colors.bgGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.root}
      >
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

          {/* Caption band. Overlaid on the media rather than displacing it: the band
              disappears for captionless items, and a media area that changed height
              per item would break pagingEnabled's fixed getItemLayout.
              A gradient, not a flat panel — a flat wash vanishes on a dark photo and
              cannot carry white text on a bright one. */}
          {activeCaption && (
            <LinearGradient
              testID="viewer-caption"
              colors={MEDIA_VIEWER_BOTTOM_SCRIM}
              style={[
                styles.caption,
                {
                  paddingBottom: insets.bottom + (activeIsVideo ? VIDEO_CONTROLS_HEIGHT : 0),
                },
              ]}
              pointerEvents="none"
            >
              <View style={[styles.captionTypeRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                <InfoIcon size={13} color={MEDIA_VIEWER_LABEL_FG} strokeWidth={2} />
                <AppText weight="regular" style={styles.captionType}>
                  {t('media.info_label')}
                </AppText>
              </View>
              <AppText
                testID="viewer-caption-text"
                weight="regular"
                numberOfLines={3}
                ellipsizeMode="tail"
                style={[styles.captionText, { textAlign: rtl ? 'right' : 'left' }]}
              >
                {activeCaption}
              </AppText>
            </LinearGradient>
          )}

          {/* Top bar. Its children sit in normal flow on purpose: an absolutely
              positioned close button resolves against RNGH's zero-height web wrapper
              and lands off-screen, which made the viewer undismissable on web.
              No scrim behind it — the pills carry their own ground. */}
          <View
            testID="viewer-topbar"
            style={[
              styles.topBar,
              { top: insets.top, flexDirection: rtl ? 'row-reverse' : 'row' },
            ]}
          >
            {/* Counter first, so it takes the leading edge in both directions.
                Hidden for a single asset — ChatRoomScreen passes a 1-element array. */}
            {assets.length > 1 ? (
              <View testID="viewer-counter" style={styles.counter} pointerEvents="none">
                <AppText weight="semiBold" style={styles.counterText}>
                  {`${activeIndex + 1} / ${assets.length}`}
                </AppText>
              </View>
            ) : <View />}

            {/* RNGH TouchableOpacity — works correctly within GestureHandlerRootView.
                Label only, no accessibilityRole: it already renders a <button> on web
                and a role here nests a second one inside it. */}
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              accessibilityLabel="close"
              // Vertical slop matches the slack inside the 56px bar exactly: touches
              // beyond a parent's bounds are dropped, so a larger value would be a
              // silent no-op. Gives a 56x72 target around a 32px circle.
              hitSlop={{ top: 12, right: 20, bottom: 12, left: 20 }}
              activeOpacity={0.7}
            >
              <X size={18} color={MEDIA_VIEWER_CHROME_FG} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
        </GestureHandlerRootView>
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: TOP_BAR_HEIGHT,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  counter: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: MEDIA_VIEWER_CHROME_BG,
  },
  counterText: { color: MEDIA_VIEWER_CHROME_FG, fontSize: 13 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: MEDIA_VIEWER_CHROME_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },

  caption: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 48,
    paddingHorizontal: 16,
  },
  captionTypeRow: { alignItems: 'center', gap: 5, marginBottom: 4 },
  captionType: { color: MEDIA_VIEWER_LABEL_FG, fontSize: 12 },
  captionText: {
    color: MEDIA_VIEWER_CHROME_FG,
    fontSize: 15,
    lineHeight: 22.5,
  },
});
