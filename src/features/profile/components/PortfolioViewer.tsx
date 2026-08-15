import { useRef, useState, useEffect, useCallback } from 'react';
import {
  View, FlatList, Modal, StyleSheet, Platform, Dimensions,
} from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, runOnJS,
} from 'react-native-reanimated';
import type { ViewToken } from 'react-native';
import type { MediaAsset } from '@core/types/media';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type ImageSlideProps = {
  asset: MediaAsset;
  onZoomChange: (zoomed: boolean) => void;
  onClose: () => void;
};

function ZoomableImageSlide({ asset, onZoomChange, onClose }: ImageSlideProps) {
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
      const maxX = (SCREEN_WIDTH * (scale.value - 1)) / 2;
      const maxY = (SCREEN_HEIGHT * (scale.value - 1)) / 2;
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
    <View style={slide.container}>
      <GestureDetector gesture={composed}>
        <Animated.Image
          source={{ uri: asset.url }}
          style={[slide.fill, imageStyle]}
          resizeMode="contain"
        />
      </GestureDetector>
    </View>
  );
}

// ── Video slides ──────────────────────────────────────────────────────────────

function NativeVideoSlide({ asset, isActive }: { asset: MediaAsset; isActive: boolean }) {
  const { VideoView, useVideoPlayer } = require('expo-video') as typeof import('expo-video');
  const player = useVideoPlayer(asset.url, (p: import('expo-video').VideoPlayer) => {
    p.loop = true;
  });

  useEffect(() => {
    if (isActive) player.play();
    else player.pause();
  }, [isActive, player]);

  return (
    <View style={slide.container}>
      <VideoView player={player} style={slide.fill} contentFit="contain" nativeControls />
    </View>
  );
}

function WebVideoSlide({ asset, isActive }: { asset: MediaAsset; isActive: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isActive) video.play().catch(() => {});
    else video.pause();
  }, [isActive]);

  return (
    <View style={[slide.container, { alignItems: 'center', justifyContent: 'center' }]}>
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

type SlideProps = {
  asset: MediaAsset;
  isActive: boolean;
  onZoomChange: (zoomed: boolean) => void;
  onClose: () => void;
};

function Slide({ asset, isActive, onZoomChange, onClose }: SlideProps) {
  if (asset.type === 'video') {
    return Platform.OS === 'web'
      ? <WebVideoSlide asset={asset} isActive={isActive} />
      : <NativeVideoSlide asset={asset} isActive={isActive} />;
  }
  return <ZoomableImageSlide asset={asset} onZoomChange={onZoomChange} onClose={onClose} />;
}

const slide = StyleSheet.create({
  container: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT, backgroundColor: '#000' },
  fill: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT },
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

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  const getItemLayout = (_: ArrayLike<MediaAsset> | null | undefined, index: number) => ({
    length: SCREEN_WIDTH,
    offset: SCREEN_WIDTH * index,
    index,
  });

  const renderItem = useCallback(
    ({ item, index }: { item: MediaAsset; index: number }) => (
      <Slide
        asset={item}
        isActive={index === activeIndex}
        onZoomChange={handleZoomChange}
        onClose={onClose}
      />
    ),
    [activeIndex, handleZoomChange, onClose],
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
            horizontal
            pagingEnabled
            scrollEnabled={scrollEnabled}
            showsHorizontalScrollIndicator={false}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            getItemLayout={getItemLayout}
            initialScrollIndex={initialIndex}
            maxToRenderPerBatch={3}
            windowSize={3}
          />

          {assets.length > 1 && (
            <View style={styles.dots} pointerEvents="none">
              {assets.map((_, i) => (
                <View key={i} style={[styles.dot, i === activeIndex && styles.dotActive]} />
              ))}
            </View>
          )}

          {/* RNGH TouchableOpacity — works correctly within GestureHandlerRootView */}
          <TouchableOpacity
            style={[styles.closeBtn, { top: Math.max(insets.top, 20) + 8 }]}
            onPress={onClose}
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
  dots: {
    position: 'absolute',
    bottom: 36,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
});
