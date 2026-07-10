import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput,
} from 'react-native';
import { Wrench, List, Star } from 'lucide-react-native';
import { ReviewsList } from './ReviewsList';
import { useTheme } from '@core/hooks/useTheme';
import { useUiStore } from '@core/stores/uiStore';
import type { PriceEntry, Review } from '@core/types/project';

type SectionKey = 'equipment' | 'priceList' | 'reviews';

const SECTIONS: { key: SectionKey; label: string; Icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }> }[] = [
  { key: 'equipment', label: 'Equipment', Icon: Wrench },
  { key: 'priceList', label: 'Price List', Icon: List },
  { key: 'reviews',   label: 'Reviews',   Icon: Star },
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
  const colors = useTheme();
  const isDark = useUiStore((s) => s.isDark);
  const cardBg = isDark ? '#1a1a2e' : '#ffffff';

  const [active, setActive] = useState<SectionKey>('equipment');
  const [newEquipment, setNewEquipment] = useState('');
  const [newService, setNewService] = useState('');
  const [newPrice, setNewPrice] = useState('');

  const activeSection = SECTIONS.find((s) => s.key === active)!;
  const ActiveIcon = activeSection.Icon;

  function addEquipment() {
    const trimmed = newEquipment.trim();
    if (!trimmed || !onEquipmentChange) return;
    onEquipmentChange([...equipment, trimmed]);
    setNewEquipment('');
  }

  function addPriceEntry() {
    const trimmedService = newService.trim();
    const parsedPrice = parseFloat(newPrice);
    if (!trimmedService || isNaN(parsedPrice) || !onPriceListChange) return;
    onPriceListChange([...priceList, { service: trimmedService, price: parsedPrice }]);
    setNewService('');
    setNewPrice('');
  }

  return (
    <View>

      {/* ── Tab bar (no card background) ── */}
      <View style={styles.tabBar}>
        {SECTIONS.map(({ key, label }) => {
          const isActive = key === active;
          return (
            <TouchableOpacity
              key={key}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => setActive(key)}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, { color: isActive ? '#fff' : 'rgba(0,74,173,0.45)' }]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Content card ── */}
      <View style={[styles.panel, { backgroundColor: cardBg, borderColor: colors.border }]}>

        {/* Section header */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: '#004aad' }]}>{activeSection.label}</Text>
          <ActiveIcon size={18} color="#004aad" strokeWidth={1.8} />
        </View>

        {/* Equipment */}
        {active === 'equipment' && (
          <>
            {equipment.length === 0 && (
              <Text style={styles.empty}>No equipment yet.</Text>
            )}
            <View style={styles.list}>
              {equipment.map((item, index) => (
                <View
                  key={`eq-${index}`}
                  style={[
                    styles.itemRow,
                    { borderBottomColor: colors.border },
                    index === 0 && styles.firstRow,
                    index === equipment.length - 1 ? styles.lastRow : styles.rowBorder,
                  ]}
                >
                  {isEditing && (
                    <TouchableOpacity
                      onPress={() => onEquipmentChange?.(equipment.filter((_, i) => i !== index))}
                      hitSlop={8}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.removeBtn}>×</Text>
                    </TouchableOpacity>
                  )}
                  <Text style={styles.itemText}>{item}</Text>
                </View>
              ))}
            </View>
            {isEditing && (
              <View style={styles.addRow}>
                <TouchableOpacity style={styles.addBtn} onPress={addEquipment} activeOpacity={0.8}>
                  <Text style={styles.addBtnText}>+</Text>
                </TouchableOpacity>
                <TextInput
                  style={[styles.addInput, { borderColor: colors.border }]}
                  value={newEquipment}
                  onChangeText={setNewEquipment}
                  placeholder="Add item..."
                  placeholderTextColor="rgba(0,74,173,0.4)"
                  onSubmitEditing={addEquipment}
                  returnKeyType="done"
                />
              </View>
            )}
          </>
        )}

        {/* Price List */}
        {active === 'priceList' && (
          <>
            {priceList.length === 0 && (
              <Text style={styles.empty}>No price entries yet.</Text>
            )}
            <View style={styles.list}>
              {priceList.map((entry, index) => (
                <View
                  key={`pl-${index}`}
                  style={[
                    styles.itemRow,
                    { borderBottomColor: colors.border },
                    index === 0 && styles.firstRow,
                    index === priceList.length - 1 ? styles.lastRow : styles.rowBorder,
                  ]}
                >
                  {isEditing && (
                    <TouchableOpacity
                      onPress={() => onPriceListChange?.(priceList.filter((_, i) => i !== index))}
                      hitSlop={8}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.removeBtn}>×</Text>
                    </TouchableOpacity>
                  )}
                  <Text style={styles.priceLabel}>${entry.price.toFixed(0)}</Text>
                  <Text style={styles.itemText}>{entry.service}</Text>
                </View>
              ))}
            </View>
            {isEditing && (
              <View style={styles.addRow}>
                <TouchableOpacity style={styles.addBtn} onPress={addPriceEntry} activeOpacity={0.8}>
                  <Text style={styles.addBtnText}>+</Text>
                </TouchableOpacity>
                <TextInput
                  style={[styles.addInput, styles.priceInput, { borderColor: colors.border }]}
                  value={newPrice}
                  onChangeText={setNewPrice}
                  placeholder="Price"
                  placeholderTextColor="rgba(0,74,173,0.4)"
                  keyboardType="decimal-pad"
                />
                <TextInput
                  style={[styles.addInput, { borderColor: colors.border }]}
                  value={newService}
                  onChangeText={setNewService}
                  placeholder="Add service..."
                  placeholderTextColor="rgba(0,74,173,0.4)"
                  onSubmitEditing={addPriceEntry}
                  returnKeyType="done"
                />
              </View>
            )}
          </>
        )}

        {/* Reviews */}
        {active === 'reviews' && <ReviewsList reviews={reviews} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /* Tab bar — no card background */
  tabBar: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  tabActive: {
    backgroundColor: '#cb6ce6',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
  },

  /* Content card */
  panel: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'right',
    color: '#004aad',
  },

  /* Item list */
  list: { borderRadius: 8, overflow: 'hidden' },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,74,173,0.06)',
    gap: 8,
  },
  firstRow: {
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  lastRow: {
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  itemText: {
    flex: 1,
    fontSize: 14,
    color: '#004aad',
    textAlign: 'right',
  },
  priceLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#004aad',
    minWidth: 48,
    textAlign: 'right',
  },
  removeBtn: {
    fontSize: 20,
    color: '#e53935',
    fontWeight: '700',
    lineHeight: 22,
    paddingHorizontal: 2,
  },

  /* Add row */
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#004aad',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 24,
  },
  addInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#004aad',
    backgroundColor: 'rgba(0,74,173,0.06)',
  },
  priceInput: { flex: 0, width: 72 },

  empty: {
    textAlign: 'center',
    fontSize: 14,
    color: 'rgba(0,74,173,0.4)',
    paddingVertical: 12,
  },
});
