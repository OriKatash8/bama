import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { AppText } from '@components/ui/AppText';

export type MarketplaceCategory = {
  id: string;
  labelKey: string;
  icon: number;
  /** The coloured icon shown while this category is chosen. */
  selectedIcon?: number;
};

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
  const showSelected = isActive && !!cat.selectedIcon;

  return (
    <TouchableOpacity style={styles.item} onPress={onPress} activeOpacity={0.75}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <View style={styles.icon}>
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
  // The visible gap is not `gap` — that was already 2. It is transparent padding
  // baked into the 72×72 contentFit="contain" icons, so the label is pulled up
  // into it rather than the spacing being reduced. Icon hit area is unchanged.
  label: { fontSize: 11, fontWeight: '500', marginTop: -10 },
  labelActive: { fontWeight: '600', color: ACTIVE_LABEL },
});
