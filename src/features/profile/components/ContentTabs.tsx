import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { EquipmentList } from './EquipmentList';
import { PriceList } from './PriceList';
import { ReviewsList } from './ReviewsList';
import type { PriceEntry, Review } from '@core/types/project';

type Tab = 'equipment' | 'priceList' | 'reviews';

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
  const [activeTab, setActiveTab] = useState<Tab>('equipment');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'equipment', label: 'Equipment' },
    { key: 'priceList', label: 'Price List' },
    { key: 'reviews', label: 'Reviews' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.pills}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.pill, activeTab === tab.key && styles.pillActive]}
            onPress={() => setActiveTab(tab.key)}
            activeOpacity={0.8}
          >
            <Text style={[styles.pillText, activeTab === tab.key && styles.pillTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View>
        {activeTab === 'equipment' && (
          <EquipmentList items={equipment} isEditing={isEditing} onChange={onEquipmentChange} />
        )}
        {activeTab === 'priceList' && (
          <PriceList items={priceList} isEditing={isEditing} onChange={onPriceListChange} />
        )}
        {activeTab === 'reviews' && <ReviewsList reviews={reviews} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  pills: {
    flexDirection: 'row',
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    padding: 4,
    gap: 4,
    borderWidth: 1,
    borderColor: '#ffffff18',
  },
  pill: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 16 },
  pillActive: { backgroundColor: '#004aad' },
  pillText: { fontSize: 13, color: 'rgba(255,255,255,0.45)', fontWeight: '500' },
  pillTextActive: { color: '#fff', fontWeight: '700' },
});
