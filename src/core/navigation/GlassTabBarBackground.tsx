import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { SlidingTabBackground } from './SlidingTabBackground';
import { TAB_BAR_CONTENT_HEIGHT, TAB_BAR_SIDE_MARGIN, TAB_BAR_CAPSULE_RADIUS } from './floatingTabBar';

type Props = {
  activeColor: string;
  isDark: boolean;
  tabNames: string[];
};

const SOLID = { light: '#FFFFFF', dark: '#0f0f1f' } as const;
/** Android has no blur target wired yet (it needs a BlurTargetView around the
 *  screens), so it gets a near-solid material instead of a blur of nothing. */
const ANDROID_FALLBACK = { light: 'rgba(255,255,255,0.92)', dark: 'rgba(15,15,31,0.92)' } as const;
const HAIRLINE = { light: 'rgba(0,0,0,0.12)', dark: 'rgba(255,255,255,0.14)' } as const;

/**
 * The docked tab bar's material, in order of preference:
 *  1. Reduce Transparency on (followed live) → solid, no glass, no blur.
 *  2. Liquid Glass (iOS 26+, gated at runtime on isGlassEffectAPIAvailable() —
 *     some iOS 26 betas lack the API and crash) → GlassView. It draws its own
 *     edge, so no manual hairline.
 *  3. Otherwise (older iOS, web, Android) → BlurView in a clipped capsule with
 *     a rounded hairline border.
 * Every path draws the same floating capsule (see styles.capsule), and the
 * sliding active-tab pill sits inside it, clipped to its rounded ends.
 *
 * Never put opacity on the GlassView or any parent: opacity 0 anywhere above it
 * kills the effect. Animate it with glassEffectStyle's animate /
 * animationDuration instead.
 */
export function GlassTabBarBackground({ activeColor, isDark, tabNames }: Props) {
  const [reduceTransparency, setReduceTransparency] = useState(false);
  const scheme = isDark ? 'dark' : 'light';

  useEffect(() => {
    // react-native-web has no isReduceTransparencyEnabled — calling it throws —
    // so the web reads the equivalent media query and follows its changes.
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || !window.matchMedia) return;
      const mq = window.matchMedia('(prefers-reduced-transparency: reduce)');
      const onChange = () => setReduceTransparency(mq.matches);
      onChange();
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
    let alive = true;
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((on) => { if (alive) setReduceTransparency(on); })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduceTransparency);
    return () => { alive = false; sub.remove(); };
  }, []);

  // One capsule frame for every material: inset from the sides, sitting at the
  // top of the bar's box — the float gap and the safe-area inset below it stay
  // empty. The tab row is confined to exactly this band (getDockedTabBarStyle).
  const hairlineBorder = { borderWidth: StyleSheet.hairlineWidth, borderColor: HAIRLINE[scheme] };
  let material;
  if (reduceTransparency) {
    material = (
      <View testID="tabbar-solid" style={[styles.capsule, hairlineBorder, { backgroundColor: SOLID[scheme] }]} />
    );
  } else if (isGlassEffectAPIAvailable()) {
    // Liquid Glass takes the radius directly and draws its own edge — no
    // hairline, and no opacity on it or any parent.
    material = (
      <GlassView
        testID="tabbar-glass"
        style={styles.capsule}
        glassEffectStyle="regular"
        colorScheme={scheme}
      />
    );
  } else {
    // A rounded wrapper with overflow hidden clips the blur's corners (BlurView
    // ignores an explicit borderRadius on some platforms); the BlurView also
    // gets the radius itself, because on web backdrop-filter is only reliably
    // clipped by its own element's border-radius. The hairline is the wrapper's
    // rounded border, not a straight line on top.
    material = (
      <View testID="tabbar-capsule" style={[styles.capsule, styles.clip, hairlineBorder]}>
        {Platform.OS === 'android' && (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: ANDROID_FALLBACK[scheme] }]} />
        )}
        <BlurView
          style={[StyleSheet.absoluteFill, { borderRadius: TAB_BAR_CAPSULE_RADIUS }]}
          tint={scheme}
          intensity={80}
          {...(Platform.OS === 'android' ? { blurMethod: 'dimezisBlurView' as const } : null)}
        />
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {material}
      <SlidingTabBackground
        numTabs={tabNames.length}
        tabNames={tabNames}
        activeColor={activeColor}
        bandHeight={TAB_BAR_CONTENT_HEIGHT}
        sideInset={TAB_BAR_SIDE_MARGIN}
        radius={TAB_BAR_CAPSULE_RADIUS}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  capsule: {
    position: 'absolute',
    top: 0,
    left: TAB_BAR_SIDE_MARGIN,
    right: TAB_BAR_SIDE_MARGIN,
    height: TAB_BAR_CONTENT_HEIGHT,
    borderRadius: TAB_BAR_CAPSULE_RADIUS,
  },
  clip: { overflow: 'hidden' },
});
