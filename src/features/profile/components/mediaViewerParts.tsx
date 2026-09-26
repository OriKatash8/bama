import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets, initialWindowMetrics } from 'react-native-safe-area-context';
import en from '@core/i18n/translations/en.json';
import type { MediaAsset } from '@core/types/media';

/**
 * Pieces shared by the two full-screen media views: PortfolioViewer (the
 * one-per-page pager chat media opens) and PortfolioFeed (the portfolio's
 * Instagram-style scrolling feed).
 */

// Measured live rather than captured once at module load: PortfolioViewer pages
// vertically, so a stale viewport height would settle every page mid-item after
// any resize or rotation.
export type SlideSize = { width: number; height: number };

type VideoSlideProps = SlideSize & {
  asset: MediaAsset;
  isActive: boolean;
  /** The video's own pixel size, reported once it is known. */
  onSize?: (width: number, height: number) => void;
};

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
export function useModalInsets() {
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
export function makeT(translations: Translations) {
  return (key: string): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
}

// ── Video slides ──────────────────────────────────────────────────────────────

// No gesture of its own. Swipe-down-to-dismiss used to live here, but on a vertical
// pager that is the same motion as paging to the previous item — the two raced on
// every downward swipe. Paging owns it; the close button, Android back and the
// image slides' tap-to-close remain the ways out.
export function NativeVideoSlide({ asset, isActive, width, height, onSize }: VideoSlideProps) {
  const { VideoView, useVideoPlayer } = require('expo-video') as typeof import('expo-video');
  const player = useVideoPlayer(asset.url, (p: import('expo-video').VideoPlayer) => {
    p.loop = true;
  });

  useEffect(() => {
    if (isActive) player.play();
    else player.pause();
  }, [isActive, player]);

  // The video's own size, once known — the feed sizes its post from it.
  useEffect(() => {
    if (!onSize) return;
    const report = () => {
      const size = player.videoTrack?.size;
      if (size?.width && size?.height) onSize(size.width, size.height);
    };
    report();
    const sub = player.addListener?.('sourceLoad', report);
    return () => sub?.remove();
  }, [player, onSize]);

  return (
    <View testID={`viewer-slide-${asset.id}`} style={[slide.container, { width, height }]}>
      <VideoView player={player} style={{ width, height }} contentFit="contain" nativeControls />
    </View>
  );
}

export function WebVideoSlide({ asset, isActive, width, height, onSize }: VideoSlideProps) {
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
        onLoadedMetadata={(e) => {
          const v = e.currentTarget as HTMLVideoElement;
          if (v.videoWidth && v.videoHeight) onSize?.(v.videoWidth, v.videoHeight);
        }}
      />
    </View>
  );
}

const slide = StyleSheet.create({
  // Transparent on purpose: media is letterboxed by `contain`, and an opaque slide
  // would paint over the page gradient wherever the media does not reach.
  container: { backgroundColor: 'transparent' },
});
