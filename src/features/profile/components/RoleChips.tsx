import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Badge } from '@components/ui/Badge';
import type { MediaRole } from '@core/types/media';

const ALL_ROLES: MediaRole[] = [
  'photographer',
  'videographer',
  'editor',
  'producer',
  'director',
  'sound_engineer',
  'lighting_technician',
  'makeup_artist',
  'stylist',
];

const ROLE_LABELS: Record<MediaRole, string> = {
  photographer: 'Photographer',
  videographer: 'Videographer',
  editor: 'Editor',
  producer: 'Producer',
  director: 'Director',
  sound_engineer: 'Sound Engineer',
  lighting_technician: 'Lighting Tech',
  makeup_artist: 'Makeup Artist',
  stylist: 'Stylist',
};

type RoleChipsProps = {
  selected: MediaRole[];
  isEditing: boolean;
  onChange?: (roles: MediaRole[]) => void;
};

export function RoleChips({ selected, isEditing, onChange }: RoleChipsProps) {
  function toggle(role: MediaRole) {
    if (!onChange) return;
    onChange(
      selected.includes(role) ? selected.filter((r) => r !== role) : [...selected, role]
    );
  }

  if (!isEditing) {
    return (
      <View style={styles.row}>
        {selected.map((role) => (
          <Badge key={role} label={ROLE_LABELS[role]} />
        ))}
      </View>
    );
  }

  return (
    <View style={styles.row}>
      {ALL_ROLES.map((role) => {
        const active = selected.includes(role);
        return (
          <TouchableOpacity
            key={role}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => toggle(role)}
            activeOpacity={0.7}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {ROLE_LABELS[role]}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ffffff22',
    backgroundColor: '#1a1a2e',
  },
  chipActive: { backgroundColor: '#004aad', borderColor: '#004aad' },
  chipText: { fontSize: 13, color: 'rgba(255,255,255,0.6)' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
});
