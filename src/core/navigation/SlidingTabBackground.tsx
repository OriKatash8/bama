import { useState, useEffect } from 'react';
import { Animated, View, StyleSheet } from 'react-native';
import { useSegments } from 'expo-router';

type Props = {
  numTabs: number;
  tabNames: string[];
  /** The active tab's tint; the pill is drawn in it at PILL_OPACITY. */
  activeColor: string;
  /** Height of the bar's content band. The pill stays inside it, above the
   *  bottom safe-area inset the bar also covers. */
  bandHeight: number;
  /** Inset of the band from each side — the capsule's side margin — so the
   *  band's width is the tab row's and the pill lines up with the items. */
  sideInset?: number;
  /** Corner radius of the band; with overflow hidden the pill can never cross
   *  the capsule's rounded ends. */
  radius?: number;
};

const PILL_OPACITY = 0.13;
/**
 * The pill must contain the whole tab — icon AND label (Heebo's line box is
 * 16pt at the 10pt label size, so the label sits low). A 2pt inset on every
 * side keeps the pill clear of the text and makes its rounded ends concentric
 * with the capsule's (same centre, radius 2 less).
 */
const PILL_INSET_X = 2;
const PILL_INSET_Y = 2;

/**
 * Critically damped spring (no overshoot): response 0.35s, damping ratio 1.0.
 * stiffness = (2π / response)² · mass, damping = 2 · √(stiffness · mass).
 * A spring starts from the pill's current on-screen position, so a second tap
 * mid-slide redirects it smoothly instead of jumping.
 */
const RESPONSE = 0.35;
const STIFFNESS = Math.pow((2 * Math.PI) / RESPONSE, 2);
const DAMPING = 2 * Math.sqrt(STIFFNESS);

/** '#RRGGBB' → rgba at the given alpha. */
function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function SlidingTabBackground({ numTabs, tabNames, activeColor, bandHeight, sideInset = 0, radius = 0 }: Props) {
  const segments = useSegments();
  const activeSegment = segments.find(s => tabNames.includes(s)) ?? tabNames[0];
  const activeIndex = Math.max(0, tabNames.indexOf(activeSegment));

  const [width, setWidth] = useState(0);
  // Held in state, not a ref: created once, and safe to read while rendering.
  const [slideAnim] = useState(() => new Animated.Value(activeIndex));

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: activeIndex,
      stiffness: STIFFNESS,
      damping: DAMPING,
      mass: 1,
      overshootClamping: true,
      useNativeDriver: true,
    }).start();
  }, [activeIndex, slideAnim]);

  const pillWidth = width / numTabs;

  return (
    <View
      style={[styles.band, { height: bandHeight, left: sideInset, right: sideInset, borderRadius: radius }]}
      onLayout={e => setWidth(e.nativeEvent.layout.width)}
      pointerEvents="none"
    >
      {width > 0 && (
        <Animated.View
          style={[
            styles.pill,
            {
              width: pillWidth - PILL_INSET_X * 2,
              backgroundColor: withAlpha(activeColor, PILL_OPACITY),
              transform: [{
                translateX: slideAnim.interpolate({
                  inputRange:  Array.from({ length: numTabs }, (_, i) => i),
                  outputRange: Array.from({ length: numTabs }, (_, i) => i * pillWidth + PILL_INSET_X),
                }),
              }],
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  band: { position: 'absolute', top: 0, overflow: 'hidden' },
  pill: {
    position: 'absolute',
    top: PILL_INSET_Y,
    bottom: PILL_INSET_Y,
    borderRadius: 100,
  },
});
