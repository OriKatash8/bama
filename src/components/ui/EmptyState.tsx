import { View, TouchableOpacity, StyleSheet } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { AppText } from '@components/ui/AppText';
import { useTheme } from '@core/hooks/useTheme';
import { useSettingsStore } from '@core/stores/settingsStore';

type Action = { label: string; onPress: () => void; icon?: LucideIcon };

type Props = {
  icon: LucideIcon;
  title: string;
  description: string;
  primaryAction: Action;
  secondaryAction?: Action;
};

/**
 * Illustrated empty-state block: icon in a soft tinted circle, headline,
 * one-line description, a primary pill button and an optional secondary text
 * link. Centers within the space it's given (flex:1). RTL-safe.
 */
export function EmptyState({ icon: Icon, title, description, primaryAction, secondaryAction }: Props) {
  const colors = useTheme();
  const rtl = useSettingsStore((s) => s.language) === 'he';
  const PrimaryIcon = primaryAction.icon;
  return (
    <View style={styles.container}>
      <View style={[styles.iconCircle, { backgroundColor: colors.card }]}>
        <Icon size={32} color={colors.primary} strokeWidth={1.8} />
      </View>
      <AppText weight="medium" style={[styles.title, { color: colors.text }]}>
        {title}
      </AppText>
      <AppText weight="regular" style={[styles.description, { color: colors.textMuted }]}>
        {description}
      </AppText>
      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: colors.primary, flexDirection: rtl ? 'row-reverse' : 'row' }]}
        onPress={primaryAction.onPress}
        activeOpacity={0.85}
        accessibilityRole="button"
      >
        {PrimaryIcon && <PrimaryIcon size={16} color="#ffffff" strokeWidth={2} />}
        <AppText weight="medium" style={styles.primaryText}>{primaryAction.label}</AppText>
      </TouchableOpacity>
      {secondaryAction && (
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={secondaryAction.onPress}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <AppText weight="regular" style={[styles.secondaryText, { color: colors.primary }]}>
            {secondaryAction.label}
          </AppText>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: { fontSize: 15, fontWeight: '500', marginBottom: 6, textAlign: 'center' },
  description: { fontSize: 13, lineHeight: 20, textAlign: 'center', maxWidth: 220, marginBottom: 16 },
  primaryBtn: {
    borderRadius: 16,
    paddingVertical: 11,
    paddingHorizontal: 22,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  primaryText: { color: '#ffffff', fontSize: 13, fontWeight: '500' },
  secondaryBtn: { marginTop: 12, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 13 },
});
