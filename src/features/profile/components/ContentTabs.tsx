import { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { EquipmentList } from './EquipmentList';
import { PriceList } from './PriceList';
import { ReviewsList } from './ReviewsList';
import type { PriceEntry, Review } from '@core/types/project';

type SectionKey = 'equipment' | 'priceList' | 'reviews';

const SECTIONS: { key: SectionKey; label: string; emoji: string; color: string }[] = [
  { key: 'equipment', label: 'Equipment', emoji: '🎛️', color: '#004aad' },
  { key: 'priceList', label: 'Price List', emoji: '💰', color: '#cb6ce6' },
  { key: 'reviews',   label: 'Reviews',    emoji: '⭐', color: '#c49a00' },
];

type ContentTabsProps = {
  equipment: string[];
  priceList: PriceEntry[];
  reviews: Review[];
  isEditing: boolean;
  onEquipmentChange?: (items: string[]) => void;
  onPriceListChange?: (items: PriceEntry[]) => void;
};

export function ContentTabs({
  equipment,
  priceList,
  reviews,
  isEditing,
  onEquipmentChange,
  onPriceListChange,
}: ContentTabsProps) {
  const [open, setOpen] = useState<SectionKey | null>(null);

  function toggle(key: SectionKey) {
    setOpen((prev) => (prev === key ? null : key));
  }

  const activeSection = SECTIONS.find((s) => s.key === open);

  return (
    <View style={styles.container}>
      {/* Single row of titles */}
      <View style={styles.row}>
        {SECTIONS.map((section) => {
          const isActive = open === section.key;
          return (
            <TouchableOpacity
              key={section.key}
              style={[
                styles.tab,
                { borderColor: isActive ? '#cb6ce6' : '#ffffff18' },
              ]}
              onPress={() => toggle(section.key)}
              activeOpacity={0.8}
            >
              <Text style={styles.tabEmoji}>{section.emoji}</Text>
              <Text style={[styles.tabLabel, { color: isActive ? '#cb6ce6' : 'rgba(255,255,255,0.5)' }]}>
                {section.label}
              </Text>
              <Text style={[styles.chevron, { color: isActive ? '#cb6ce6' : 'rgba(255,255,255,0.3)' }]}>
                {isActive ? '▲' : '▼'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content panel below the row */}
      {open && activeSection && (
        <View style={[styles.panel, { borderColor: '#cb6ce6' }]}>
          {open === 'equipment' && (
            <EquipmentList items={equipment} isEditing={isEditing} onChange={onEquipmentChange} />
          )}
          {open === 'priceList' && (
            <PriceList items={priceList} isEditing={isEditing} onChange={onPriceListChange} />
          )}
          {open === 'reviews' && <ReviewsList reviews={reviews} />}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 0 },

  row: {
    flexDirection: 'row',
    gap: 8,
  },

  tab: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderWidth: 1.5,
    borderRadius: 14,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    backgroundColor: '#12122a',
  },

  tabEmoji: { fontSize: 18 },
  tabLabel: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  chevron: { fontSize: 9, fontWeight: '700' },

  panel: {
    borderWidth: 1.5,
    borderTopWidth: 0,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    backgroundColor: '#12122a',
    padding: 16,
  },
});
