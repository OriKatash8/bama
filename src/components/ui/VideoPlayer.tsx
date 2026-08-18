import { useState } from 'react';
import { Platform, View, TouchableOpacity, StyleSheet } from 'react-native';
import { Play } from 'lucide-react-native';
import type { ViewStyle } from 'react-native';

type Props = {
  uri: string;
  style?: ViewStyle;
  thumbnailOnly?: boolean;
};

// ── Web: plain HTML5 video element ────────────────────────────────────────────

function WebVideoPlayer({ uri, style, thumbnailOnly }: Props) {
  return (
    <View style={[styles.container, style]}>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        src={uri}
        controls={!thumbnailOnly}
        playsInline
        preload={thumbnailOnly ? 'metadata' : 'auto'}
        style={{ width: '100%', height: '100%', display: 'block', backgroundColor: '#000' }}
      />
    </View>
  );
}

// ── Native: expo-video with play-button overlay ───────────────────────────────

function NativeVideoPlayer({ uri, style, thumbnailOnly }: Props) {
  // Import lazily so web bundles never pull in expo-video
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { VideoView, useVideoPlayer } = require('expo-video') as typeof import('expo-video');

  const [started, setStarted] = useState(false);
  const player = useVideoPlayer(uri, (p: import('expo-video').VideoPlayer) => {
    p.loop = false;
  });

  return (
    <View style={[styles.container, style]}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        nativeControls={!thumbnailOnly && started}
        contentFit="contain"
      />
      {!thumbnailOnly && !started && (
        <TouchableOpacity style={styles.overlay} onPress={() => { player.play(); setStarted(true); }} activeOpacity={0.8}>
          <View style={styles.playBtn}>
            <Play size={28} color="#fff" fill="#fff" />
          </View>
        </TouchableOpacity>
      )}
      {thumbnailOnly && (
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
