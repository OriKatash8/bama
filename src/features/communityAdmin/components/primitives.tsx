import { useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type TextProps, type TextStyle, type ViewStyle } from 'react-native';
import { useAdminPalette } from '../i18n';
import {
  AVATAR_COLORS,
  AVATAR_TEXT,
  HEEBO,
  RADIUS,
  SPACE,
  TABULAR,
  TYPE,
  attentionRing,
  cardShadow,
  liftShadow,
  type HeeboWeight,
} from '../theme';

const WEIGHT_NUM: Record<HeeboWeight, TextStyle['fontWeight']> = {
  regular: '400',
  medium: '500',
  semiBold: '600',
  bold: '700',
};

type AdminTextProps = TextProps & { weight?: HeeboWeight; tabular?: boolean };

/** Heebo in every script, text colour by default. */
export function AdminText({ weight = 'regular', tabular, style, ...rest }: AdminTextProps) {
  const p = useAdminPalette();
  return (
    <Text
      {...rest}
      style={[
        { color: p.text, fontFamily: HEEBO[weight], fontWeight: WEIGHT_NUM[weight] },
        tabular && TABULAR,
        style,
      ]}
    />
  );
}

export function Card({
  children,
  priority,
  ring,
  style,
  testID,
}: {
  children: ReactNode;
  /** The join-requests card: lifted shadow + amber ring. */
  priority?: boolean;
  /** Amber ring on the normal shadow (the requests tile while count > 0). */
  ring?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const p = useAdminPalette();
  const ringed = priority || ring;
  const base = priority ? liftShadow(p) : cardShadow(p);
  const shadow = ringed ? attentionRing(p, base) : base;
  // Native has no inset shadow: the ring is the inner view's 1px border instead.
  const borderColor = ringed && Platform.OS !== 'web' ? p.priorityRing : p.border;
  // Shadow on the outer view, clipping on the inner one: on iOS `overflow:
  // hidden` would clip the card's own shadow away.
  return (
    <View testID={testID} style={[styles.cardOuter, { backgroundColor: p.surface }, shadow, style]}>
      <View style={[styles.cardInner, { borderColor }]}>{children}</View>
    </View>
  );
}

export function initialsOf(name: string): string {
  const letters = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => [...w][0]);
  return letters.join('').toUpperCase() || '?';
}

/** Same name, same colour — a stable hash, not a random pick. */
export function avatarColor(name: string): string {
  const sum = [...name].reduce((a, c) => a + (c.codePointAt(0) ?? 0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

export function InitialsAvatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <View
      style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: avatarColor(name) }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <AdminText weight="semiBold" style={[styles.avatarText, { color: AVATAR_TEXT }]}>
        {initialsOf(name)}
      </AdminText>
    </View>
  );
}

type Variant = 'primary' | 'ghost' | 'danger';

export function PillButton({
  label,
  onPress,
  variant = 'ghost',
  disabled,
  testID,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const p = useAdminPalette();
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => {
        const hot = pressed || hovered;
        const look: ViewStyle =
          variant === 'primary'
            ? { backgroundColor: p.accent, ...liftShadowSmall(p.accent) }
            : variant === 'danger'
              ? { backgroundColor: hot ? p.bad : p.badBg }
              : { backgroundColor: hot ? p.borderStrong : p.surface3 };
        return [
          styles.pill,
          look,
          { opacity: disabled ? 0.4 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] },
        ];
      }}
    >
      {({ pressed }) => {
        const hot = pressed || hovered;
        const color =
          variant === 'primary' ? p.onAccent : variant === 'danger' ? (hot ? p.onAccent : p.bad) : hot ? p.text : p.text2;
        return (
          <AdminText weight="semiBold" style={[TYPE.button, { color }]}>
            {label}
          </AdminText>
        );
      }}
    </Pressable>
  );
}

/** The accent button's glow: `0 2px 8px -3px accent@.7`. */
function liftShadowSmall(color: string): ViewStyle {
  if (Platform.OS === 'web') return { boxShadow: `0 2px 8px -3px ${color}` } as ViewStyle;
  if (Platform.OS === 'android') return { elevation: 2 };
  return { shadowColor: color, shadowOpacity: 0.45, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } };
}

export function Chip({ label, tone = 'neutral', tabular }: { label: string; tone?: 'neutral' | 'accent'; tabular?: boolean }) {
  const p = useAdminPalette();
  return (
    <View style={[styles.chip, { backgroundColor: tone === 'accent' ? p.accentSoft : p.surface3 }]}>
      <AdminText
        weight={tone === 'accent' ? 'semiBold' : 'medium'}
        tabular={tabular}
        numberOfLines={1}
        style={[TYPE.chip, { color: tone === 'accent' ? p.accent : p.text2 }]}
      >
        {label}
      </AdminText>
    </View>
  );
}

export function CountBadge({ n, testID }: { n: number; testID?: string }) {
  const p = useAdminPalette();
  return (
    <View testID={testID} style={[styles.badge, { backgroundColor: p.warnBg }]}>
      <AdminText weight="bold" tabular style={[TYPE.chip, { color: p.warn }]}>
        {n}
      </AdminText>
    </View>
  );
}

/**
 * The row both lists share: 11/18 padding, a top hairline, 12 gap, surface2
 * on hover. The text block (`flex: 1, minWidth: 0`) must be the only flexible
 * child; everything beside it is fixed width, or the buttons get clipped.
 */
export function Row({ children, rowDir, testID }: { children: ReactNode; rowDir: 'row' | 'row-reverse'; testID?: string }) {
  const p = useAdminPalette();
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      testID={testID}
      accessible={false}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[
        styles.row,
        { flexDirection: rowDir, borderTopColor: p.border, backgroundColor: hovered ? p.surface2 : 'transparent' },
      ]}
    >
      {children}
    </Pressable>
  );
}

/** Name over meta, both single-line with an ellipsis. */
export function WhoBlock({ name, meta, textAlign }: { name: string; meta: string; textAlign: 'left' | 'right' }) {
  const p = useAdminPalette();
  return (
    <View style={styles.who}>
      <AdminText weight="semiBold" numberOfLines={1} style={[TYPE.rowName, { textAlign }]}>
        {name}
      </AdminText>
      {meta ? (
        <AdminText numberOfLines={1} style={[TYPE.rowMeta, { color: p.text3, textAlign }]}>
          {meta}
        </AdminText>
      ) : null}
    </View>
  );
}

export function EmptyState({ text, testID }: { text: string; testID?: string }) {
  const p = useAdminPalette();
  return (
    <View testID={testID} style={[styles.empty, { borderTopColor: p.border }]}>
      <AdminText style={[styles.emptyText, { color: p.text3 }]}>{text}</AdminText>
    </View>
  );
}

const styles = StyleSheet.create({
  cardOuter: { borderRadius: RADIUS.card },
  cardInner: { borderRadius: RADIUS.card, borderWidth: 1, overflow: 'hidden', flexGrow: 1 },
  avatar: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { fontSize: 13, letterSpacing: 0.2 },
  pill: { borderRadius: RADIUS.pill, paddingVertical: 6, paddingHorizontal: 14, flexShrink: 0 },
  chip: { borderRadius: RADIUS.pill, paddingVertical: 3, paddingHorizontal: 9, flexShrink: 0 },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: SPACE.rowPadV,
    paddingHorizontal: SPACE.rowPadH,
    borderTopWidth: 1,
  },
  who: { flex: 1, minWidth: 0 },
  empty: { paddingVertical: 26, paddingHorizontal: 18, borderTopWidth: 1, alignItems: 'center' },
  emptyText: { fontSize: 13, textAlign: 'center' },
});
