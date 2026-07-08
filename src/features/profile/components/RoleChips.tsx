import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CREW_CATEGORIES } from '@features/crew/data/categories';
import { useTheme } from '@core/hooks/useTheme';
import { useUiStore } from '@core/stores/uiStore';
import type { ProfessionalSkill } from '@core/types/user';

const CATEGORY_EMOJI: Record<string, string> = {
  'Video Photographer': '🎥',
  'Still Photographer': '📸',
  'Editor': '✂️',
  'Graphic Designer': '🎨',
  'AI Specialist': '🤖',
  'Social Media': '📱',
  'Studio & Audio': '🎵',
  'Lighting Tech': '💡',
  'Sound Recordist': '🎤',
};

type RoleChipsProps = {
  selected: ProfessionalSkill[];
  isEditing: boolean;
  onChange?: (skills: ProfessionalSkill[]) => void;
};

function isSelected(selected: ProfessionalSkill[], category: string, subcategory: string) {
  return selected.some((s) => s.category === category && s.subcategory === subcategory);
}

function toggle(selected: ProfessionalSkill[], category: string, subcategory: string): ProfessionalSkill[] {
  if (isSelected(selected, category, subcategory)) {
    return selected.filter((s) => !(s.category === category && s.subcategory === subcategory));
  }
  return [...selected, { category, subcategory }];
}

export function RoleChips({ selected, isEditing, onChange }: RoleChipsProps) {
  const colors = useTheme();
  const isDark = useUiStore((s) => s.isDark);
  const cardBg = isDark ? '#ffffff' : colors.card;

  const [expanded, setExpanded] = useState<string | null>(null);

  if (!isEditing) {
    const allChips = Object.keys(CREW_CATEGORIES).flatMap((cat) =>
      selected
        .filter((s) => s.category === cat)
        .map((s) => ({ key: `${cat}-${s.subcategory}`, label: s.subcategory }))
    );

    return (
      <View style={[styles.card, { backgroundColor: cardBg, borderColor: colors.border }]}>
        <Text style={styles.cardLabel}>Skills</Text>
        {allChips.length === 0 ? (
          <Text style={styles.empty}>No skills added yet.</Text>
        ) : (
          <View style={styles.chipsWrap}>
            {allChips.map(({ key, label }) => (
              <View key={key} style={styles.chip}>
                <Text style={styles.chipText}>{label}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: cardBg, borderColor: colors.border }]}>
      <Text style={styles.cardLabel}>Skills</Text>

      {Object.entries(CREW_CATEGORIES).map(([category, subcategories]) => {
        const open = expanded === category;
        const selectedCount = subcategories.filter((sub) =>
          isSelected(selected, category, sub)
        ).length;

        return (
          <View key={category} style={[styles.accordion, { backgroundColor: 'rgba(0,74,173,0.04)', borderColor: colors.border }]}>
            <TouchableOpacity
              style={styles.accordionHeader}
              onPress={() => setExpanded(open ? null : category)}
              activeOpacity={0.75}
            >
              <View style={styles.accordionLeft}>
                <Text style={styles.accordionEmoji}>{CATEGORY_EMOJI[category] ?? '•'}</Text>
                <Text style={styles.accordionTitle}>{category}</Text>
              </View>
              <View style={styles.accordionRight}>
                {selectedCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{selectedCount}</Text>
                  </View>
                )}
                <Text style={styles.chevron}>{open ? '▲' : '▼'}</Text>
              </View>
            </TouchableOpacity>

            {open && (
              <View style={[styles.subRow, { borderTopColor: colors.border }]}>
                {subcategories.map((sub) => {
                  const active = isSelected(selected, category, sub);
                  return (
                    <TouchableOpacity
                      key={sub}
                      style={[styles.subChip, active && styles.subChipActive]}
                      onPress={() => onChange?.(toggle(selected, category, sub))}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.subChipText, active && styles.subChipTextActive]}>
                        {sub}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#004aad',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // View mode
  empty: { color: 'rgba(0,74,173,0.4)', fontSize: 13, fontStyle: 'italic' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(0,74,173,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0,74,173,0.2)',
  },
  chipText: { fontSize: 12, color: '#004aad' },

  // Edit mode
  accordion: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  accordionLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  accordionEmoji: { fontSize: 18 },
  accordionTitle: { fontSize: 15, fontWeight: '600', color: '#004aad' },
  accordionRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: {
    backgroundColor: '#004aad',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  chevron: { fontSize: 10, color: '#004aad' },
  subRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    paddingTop: 12,
  },
  subChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,74,173,0.25)',
    backgroundColor: 'rgba(0,74,173,0.06)',
  },
  subChipActive: { backgroundColor: '#004aad', borderColor: '#004aad' },
  subChipText: { fontSize: 13, color: 'rgba(0,74,173,0.55)' },
  subChipTextActive: { color: '#fff', fontWeight: '600' },
});
