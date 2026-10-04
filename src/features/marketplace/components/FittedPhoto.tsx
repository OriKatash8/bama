import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';

type Props = {
  uri: string;
  /** The box the photo sits in; it fills it and clips to it. */
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Wider than tall by at least this much counts as horizontal. */
const LANDSCAPE_RATIO = 1.15;

/**
 * A product photo in its box. A HORIZONTAL photo fills the whole box; a vertical
 * (or square) one is shown WHOLE, fitted inside over a blurred, softened copy of
 * itself so it leaves no flat bars. Fitted until the size is known. Shared by the
 * listing card, the detail modal and the post preview.
 */
export function FittedPhoto({ uri, style, testID }: Props) {
  const [landscape, setLandscape] = useState(false);
  return (
    <View style={[styles.box, style]}>
      <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={24} cachePolicy="memory-disk" />
      <View style={[StyleSheet.absoluteFill, styles.veil]} />
      <Image
        testID={testID}
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        contentFit={landscape ? 'cover' : 'contain'}
        cachePolicy="memory-disk"
        onLoad={(e) => setLandscape(e.source.width / Math.max(1, e.source.height) >= LANDSCAPE_RATIO)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden', backgroundColor: '#F4F2FB' },
  veil: { backgroundColor: 'rgba(244,242,251,0.45)' },
});
