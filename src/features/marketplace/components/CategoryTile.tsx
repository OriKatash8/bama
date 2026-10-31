import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { LucideIcon } from 'lucide-react-native';
import { AppText } from '@components/ui/AppText';

/** A category drawn from PNGs (the original six) or from a Lucide icon (the later ones). */
export type MarketplaceCategory = { id: string; labelKey: string } & (
  | {
      icon: number;
      /** The coloured icon shown while this category is chosen. */
      selectedIcon?: number;
      Icon?: never;
    }
  | { Icon: LucideIcon; icon?: never; selectedIcon?: never }
);

/**
 * A vector tile drawn to match the PNG ones, sampled from them: the glyph's blue,
 * and the chosen state's rounded square with its blue-to-violet gradient.
 */
const VECTOR_GLYPH = '#0C4CB0';
const VECTOR_GRADIENT = ['#064BAF', '#C66BE5'] as const;

type Props = {
  cat: MarketplaceCategory;
  label: string;
  isActive: boolean;
  onPress: () => void;
  inactiveLabelColor: string;
};

const ACTIVE_LABEL = '#000000';

/**
 * A marketplace category: its icon over its label, growing when chosen and
 * switching to its coloured icon.
 *
 * BOTH icons stay mounted, stacked, and the chosen one is shown by opacity.
 * Swapping a single expo-image's `source` between the two did not repaint on
 * phones (it did on web), so the tile stayed grey after being tapped. Two
 * images that never change source cannot get stuck, and the switch is instant.
 */
export function CategoryTile({ cat, label, isActive, onPress, inactiveLabelColor }: Props) {
  const anim = useRef(new Animated.Value(isActive ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: isActive ? 1 : 0,
      useNativeDriver: true,
      damping: 15,
      stiffness: 200,
      mass: 1,
    }).start();
  }, [isActive, anim]);

  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.33] });
  const showSelected = isActive && (!!cat.selectedIcon || !!cat.Icon);
  const Icon = cat.Icon;

  return (
    <TouchableOpacity style={styles.item} onPress={onPress} activeOpacity={0.75}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <View style={styles.icon}>
          {Icon ? (
            // Same rule as the images: both states mounted, the chosen one shown by opacity.
            <>
              <View testID={`cat-${cat.id}-icon`} style={[StyleSheet.absoluteFill, styles.vector, { opacity: showSelected ? 0 : 1 }]}>
                <Icon size={26} color={VECTOR_GLYPH} strokeWidth={2.2} />
              </View>
              <View testID={`cat-${cat.id}-icon-selected`} style={[StyleSheet.absoluteFill, styles.vector, { opacity: showSelected ? 1 : 0 }]}>
                <LinearGradient colors={VECTOR_GRADIENT} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.square}>
                  <Icon size={22} color="#FFFFFF" strokeWidth={2.2} />
                </LinearGradient>
              </View>
            </>
          ) : (
            <>
              <Image
                testID={`cat-${cat.id}-icon`}
                source={cat.icon}
                style={[StyleSheet.absoluteFill, { opacity: showSelected ? 0 : 1 }]}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
              {cat.selectedIcon !== undefined && (
                <Image
                  testID={`cat-${cat.id}-icon-selected`}
                  source={cat.selectedIcon}
                  style={[StyleSheet.absoluteFill, { opacity: showSelected ? 1 : 0 }]}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                />
              )}
            </>
          )}
        </View>
      </Animated.View>
      <AppText
        weight={isActive ? 'semiBold' : 'medium'}
        style={[styles.label, isActive ? styles.labelActive : { color: inactiveLabelColor }]}
      >
        {label}
      </AppText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  item: {
    width: 82,
    alignItems: 'center',
    paddingVertical: 4,
  },
  icon: { width: 72, height: 72 },
  vector: { alignItems: 'center', justifyContent: 'center' },
  // 214 of the PNG's 400px, at 72pt.
  square: { width: 39, height: 39, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  // The visible gap is not `gap` — that was already 2. It is transparent padding
  // baked into the 72×72 contentFit="contain" icons, so the label is pulled up
  // into it rather than the spacing being reduced. Icon hit area is unchanged.
  // Centred line by line: a two-line label ("Studio Accessories") fills the
  // tile's width, so the tile's alignItems can no longer centre it.
  label: { fontSize: 11, fontWeight: '500', marginTop: -10, textAlign: 'center' },
  labelActive: { fontWeight: '600', color: ACTIVE_LABEL },
});
