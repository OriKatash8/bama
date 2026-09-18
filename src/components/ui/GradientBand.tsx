import { useState } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/** The violet header band shared by the client tabs: top-right to bottom-left. */
const BAND_COLORS = ['#1D4FD8', '#5B33E0', '#8B45E8', '#A855F7'] as const;
const BAND_LOCATIONS = [0, 0.46, 0.78, 1] as const;
const BAND_START = { x: 1, y: 0 };
const BAND_END = { x: 0.15, y: 1 };

/** How far the gradient continues above the band. Only an iOS rubber-band pull
 *  ever shows it, and no pull reaches this far. */
const OVERSCROLL = 1000;

type Props = {
  children: React.ReactNode;
  /** The band's own padding — each screen sets its own. */
  style?: StyleProp<ViewStyle>;
};

/**
 * The header band, plus the same gradient carried on above it so that pulling
 * the page down past its top reveals more gradient instead of the page's
 * off-white. Must sit at the very top of a screen's scroll content, so the
 * extension moves with the page.
 *
 * The extension is one tall box (OVERSCROLL + the band's height) whose gradient
 * is placed so that, over the band's own rows, it paints exactly what the band
 * paints — so there is no seam — and above them simply keeps going, fading to
 * the first colour. That needs the band's measured size, so it appears after
 * the first layout.
 */
export function GradientBand({ children, style }: Props) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  return (
    <View>
      {size && (
        <LinearGradient
          {...extensionGradient(size.w, size.h)}
          style={[styles.extension, { height: OVERSCROLL + size.h }]}
          pointerEvents="none"
        />
      )}
      <LinearGradient
        colors={BAND_COLORS}
        locations={BAND_LOCATIONS}
        start={BAND_START}
        end={BAND_END}
        style={style}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          if (!size || size.w !== width || size.h !== height) setSize({ w: width, h: height });
        }}
      >
        {children}
      </LinearGradient>
    </View>
  );
}

/**
 * Start/end points and stop positions for the tall box, derived from the band's
 * (w × h) so both boxes colour every shared pixel the same.
 *
 * iOS and Android draw the gradient along the pixel line from start to end, so
 * moving the start down by OVERSCROLL (in the tall box's units) puts the line on
 * exactly the band's pixels; the stops carry over unchanged.
 *
 * Web renders a CSS `linear-gradient(angle)`, whose line is centred on the box
 * and sized to reach its corners, so a taller box stretches it. The angle is
 * unchanged (same pixel direction), but each stop has to be re-positioned along
 * the longer line: stop s sits (s − ½)·L_band from the band's centre, and the
 * band's centre sits OVERSCROLL/2 below the tall box's centre.
 */
function extensionGradient(w: number, h: number) {
  const tallH = OVERSCROLL + h;
  const start = { x: BAND_START.x, y: OVERSCROLL / tallH };
  const end = { x: BAND_END.x, y: 1 };
  if (Platform.OS !== 'web') {
    return { colors: BAND_COLORS, locations: BAND_LOCATIONS, start, end };
  }
  // expo-linear-gradient's own web angle: 90° + atan2 of the pixel vector.
  const a = Math.PI / 2 + Math.atan2((BAND_END.y - BAND_START.y) * h, (BAND_END.x - BAND_START.x) * w);
  const sin = Math.abs(Math.sin(a));
  const cos = Math.cos(a);
  const bandLength = w * sin + h * Math.abs(cos);
  const tallLength = w * sin + tallH * Math.abs(cos);
  const centreShift = -cos * (OVERSCROLL / 2);
  const locations = BAND_LOCATIONS.map(
    (s) => 0.5 + ((s - 0.5) * bandLength + centreShift) / tallLength,
  ) as [number, number, ...number[]];
  return { colors: BAND_COLORS, locations, start, end };
}

const styles = StyleSheet.create({
  extension: {
    position: 'absolute',
    top: -OVERSCROLL,
    left: 0,
    right: 0,
  },
});
