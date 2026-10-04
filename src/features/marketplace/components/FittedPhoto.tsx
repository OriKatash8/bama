import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';

type Props = {
  uri: string;
  /** The box the photo sits in; it fills it and clips to it. */
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * A product photo shown WHOLE: fitted inside its box (never cropped), over a
 * blurred, softened copy of itself so portrait and landscape shots don't leave
 * flat bars. Shared by the listing card, the detail modal and the post preview.
 */
export function FittedPhoto({ uri, style, testID }: Props) {
  return (
    <View style={[styles.box, style]}>
      <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={24} cachePolicy="memory-disk" />
      <View style={[StyleSheet.absoluteFill, styles.veil]} />
      <Image testID={testID} source={{ uri }} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory-disk" />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden', backgroundColor: '#F4F2FB' },
  veil: { backgroundColor: 'rgba(244,242,251,0.45)' },
});
