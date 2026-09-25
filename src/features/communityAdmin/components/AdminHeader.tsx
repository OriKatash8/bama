import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useAdminPalette, useAdminT } from '../i18n';
import { AVATAR_TEXT, BRAND_GRADIENT, MOTION, OWNER_GRADIENT, RADIUS, SPACE, TYPE, cardShadow, segmentShadow } from '../theme';
import type { RangeDays } from '../aggregate';
import { AdminText, initialsOf } from './primitives';

const CONTENT_MAX = 1180;

/**
 * The page's top bar: back, community mark + name, owner chip on the far side.
 * It is part of the page and scrolls away with it (not pinned), so it sits on
 * the page background with no blur — nothing ever passes behind it.
 */
export function AdminHeader({
  communityName,
  ownerName,
  onBack,
}: {
  communityName: string;
  ownerName: string;
  onBack: () => void;
}) {
  const p = useAdminPalette();
  const { t, rtl, rowDir, textAlign } = useAdminT();
  const Back = rtl ? ChevronRight : ChevronLeft;

  return (
    <View style={[styles.bar, { backgroundColor: p.bg, borderBottomColor: p.border }]} testID="admin-header">
      <View style={[styles.inner, { flexDirection: rowDir }]}>
        <Pressable onPress={onBack} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('back')} testID="admin-back">
          <Back size={22} color={p.text2} strokeWidth={2.2} />
        </Pressable>
        <View style={[styles.brand, { flexDirection: rowDir }]}>
          <LinearGradient
            colors={BRAND_GRADIENT}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.82, y: 1 }}
            style={styles.mark}
          >
            <AdminText weight="bold" style={styles.markText}>
              {initialsOf(communityName)}
            </AdminText>
          </LinearGradient>
          <View style={styles.brandText}>
            <AdminText weight="semiBold" numberOfLines={1} style={[styles.name, { textAlign }]}>
              {communityName}
            </AdminText>
            <AdminText numberOfLines={1} style={[TYPE.rowMeta, { color: p.text3, textAlign }]}>
              {t('owner_role')}
            </AdminText>
          </View>
        </View>
        <View
          style={[
            styles.owner,
            { flexDirection: rowDir, backgroundColor: p.surface, borderColor: p.border },
            rtl ? styles.ownerPadRtl : styles.ownerPadLtr,
            cardShadow(p),
          ]}
          testID="admin-owner-chip"
        >
          <LinearGradient colors={OWNER_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 0.82, y: 1 }} style={styles.ownerAv}>
            <AdminText weight="semiBold" style={styles.ownerAvText}>
              {initialsOf(ownerName)}
            </AdminText>
          </LinearGradient>
          <AdminText numberOfLines={1} style={[TYPE.rowMeta, styles.ownerName, { color: p.text2 }]}>
            {ownerName}
          </AdminText>
        </View>
      </View>
    </View>
  );
}

/** Title + subtitle, and on the far side the live dot and the range control. */
export function TitleBlock({ range, onRange }: { range: RangeDays; onRange: (r: RangeDays) => void }) {
  const p = useAdminPalette();
  const { t, rowDir, textAlign } = useAdminT();
  return (
    <View style={[styles.head, { flexDirection: rowDir }]}>
      <View style={styles.headText}>
        <AdminText weight="bold" accessibilityRole="header" style={[TYPE.screenTitle, { textAlign }]}>
          {t('title')}
        </AdminText>
        <AdminText style={[styles.subtitle, { color: p.text2, textAlign }]}>{t('subtitle')}</AdminText>
      </View>
      <View style={[styles.headSide, { flexDirection: rowDir }]}>
        <View style={[styles.live, { flexDirection: rowDir }]}>
          <LiveDot />
          <AdminText style={[TYPE.rowMeta, { color: p.text3 }]}>{t('live')}</AdminText>
        </View>
        <RangeSegment value={range} onChange={onRange} />
      </View>
    </View>
  );
}

const RANGES: RangeDays[] = [7, 30, 90];

export function RangeSegment({ value, onChange }: { value: RangeDays; onChange: (r: RangeDays) => void }) {
  const p = useAdminPalette();
  const { t, rowDir } = useAdminT();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t('range_a11y')}
      style={[styles.seg, { flexDirection: rowDir, backgroundColor: p.surface3, borderColor: p.border }]}
    >
      {RANGES.map((r) => {
        const on = r === value;
        return (
          <Pressable
            key={r}
            testID={`range-${r}`}
            onPress={() => onChange(r)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, checked: on }}
            style={[styles.segBtn, on && [{ backgroundColor: p.surface }, segmentShadow(p)]]}
          >
            <AdminText weight="medium" tabular style={[TYPE.button, { color: on ? p.text : p.text2 }]}>
              {t('range_days', { n: r })}
            </AdminText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A 7px series3 dot whose halo pulses out on a 2.4s loop; still under reduced motion. */
export function LiveDot() {
  const p = useAdminPalette();
  const reduce = useReducedMotion();
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    pulse.value = withRepeat(withTiming(1, { duration: MOTION.livePulse, easing: Easing.out(Easing.cubic) }), -1, false);
  }, [reduce, pulse]);
  // The CSS keyframe grows a 0→8px halo while fading it out by 70% of the loop.
  const halo = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + Math.min(pulse.value / 0.7, 1) * (8 / 3.5) }],
    opacity: 0.45 * (1 - Math.min(pulse.value / 0.7, 1)),
  }));
  return (
    <View style={styles.dotWrap} testID="live-dot">
      {!reduce && <Animated.View style={[styles.dot, styles.halo, { backgroundColor: p.series3 }, halo]} />}
      <View style={[styles.dot, { backgroundColor: p.series3 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderBottomWidth: 1, paddingVertical: 12, paddingHorizontal: SPACE.gutter },
  inner: { alignItems: 'center', gap: 12, width: '100%', maxWidth: CONTENT_MAX, alignSelf: 'center' },
  brand: { alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  mark: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  markText: { color: AVATAR_TEXT, fontSize: 15, letterSpacing: 0.5 },
  brandText: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, letterSpacing: -0.15 },
  owner: { alignItems: 'center', gap: 8, borderRadius: RADIUS.pill, borderWidth: 1, paddingVertical: 5, flexShrink: 0, maxWidth: 180 },
  ownerPadLtr: { paddingLeft: 5, paddingRight: 10 },
  ownerPadRtl: { paddingLeft: 10, paddingRight: 5 },
  ownerAv: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  ownerAvText: { color: AVATAR_TEXT, fontSize: 11 },
  ownerName: { flexShrink: 1 },
  // 18 below the title in the mockup; the content's 14px card gap supplies the rest.
  head: { alignItems: 'flex-end', flexWrap: 'wrap', gap: 16, paddingTop: 26, paddingBottom: 4 },
  headText: { flexGrow: 1, flexShrink: 1, minWidth: 220 },
  subtitle: { fontSize: 13.5, marginTop: 4 },
  headSide: { alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  live: { alignItems: 'center', gap: 6 },
  seg: { padding: 2, gap: 2, borderRadius: RADIUS.pill, borderWidth: 1 },
  segBtn: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: RADIUS.pill },
  dotWrap: { width: 7, height: 7 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  halo: { position: 'absolute' },
});

export { CONTENT_MAX };
