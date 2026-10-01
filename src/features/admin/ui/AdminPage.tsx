import { Children, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, ShieldCheck, type LucideIcon } from 'lucide-react-native';
import { useTabBarClearance, FLOATING_TAB_BAR_BOTTOM } from '@core/navigation/floatingTabBar';
import { useAuthStore } from '@core/stores/authStore';
import { useAdminPalette, useScopedT } from '@features/communityAdmin/i18n';
import { AVATAR_TEXT, BRAND_GRADIENT, RADIUS, SPACE, TYPE } from '@features/communityAdmin/theme';
import { AdminText, WhoBlock } from '@features/communityAdmin/components/primitives';
import { farEnd } from '@features/communityAdmin/components/ChartParts';
import { CONTENT_MAX } from '@features/communityAdmin/components/AdminHeader';

/**
 * The frame every admin page shares, in the community-owner dashboard's
 * design: grey page, a header that scrolls with the page, a big title with
 * an optional control on the far side, then a centred column of cards.
 */

/** The admin layout's log-out button: 40pt, 16 in from the physical left edge. */
const LOGOUT_CLEARANCE = 16 + 40 + 8;

/** Top/bottom padding for a page's scroll content: status bar on top, floating tab bar below. */
export function useAdminPageInsets() {
  const insets = useSafeAreaInsets();
  // Admin keeps the floating pill: its measured height + the 24pt it floats above the edge.
  const bottom = useTabBarClearance() + FLOATING_TAB_BAR_BOTTOM + 16;
  return { paddingTop: insets.top, paddingBottom: bottom };
}

/**
 * Gradient mark + greeting (+ back on pages reached from another page). The
 * physical left edge stays clear for the layout's log-out button, in both languages.
 */
export function AdminHeaderBar({ onBack }: { onBack?: () => void }) {
  const p = useAdminPalette();
  const { t, rtl, rowDir, textAlign } = useScopedT('admin_dashboard');
  const name = useAuthStore((s) => s.user?.displayName) ?? '';
  const first = name.trim().split(/\s+/)[0];
  const Back = rtl ? ChevronRight : ChevronLeft;
  return (
    <View style={[styles.bar, { borderBottomColor: p.border }]} testID="dash-header">
      <View style={[styles.barInner, { flexDirection: rowDir }]} testID="dash-header-row">
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('back')} testID="admin-back">
            <Back size={22} color={p.text2} strokeWidth={2.2} />
          </Pressable>
        ) : null}
        <LinearGradient colors={BRAND_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 0.82, y: 1 }} style={styles.mark}>
          <ShieldCheck size={20} color={AVATAR_TEXT} strokeWidth={2.2} />
        </LinearGradient>
        <View style={styles.brandText}>
          <AdminText weight="semiBold" numberOfLines={1} style={[styles.name, { textAlign }]}>
            {first ? `${t('greeting')}, ${first}` : t('greeting')}
          </AdminText>
          <AdminText numberOfLines={1} style={[TYPE.rowMeta, { color: p.text3, textAlign }]}>
            {t('admin_role')}
          </AdminText>
        </View>
      </View>
    </View>
  );
}

/** 30pt title + muted subtitle; `side` (a Segment, a button) sits on the far side. */
export function AdminTitle({ title, subtitle, side }: { title: string; subtitle?: string; side?: ReactNode }) {
  const p = useAdminPalette();
  const { rowDir, textAlign } = useScopedT('admin_dashboard');
  return (
    <View style={[styles.head, { flexDirection: rowDir }]}>
      <View style={styles.headText}>
        <AdminText weight="bold" accessibilityRole="header" style={[TYPE.screenTitle, { textAlign }]}>
          {title}
        </AdminText>
        {subtitle ? <AdminText style={[styles.subtitle, { color: p.text2, textAlign }]}>{subtitle}</AdminText> : null}
      </View>
      {/* On a phone the control wraps under the title; it stays on the far side, as on web. */}
      {side ? <View style={farEnd(rowDir)} testID="title-side">{side}</View> : null}
    </View>
  );
}

/** The centred card column: max 1180 wide, 16 gutter, 14 between cards. */
export function AdminColumn({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.column, style]}>{children}</View>;
}

/**
 * A whole scrolling admin page. Pages built on a FlatList use the pieces
 * instead: `useAdminPageInsets()` for the content padding, and
 * `AdminHeaderBar` + `AdminTitle` in the list header.
 */
export function AdminPage({
  title,
  subtitle,
  side,
  onBack,
  children,
  testID,
}: {
  title: string;
  subtitle?: string;
  side?: ReactNode;
  onBack?: () => void;
  children: ReactNode;
  testID?: string;
}) {
  const p = useAdminPalette();
  const pad = useAdminPageInsets();
  return (
    <View style={[styles.root, { backgroundColor: p.bg }]} testID={testID}>
      <ScrollView contentContainerStyle={pad} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <AdminHeaderBar onBack={onBack} />
        <AdminColumn>
          <AdminTitle title={title} subtitle={subtitle} side={side} />
          {children}
        </AdminColumn>
      </ScrollView>
    </View>
  );
}

/** Stat tiles in a grid: one row from 900px, two columns from 420px, else one. Rows mirror in Hebrew. */
export function StatGrid({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const { rowDir } = useScopedT('admin_dashboard');
  const items = Children.toArray(children);
  const cols = width >= 900 ? Math.min(4, items.length) : width >= 420 ? 2 : 1;
  const rows: ReactNode[][] = [];
  for (let i = 0; i < items.length; i += cols) rows.push(items.slice(i, i + cols));
  return (
    <View style={styles.grid} testID="stat-tiles">
      {rows.map((row, i) => (
        <View key={i} style={[styles.gridRow, { flexDirection: rowDir }]}>
          {row}
        </View>
      ))}
    </View>
  );
}

export type Tone = 'accent' | 'bad' | 'good' | 'warn' | 'neutral';

/** A 36pt rounded square holding an icon, tinted by tone. */
export function IconTile({ icon: Icon, tone = 'accent' }: { icon: LucideIcon; tone?: Tone }) {
  const p = useAdminPalette();
  const [bg, fg] = {
    accent: [p.accentSoft, p.accent],
    bad: [p.badBg, p.bad],
    good: [p.goodBg, p.good],
    warn: [p.warnBg, p.warn],
    neutral: [p.surface3, p.text2],
  }[tone];
  return (
    <View style={[styles.iconTile, { backgroundColor: bg }]}>
      <Icon size={17} color={fg} strokeWidth={2.2} />
    </View>
  );
}

/**
 * A tappable card row: icon tile, name over meta, whatever `trailing` is
 * (a badge), then the chevron. Top hairline and surface2 on hover/press,
 * like the community dashboard's list rows.
 */
export function NavRow({
  icon,
  tone,
  label,
  meta,
  trailing,
  onPress,
  accessibilityLabel,
  testID,
}: {
  icon: LucideIcon;
  tone?: Tone;
  label: string;
  meta?: string;
  trailing?: ReactNode;
  onPress: () => void;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const p = useAdminPalette();
  const { rtl, rowDir, textAlign } = useScopedT('admin_dashboard');
  const [hovered, setHovered] = useState(false);
  const Chevron = rtl ? ChevronLeft : ChevronRight;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.row,
        { flexDirection: rowDir, borderTopColor: p.border, backgroundColor: hovered || pressed ? p.surface2 : 'transparent' },
      ]}
    >
      <IconTile icon={icon} tone={tone} />
      <WhoBlock name={label} meta={meta ?? ''} textAlign={textAlign} />
      {trailing}
      <Chevron size={18} color={p.text3} strokeWidth={2} />
    </Pressable>
  );
}

/** A card's head: 15pt title, optional muted sub, optional control on the far side. Mirrors. */
export function CardHead({ title, sub, side }: { title: string; sub?: string; side?: ReactNode }) {
  const p = useAdminPalette();
  const { rowDir, textAlign } = useScopedT('admin_dashboard');
  return (
    <View style={[styles.cardHead, { flexDirection: rowDir }]}>
      <View style={styles.cardHeadText}>
        <AdminText weight="semiBold" accessibilityRole="header" numberOfLines={1} style={[TYPE.cardTitle, { textAlign }]}>
          {title}
        </AdminText>
        {sub ? (
          <AdminText numberOfLines={2} style={[TYPE.rowMeta, { color: p.text3, textAlign }]}>
            {sub}
          </AdminText>
        ) : null}
      </View>
      {side}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: { borderBottomWidth: 1, paddingVertical: 12, paddingLeft: LOGOUT_CLEARANCE, paddingRight: SPACE.gutter },
  barInner: { alignItems: 'center', gap: 10, width: '100%', maxWidth: CONTENT_MAX, alignSelf: 'center' },
  mark: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  brandText: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, letterSpacing: -0.15 },
  column: {
    width: '100%',
    maxWidth: CONTENT_MAX,
    alignSelf: 'center',
    paddingHorizontal: SPACE.gutter,
    gap: SPACE.cardGap,
  },
  head: { alignItems: 'flex-end', flexWrap: 'wrap', gap: 16, paddingTop: 26, paddingBottom: 4 },
  headText: { flexGrow: 1, flexShrink: 1, minWidth: 220 },
  subtitle: { fontSize: 13.5, marginTop: 4 },
  grid: { gap: SPACE.cardGap },
  gridRow: { gap: SPACE.cardGap },
  iconTile: { width: 36, height: 36, borderRadius: RADIUS.card / 2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  row: { alignItems: 'center', gap: 12, paddingVertical: SPACE.rowPadV, paddingHorizontal: SPACE.rowPadH, borderTopWidth: 1 },
  cardHead: { alignItems: 'center', gap: 10, paddingTop: 16, paddingBottom: 12, paddingHorizontal: SPACE.rowPadH },
  cardHeadText: { flex: 1, minWidth: 0 },
});
