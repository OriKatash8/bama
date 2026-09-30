import { Image, StyleSheet, type ImageLoadEventData, type NativeSyntheticEvent } from 'react-native';
import { useMediaRatio } from '../utils/mediaRatio';

export { clampRatio } from '../utils/mediaRatio';

/**
 * A photo message in its own shape. It was a fixed 16:9 box with `cover`, so a
 * vertical photo was cut to a landscape strip. The size is read from the image
 * when it loads (useMediaRatio).
 */
export function ChatImage({ uri }: { uri: string }) {
  const [ratio, setSize] = useMediaRatio(uri, 1);

  function onLoad(e: NativeSyntheticEvent<ImageLoadEventData>) {
    const { width, height } = e.nativeEvent.source;
    setSize(width, height);
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
