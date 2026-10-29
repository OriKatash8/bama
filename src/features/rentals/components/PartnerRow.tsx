import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { BadgeCheck } from 'lucide-react-native';
import { AppText } from '@components/ui/AppText';
import { tabSwipeLockProps } from '@core/navigation/pagerSwipeLock';
import { shadow } from '@core/theme/shadow';
import type { RentalCompany } from '../types';

const BLUE = '#1D4ED8';

/** Up to two letters for a company with no logo. */
function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase();
}

/**
 * The rental tab's partner companies: logo, name, city and a "BAMA partner"
 * badge. Tapping one shows only its items; tapping it again shows everyone's.
 */
export function PartnerRow({
  companies,
  selectedId,
  onSelect,
  rtl,
  title,
  badge,
}: {
  companies: RentalCompany[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  rtl: boolean;
  title: string;
  badge: string;
}) {
  if (companies.length === 0) return null;
  return (
    <View style={styles.wrap} testID="partner-row">
      <AppText weight="semiBold" style={[styles.title, { textAlign: rtl ? 'right' : 'left' }]}>{title}</AppText>
      <ScrollView
        horizontal
        {...tabSwipeLockProps}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.row, { flexDirection: rtl ? 'row-reverse' : 'row' }]}
      >
        {companies.map((c) => {
          const on = c.id === selectedId;
          return (
            <TouchableOpacity
              key={c.id}
              testID={`partner-${c.id}`}
              onPress={() => onSelect(on ? null : c.id)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${c.name}, ${c.city}`}
              style={[styles.card, on && styles.cardOn, { flexDirection: rtl ? 'row-reverse' : 'row' }]}
            >
              {c.logoUrl ? (
                <Image source={{ uri: c.logoUrl }} style={styles.logo} contentFit="contain" cachePolicy="memory-disk" />
              ) : (
                <View style={[styles.logo, styles.initials]}>
                  <AppText weight="bold" style={styles.initialsText}>{initials(c.name)}</AppText>
                </View>
              )}
              <View style={styles.info}>
                <AppText weight="bold" numberOfLines={1} style={[styles.name, { textAlign: rtl ? 'right' : 'left' }]}>{c.name}</AppText>
                {!!c.city && (
                  <AppText numberOfLines={1} style={[styles.city, { textAlign: rtl ? 'right' : 'left' }]}>{c.city}</AppText>
                )}
                <View style={[styles.badge, { flexDirection: rtl ? 'row-reverse' : 'row', alignSelf: rtl ? 'flex-end' : 'flex-start' }]}>
                  <BadgeCheck size={12} color={BLUE} strokeWidth={2.4} />
                  <AppText weight="semiBold" style={styles.badgeText}>{badge}</AppText>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 6, marginBottom: 4, gap: 8 },
  title: { fontSize: 14, color: '#000000' },
  row: { gap: 10, paddingVertical: 4, paddingHorizontal: 2 },
  card: {
    alignItems: 'center',
    gap: 10,
    width: 220,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#EFEDF5',
    backgroundColor: '#FFFFFF',
    ...shadow({ color: '#4C1D95', opacity: 0.05, radius: 5, offsetX: 0, offsetY: 2, elevation: 2 }),
  },
  cardOn: { borderColor: BLUE },
  logo: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#F3EEFE' },
  initials: { alignItems: 'center', justifyContent: 'center' },
  initialsText: { fontSize: 15, color: BLUE },
  info: { flex: 1, minWidth: 0, gap: 1 },
  name: { fontSize: 13, color: '#000000' },
  city: { fontSize: 11, color: '#555555' },
  badge: { alignItems: 'center', gap: 3, marginTop: 2, backgroundColor: '#E6EDFC', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { fontSize: 10, color: BLUE },
});
