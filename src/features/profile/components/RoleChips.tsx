import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CREW_CATEGORIES } from '@features/crew/data/categories';
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
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!isEditing) {
    const byCategory = Object.keys(CREW_CATEGORIES).flatMap((cat) => {
      const subs = selected.filter((s) => s.category === cat).map((s) => s.subcategory);
      return subs.length ? [{ category: cat, subcategories: subs }] : [];
    });

    if (byCategory.length === 0) {
      return (
        <Text style={styles.empty}>No skills added yet</Text>
      );
    }

    return (
      <View style={styles.viewRoot}>
        {byCategory.map(({ category, subcategories }) => (
          <View key={category} style={styles.categoryGroup}>
            <Text style={styles.categoryLabel}>
              {CATEGORY_EMOJI[category] ?? '•'}  {category}
            </Text>
            <View style={styles.chipRow}>
              {subcategories.map((sub) => (
                <View key={sub} style={styles.chip}>
                  <Text style={styles.chipText}>{sub}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.editRoot}>
      <Text style={styles.sectionTitle}>Skills & Specializations</Text>
      {Object.entries(CREW_CATEGORIES).map(([category, subcategories]) => {
        const isOpen = expanded === category;
        const selectedCount = subcategories.filter((sub) =>
          isSelected(selected, category, sub)
        ).length;

        return (
          <View key={category} style={styles.accordion}>
            <TouchableOpacity
              style={styles.accordionHeader}
              onPress={() => setExpanded(isOpen ? null : category)}
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
                <Text style={styles.chevron}>{isOpen ? '▲' : '▼'}</Text>
              </View>
            </TouchableOpacity>

            {isOpen && (
              <View style={styles.subRow}>
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
  empty: { color: 'rgba(255,255,255,0.35)', fontSize: 14, fontStyle: 'italic' },

  // View mode
  viewRoot: { gap: 16 },
  categoryGroup: { gap: 8 },
  categoryLabel: { fontSize: 13, fontWeight: '700', color: '#cb6ce6', letterSpacing: 0.5 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#ffffff22',
  },
  chipText: { fontSize: 12, color: 'rgba(255,255,255,0.75)' },

  // Edit mode
  editRoot: { gap: 8 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#cb6ce6',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  accordion: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#ffffff12',
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
  accordionTitle: { fontSize: 15, fontWeight: '600', color: '#cb6ce6' },
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
  chevron: { fontSize: 10, color: '#888' },

  subRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: '#ffffff10',
    paddingTop: 12,
  },
  subChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#ffffff22',
    backgroundColor: '#12122a',
  },
  subChipActive: { backgroundColor: '#004aad', borderColor: '#004aad' },
  subChipText: { fontSize: 13, color: 'rgba(255,255,255,0.55)' },
  subChipTextActive: { color: '#fff', fontWeight: '600' },
});
