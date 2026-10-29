import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { AppText } from '@components/ui/AppText';
import type { RentalCompany } from '../types';

const BLUE = '#1D4ED8';

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase();
}

/**
 * The filter popup's "Rental company" choice: "All", then each partner with its
 * logo (or initials) and name. Single-select; the same companyId the partner
 * row sets, so the two always agree.
 */
export function CompanyFilterChips({
  companies,
  value,
  onChange,
  allLabel,
  rtl,
}: {
  companies: RentalCompany[];
  value: string | null;
  onChange: (companyId: string | null) => void;
  allLabel: string;
  rtl: boolean;
}) {
  const options: { id: string | null; name: string; logoUrl: string | null }[] = [
    { id: null, name: allLabel, logoUrl: null },
    ...companies.map((c) => ({ id: c.id as string | null, name: c.name, logoUrl: c.logoUrl })),
  ];
  return (
    <View style={[styles.row, { flexDirection: rtl ? 'row-reverse' : 'row' }]} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <TouchableOpacity
            key={o.id ?? 'all'}
            testID={`filter-company-${o.id ?? 'all'}`}
            onPress={() => onChange(o.id)}
            activeOpacity={0.8}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, checked: on }}
            style={[styles.chip, on && styles.chipOn, { flexDirection: rtl ? 'row-reverse' : 'row' }]}
          >
            {o.id !== null && (o.logoUrl ? (
              <Image source={{ uri: o.logoUrl }} style={styles.logo} contentFit="contain" cachePolicy="memory-disk" />
            ) : (
              <View style={[styles.logo, styles.initials, on && styles.initialsOn]}>
                <AppText weight="bold" style={[styles.initialsText, on && styles.textOn]}>{initials(o.name)}</AppText>
              </View>
            ))}
            <AppText weight="semiBold" numberOfLines={1} style={[styles.label, on && styles.textOn]}>{o.name}</AppText>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // Same chip as the popup's other sections (index.tsx filterChip).
  row: { flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: {
    alignItems: 'center',
    gap: 6,
    maxWidth: 240,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BLUE,
    backgroundColor: '#ffffff',
  },
  chipOn: { backgroundColor: BLUE },
  logo: { width: 20, height: 20, borderRadius: 5 },
  initials: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#E6EDFC' },
  initialsOn: { backgroundColor: 'rgba(255,255,255,0.25)' },
  initialsText: { fontSize: 9, color: BLUE },
  label: { fontSize: 13, color: '#000000', flexShrink: 1 },
  textOn: { color: '#ffffff' },
});
