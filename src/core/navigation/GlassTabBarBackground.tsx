import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { SlidingTabBackground } from './SlidingTabBackground';
import { TAB_BAR_CONTENT_HEIGHT } from './floatingTabBar';

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
 * The docked tab bar's material: a blur of the content scrolling under it, a
 * hairline on top where light catches the edge, and the sliding active-tab pill.
 * Honours Reduce Transparency — live, not just at mount — by going solid.
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

  let material;
  if (reduceTransparency) {
    material = <View style={[StyleSheet.absoluteFill, { backgroundColor: SOLID[scheme] }]} />;
  } else if (Platform.OS === 'android') {
    material = (
      <>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: ANDROID_FALLBACK[scheme] }]} />
        <BlurView style={StyleSheet.absoluteFill} tint={scheme} intensity={80} blurMethod="dimezisBlurView" />
      </>
    );
  } else {
    material = <BlurView style={StyleSheet.absoluteFill} tint={scheme} intensity={80} />;
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {material}
      <View style={[styles.hairline, { backgroundColor: HAIRLINE[scheme] }]} />
      <SlidingTabBackground
        numTabs={tabNames.length}
        tabNames={tabNames}
        activeColor={activeColor}
        bandHeight={TAB_BAR_CONTENT_HEIGHT}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hairline: { position: 'absolute', top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth },
});
