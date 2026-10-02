import { useEffect, useState } from 'react';
import { Platform, View, TouchableOpacity, StyleSheet } from 'react-native';
import { Play } from 'lucide-react-native';
import type { ViewStyle } from 'react-native';

type Props = {
  uri: string;
  style?: ViewStyle;
  thumbnailOnly?: boolean;
  /** The thumbnail's own play icon (native). Off when the caller draws its own (the media grid). */
  playIcon?: boolean;
  /** Called with the video's frame size once it is known (e.g. to size a chat bubble). */
  onVideoSize?: (size: { width: number; height: number }) => void;
};

function reportSize(size: { width: number; height: number } | undefined, cb: Props['onVideoSize']) {
  if (cb && size && size.width > 0 && size.height > 0) cb({ width: size.width, height: size.height });
}

// ── Web: plain HTML5 video element ────────────────────────────────────────────

function WebVideoPlayer({ uri, style, thumbnailOnly, onVideoSize }: Props) {
  return (
    <View style={[styles.container, style]}>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        src={uri}
        controls={!thumbnailOnly}
        playsInline
        preload={thumbnailOnly ? 'metadata' : 'auto'}
        onLoadedMetadata={(e) => reportSize({ width: e.currentTarget.videoWidth, height: e.currentTarget.videoHeight }, onVideoSize)}
        style={{ width: '100%', height: '100%', display: 'block', backgroundColor: '#000', objectFit: thumbnailOnly ? 'cover' : 'contain' }}
      />
    </View>
  );
}

// ── Native: expo-video with play-button overlay ───────────────────────────────

function NativeVideoPlayer({ uri, style, thumbnailOnly, playIcon = true, onVideoSize }: Props) {
  // Import lazily so web bundles never pull in expo-video
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { VideoView, useVideoPlayer } = require('expo-video') as typeof import('expo-video');

  const [started, setStarted] = useState(false);
  const player = useVideoPlayer(uri, (p: import('expo-video').VideoPlayer) => {
    p.loop = false;
  });

  useEffect(() => {
    if (!onVideoSize) return;
    reportSize(player.videoTrack?.size, onVideoSize);
    const sub = player.addListener('videoTrackChange', ({ videoTrack }) => reportSize(videoTrack?.size, onVideoSize));
    return () => sub.remove();
    // onVideoSize is a fresh closure each render; the player is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  // iOS draws a crossed-out play icon in a video view that can't load its
  // video. A thumbnail keeps the view hidden until the video is ready, so
  // until then — and on an error — it is a plain black box.
  const [ready, setReady] = useState(player.status === 'readyToPlay');
  useEffect(() => {
    if (!thumbnailOnly) return;
    setReady(player.status === 'readyToPlay');
    const sub = player.addListener('statusChange', ({ status }) => setReady(status === 'readyToPlay'));
    return () => sub.remove();
  }, [player, thumbnailOnly]);

  return (
    <View style={[styles.container, style]}>
      <VideoView
        player={player}
        style={[StyleSheet.absoluteFill, thumbnailOnly ? { opacity: ready ? 1 : 0 } : null]}
        nativeControls={!thumbnailOnly && started}
        // A thumbnail fills its box, cropped like a photo; the full player shows it all.
        contentFit={thumbnailOnly ? 'cover' : 'contain'}
      />
      {!thumbnailOnly && !started && (
        <TouchableOpacity style={styles.overlay} onPress={() => { player.play(); setStarted(true); }} activeOpacity={0.8}>
          <View style={styles.playBtn}>
            <Play size={28} color="#fff" fill="#fff" />
          </View>
        </TouchableOpacity>
      )}
      {thumbnailOnly && playIcon && (
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.playBtn}>
            <Play size={28} color="#fff" fill="#fff" />
          </View>
        </View>
      )}
    </View>
  );
}

// ── Public export ─────────────────────────────────────────────────────────────

export function VideoPlayer(props: Props) {
  return Platform.OS === 'web'
    ? <WebVideoPlayer {...props} />
    : <NativeVideoPlayer {...props} />;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    borderRadius: 8,
    overflow: 'hidden',
    aspectRatio: 16 / 9,
    minHeight: 180,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  playBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
