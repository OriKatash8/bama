import { useState } from 'react';
import { Image, StyleSheet, type ImageLoadEventData, type NativeSyntheticEvent } from 'react-native';

const MIN_RATIO = 9 / 16; // a phone screenshot shows whole; taller is capped
const MAX_RATIO = 16 / 9; // a wide photo shows whole; wider is capped

/** width / height, kept within [9:16, 16:9]; 1 when the size is unknown. */
export function clampRatio(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return 1;
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));
}

// Per URL, for the life of the app: a bubble scrolled away and back (or
// re-rendered by a new message) starts at its real shape instead of square.
const ratioCache = new Map<string, number>();

/**
 * A photo message in its own shape. It was a fixed 16:9 box with `cover`, so a
 * vertical photo was cut to a landscape strip. Messages carry no size, so it is
 * read from the image when it loads — which fixes photos already sent, too.
 */
export function ChatImage({ uri }: { uri: string }) {
  const [ratio, setRatio] = useState(() => ratioCache.get(uri) ?? 1);

  function onLoad(e: NativeSyntheticEvent<ImageLoadEventData>) {
    const { width, height } = e.nativeEvent.source;
    const next = clampRatio(width / height);
    ratioCache.set(uri, next);
    setRatio(next);
  }

  return (
    <Image
      testID="chat-image"
      source={{ uri }}
      style={[styles.image, { aspectRatio: ratio }]}
      resizeMode="cover"
      onLoad={onLoad}
    />
  );
}

const styles = StyleSheet.create({
  image: { width: '100%', minHeight: 0, overflow: 'hidden' },
});
