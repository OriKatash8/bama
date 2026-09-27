import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue,
  withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { User } from 'lucide-react-native';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
import { ROLES, labelOf } from '@features/crew/data/categories';
import { ROLE_GLYPHS } from '@features/crew/data/roleTiles';
import {
  BUBBLE_LAYOUT, DEFAULT_ROLES, TILE_LAYOUT, fillToBottom, floatFor, scaleLeft, type Placement, type RoleId,
} from './emptyStateLayout';

export type EmptyStateVariant = 'tiles' | 'bubbles' | 'board';

type Props = {
  variant: EmptyStateVariant;
  title: string;
  subtitle: string;
  /** An extra small line under the subtitle (the notice board's upgrade hint). */
  note?: string;
  primaryCta?: { label: string; icon?: ReactNode; onPress: () => void };
  secondaryLink?: { label: string; onPress: () => void };
  /** For 'tiles' and 'board': real role ids; label and glyph come from ROLES / ROLE_GLYPHS. */
  roles?: RoleId[];
  /**
   * The parent's horizontal padding, cancelled for this component only so the
   * panel reaches the screen edges (every screen mounts it inside a sheet with
   * `paddingHorizontal: 20`; the lists' own content keeps that padding).
   */
  bleed?: number;
  /**
   * The parent's top padding, cancelled so the panel meets the sheet's top edge
   * with no strip of sheet colour above it. Only when nothing sits above the
   * empty state — the screen decides.
   */
  bleedTop?: number;
  /** Top corner radius: the sheet's own (26) when the panel meets its top edge. */
  radius?: number;
};

// ── Palette (the spec's; the app's brand gradients differ, so these are local) ──
const PANEL_BG = '#F4F2FB';
const INK = '#1A1530';
const INK_SOFT = '#5A566C';
const LINK = '#5B3FD0';
const CTA_GRADIENT = ['#2A45D8', '#6E58E2', '#C96BDA'] as const;
const BADGE_GRADIENT = ['#3A4FDC', '#9A5EDD'] as const;
const AVATAR_GRADIENT = ['#3A4FDC', '#B064DC'] as const;
const ILLUSTRATION_HEIGHT = 420;

/** Final values the entrance springs to — also the static reduced-motion frame. */
const ENTER_SPRING = { damping: 14, stiffness: 120, mass: 1 };
const FLOAT_EASING = Easing.inOut(Easing.sin);

/** Title weight 800: Heebo-ExtraBold in Hebrew, Montserrat 800 in English (as the app). */
function extraBold(rtl: boolean) {
  return rtl ? { fontFamily: 'Heebo-ExtraBold', fontWeight: '800' as const } : { fontFamily: 'Montserrat', fontWeight: '800' as const };
}

/**
 * The shared animated empty state: glass cards floating over soft glows, then the
 * screen's own title, subtitle and actions. Used by the client's projects and
 * offers tabs, both chats lists and the pro notice board — each passing its
 * existing copy, buttons and navigation unchanged.
 *
 * Paints its own panel (PANEL_BG, rounded top, clipped) inside the screen's
 * existing sheet, bleeding through the sheet's side padding (`bleed`) so it
 * spans the full screen width; nothing about the non-empty layout changes.
 *
 * Motion runs on the UI thread. Each card and glow owns its loop: it starts when
 * the screen is focused, is cancelled when it is not, and never starts under
 * reduced motion — which renders the final static layout. Nothing relies on an
 * animation completion callback (they never fire on web in Reanimated 4).
 */
export function AnimatedEmptyState({
  variant, title, subtitle, note, primaryCta, secondaryLink, roles = DEFAULT_ROLES, bleed = 0, bleedTop = 0, radius = 32,
}: Props) {
  const rtl = useSettingsStore((s) => s.language) === 'he';
  const lang: 'he' | 'en' = rtl ? 'he' : 'en';
  const font = useAppFont();
  const reduced = useReducedMotion();
  // The live WINDOW width. The panel spans it (see `bleed`), and card positions
  // scale from the 390pt reference to it — 390 is never a container width.
  const { width, height: windowHeight } = useWindowDimensions();

  // Reach the bottom of the screen: no band of sheet colour under the panel.
  // Measured from where the panel really sits, which differs per screen.
  const panelRef = useRef<View>(null);
  const [fillMin, setFillMin] = useState(0);
  const measure = () => panelRef.current?.measureInWindow((_x, y) => setFillMin(fillToBottom(windowHeight, y)));

  // Tile / board cards follow the role list, in the specced back-to-front order.
  const tiles = TILE_LAYOUT.filter((t) => roles.includes(t.role));

  return (
    <View
      ref={panelRef}
      onLayout={measure}
      testID="empty-panel"
      style={[
        styles.panel,
        { marginHorizontal: -bleed, marginTop: -bleedTop, borderTopLeftRadius: radius, borderTopRightRadius: radius, minHeight: fillMin },
      ]}
    >
      {/* Decoration only: no touches, invisible to screen readers. */}
      <View
        testID="empty-illustration"
        style={styles.illustration}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Glow color="rgba(70,100,235,0.38)" size={280} left={scaleLeft(-90, width)} top={330} loopMs={7000} reduced={reduced} />
        <Glow color="rgba(150,95,235,0.34)" size={260} left={scaleLeft(85, width)} top={175} loopMs={8000} reduced={reduced} />
        <Glow color="rgba(215,110,215,0.30)" size={240} left={width - 240 + scaleLeft(70, width)} top={-10} loopMs={9000} reduced={reduced} />

        {variant === 'bubbles'
          ? BUBBLE_LAYOUT.map((p, i) => (
            <Floating key={i} index={i} placement={p} width={width} reduced={reduced} testID={`empty-card-${i}`}>
              <BubbleCard rtl={rtl} />
            </Floating>
          ))
          : tiles.map((t, i) => {
            const role = ROLES.find((r) => r.id === t.role);
            return (
              <Floating key={t.role} index={i} placement={t} width={width} reduced={reduced} testID={`empty-card-${t.role}`}>
                <RoleCard
                  id={t.role}
                  label={role ? labelOf(role, lang) : ''}
                  // A require()d image asset: a number at runtime (the map is typed loosely).
                  glyph={ROLE_GLYPHS[t.role] as number}
                  price={variant === 'board'}
                  rtl={rtl}
                />
              </Floating>
            );
          })}
      </View>

      <View style={{ height: ILLUSTRATION_HEIGHT - 12 }} />

      <FadeUp delay={450} reduced={reduced} style={styles.textBlock}>
        <Text style={[styles.title, extraBold(rtl)]}>{title}</Text>
        <Text style={[styles.subtitle, font.regular]}>{subtitle}</Text>
        {note ? <Text style={[styles.note, font.regular]}>{note}</Text> : null}
        {primaryCta && (
          <View style={styles.ctaShadow}>
            <TouchableOpacity testID="empty-cta" onPress={primaryCta.onPress} activeOpacity={0.88} accessibilityRole="button" style={styles.ctaTouch}>
              <LinearGradient colors={CTA_GRADIENT} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.cta}>
                {primaryCta.icon}
                <Text style={[styles.ctaText, font.bold]}>{primaryCta.label}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}
        {secondaryLink && (
          <TouchableOpacity testID="empty-link" onPress={secondaryLink.onPress} activeOpacity={0.7} accessibilityRole="link" hitSlop={8}>
            <Text style={[styles.link, font.bold]}>{secondaryLink.label}</Text>
          </TouchableOpacity>
        )}
      </FadeUp>
    </View>
  );
}

// ── Motion ────────────────────────────────────────────────────────────────────

/** One card: staggered entrance, then an idle float while the screen is focused. */
function Floating({ index, placement, width, reduced, testID, children }: {
  index: number; placement: Placement; width: number; reduced: boolean; testID: string; children: ReactNode;
}) {
  const f = floatFor(index);
  const enter = useSharedValue(reduced ? 1 : 0);
  const float = useSharedValue(reduced ? 0 : f.phase);

  useEffect(() => {
    if (reduced) { enter.set(1); return; }
    enter.set(withDelay(index * 70, withSpring(1, ENTER_SPRING)));
  }, [reduced, index, enter]);

  useFocusEffect(
    useCallback(() => {
      if (reduced) return;
      // Resume from wherever the card was left, then swing back and forth forever.
      const from = float.get();
      float.set(withSequence(
        withTiming(1, { duration: f.duration * (1 - from), easing: FLOAT_EASING }),
        withRepeat(withTiming(0, { duration: f.duration, easing: FLOAT_EASING }), -1, true),
      ));
      return () => cancelAnimation(float);
    }, [reduced, float, f.duration]),
  );

  const style = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [
      { translateX: f.dx * float.value },
      { translateY: 16 * (1 - enter.value) + f.dy * float.value },
      { rotate: `${placement.rotate + f.dRotate * float.value}deg` },
      { scale: 0.9 + 0.1 * enter.value },
    ],
  }));

  return (
    <Animated.View testID={testID} style={[styles.floating, { left: scaleLeft(placement.left, width), top: placement.top }, style]}>
      {children}
    </Animated.View>
  );
}

/** A soft radial glow (no blur), breathing slowly while the screen is focused. */
function Glow({ color, size, left, top, loopMs, reduced }: {
  color: string; size: number; left: number; top: number; loopMs: number; reduced: boolean;
}) {
  const id = `glow${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const pulse = useSharedValue(reduced ? 1 : 0);

  useFocusEffect(
    useCallback(() => {
      if (reduced) return;
      pulse.set(withRepeat(withTiming(1, { duration: loopMs / 2, easing: FLOAT_EASING }), -1, true));
      return () => cancelAnimation(pulse);
    }, [reduced, pulse, loopMs]),
  );

  const style = useAnimatedStyle(() => ({
    opacity: 0.75 + 0.25 * pulse.value,
    transform: [{ scale: 1 + 0.12 * pulse.value }],
  }));

  return (
    <Animated.View style={[styles.floating, { left, top, width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={1} />
            <Stop offset="0.68" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

/** The text block's entrance: fades up from 8pt, once. */
function FadeUp({ delay, reduced, style, children }: { delay: number; reduced: boolean; style: object; children: ReactNode }) {
  const v = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) { v.set(1); return; }
    v.set(withDelay(delay, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) })));
  }, [reduced, delay, v]);
  const a = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ translateY: 8 * (1 - v.value) }] }));
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

// ── Cards ─────────────────────────────────────────────────────────────────────

function Skeleton({ width, strong, height }: { width: number | `${number}%`; strong: boolean; height: number }) {
  return <View style={{ width, height, borderRadius: height / 2, backgroundColor: strong ? 'rgba(120,115,145,0.30)' : 'rgba(120,115,145,0.20)' }} />;
}

function RoleCard({ id, label, glyph, price, rtl }: { id: string; label: string; glyph: number; price: boolean; rtl: boolean }) {
  const align = rtl ? 'flex-end' : 'flex-start';
  return (
    <View testID={`role-card-${id}`} style={[styles.card, styles.roleCard, { alignItems: align }]}>
      <LinearGradient colors={BADGE_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.badge}>
        <Image source={glyph} style={styles.glyph} contentFit="contain" tintColor="#FFFFFF" />
      </LinearGradient>
      <Text style={[styles.roleLabel, extraBold(rtl), { textAlign: rtl ? 'right' : 'left' }]} numberOfLines={1}>{label}</Text>
      <View style={[styles.lines, { alignItems: align }]}>
        <Skeleton width="100%" strong height={5} />
        {price ? (
          <View style={[styles.priceRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
            <View style={{ flex: 1 }}><Skeleton width="100%" strong={false} height={5} /></View>
            <View style={styles.pricePill}><Text style={styles.priceText}>₪</Text></View>
          </View>
        ) : (
          <Skeleton width="60%" strong={false} height={5} />
        )}
      </View>
    </View>
  );
}

function BubbleCard({ rtl }: { rtl: boolean }) {
  return (
    <View style={[styles.card, styles.bubble, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
      <LinearGradient colors={AVATAR_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatar}>
        <User size={20} color="#FFFFFF" strokeWidth={2} />
      </LinearGradient>
      <View style={[styles.bubbleLines, { alignItems: rtl ? 'flex-end' : 'flex-start' }]}>
        <Skeleton width="85%" strong height={6} />
        <Skeleton width="55%" strong={false} height={6} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Stretches across the (bled) parent and down its min-height; clips at the
  // screen edges, so cards partly off-screen are cut exactly there.
  panel: {
    alignSelf: 'stretch',
    flexGrow: 1,
    backgroundColor: PANEL_BG,
    overflow: 'hidden',
    paddingBottom: 28,
  },
  illustration: { position: 'absolute', top: 0, left: 0, right: 0, height: ILLUSTRATION_HEIGHT },
  floating: { position: 'absolute' },
  card: {
    backgroundColor: 'rgba(255,255,255,0.58)',
    borderWidth: 1,
    borderColor: 'rgba(165,150,235,0.55)',
    shadowColor: '#5A46C8',
    shadowOpacity: 0.13,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 30,
    elevation: 4,
  },
  // Height follows the content (min 104): a fixed 104 overflowed on iPhone,
  // where the board's ₪ row made the cards taller still. 12pt vertical padding
  // + badge 38 + 6 + label 16 + 6 + two 5pt lines with a 5pt gap = 105.
  roleCard: { width: 142, minHeight: 104, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 12 },
  badge: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  glyph: { width: 20, height: 20 },
  // Pinned line height: Heebo's natural line box on iOS is ~21pt at 14pt.
  roleLabel: { fontSize: 14, lineHeight: 16, color: INK, marginTop: 6, alignSelf: 'stretch' },
  lines: { alignSelf: 'stretch', gap: 5, marginTop: 6 },
  priceRow: { alignSelf: 'stretch', alignItems: 'center', gap: 6 },
  // A fixed-height box centred both ways, and the ₪ in the SYSTEM font: Heebo's
  // lopsided ascent/descent drew it visibly off-centre on iOS.
  pricePill: {
    height: 14,
    minWidth: 22,
    paddingHorizontal: 6,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(110,88,226,0.14)',
  },
  priceText: {
    color: '#4B34B8',
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '700',
    textAlign: 'center',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  bubble: { width: 188, height: 62, borderRadius: 24, paddingHorizontal: 12, gap: 12, alignItems: 'center' },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  bubbleLines: { flex: 1, gap: 7 },
  textBlock: { alignItems: 'center', paddingHorizontal: 24 },
  title: { fontSize: 26, color: INK, textAlign: 'center' },
  subtitle: { fontSize: 15, lineHeight: 22, color: INK_SOFT, textAlign: 'center', marginTop: 6 },
  note: { fontSize: 13, lineHeight: 19, color: INK_SOFT, textAlign: 'center', marginTop: 6 },
  ctaShadow: {
    marginTop: 14,
    borderRadius: 28,
    shadowColor: '#5F4BD7',
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 28,
    elevation: 8,
  },
  ctaTouch: { borderRadius: 28, overflow: 'hidden' },
  cta: { width: 260, height: 56, borderRadius: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  ctaText: { color: '#FFFFFF', fontSize: 17 },
  link: { marginTop: 6, fontSize: 15, color: LINK, textDecorationLine: 'underline', textAlign: 'center' },
});
