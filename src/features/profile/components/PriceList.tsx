import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import type { PriceEntry } from '@core/types/project';

type PriceListProps = {
  items: PriceEntry[];
  isEditing: boolean;
  onChange?: (items: PriceEntry[]) => void;
};

export function PriceList({ items, isEditing, onChange }: PriceListProps) {
  const [service, setService] = useState('');
  const [price, setPrice] = useState('');

  function add() {
    const trimmedService = service.trim();
    const parsedPrice = parseFloat(price);
    if (!trimmedService || isNaN(parsedPrice) || !onChange) return;
    onChange([...items, { service: trimmedService, price: parsedPrice }]);
    setService('');
    setPrice('');
  }

  function remove(index: number) {
    onChange?.(items.filter((_, i) => i !== index));
  }

  return (
    <View style={styles.container}>
      {items.map((item, index) => (
        <View key={`${item.service}-${index}`} style={styles.row}>
          <Text style={styles.service}>{item.service}</Text>
          <View style={styles.right}>
            <Text style={styles.price}>${item.price.toFixed(2)}</Text>
            {isEditing && (
              <TouchableOpacity onPress={() => remove(index)} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <Text style={styles.remove}>×</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ))}
      {isEditing && (
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, styles.serviceInput]}
            value={service}
            onChangeText={setService}
            placeholder="Service"
            placeholderTextColor="#aaa"
          />
          <TextInput
            style={[styles.input, styles.priceInput]}
            value={price}
            onChangeText={setPrice}
            placeholder="Price"
            keyboardType="decimal-pad"
            placeholderTextColor="#aaa"
          />
          <TouchableOpacity style={styles.addBtn} onPress={add}>
            <Text style={styles.addBtnText}>Add</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  service: { fontSize: 14, color: '#333', flex: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  price: { fontSize: 14, fontWeight: '600', color: '#000' },
  remove: { fontSize: 20, color: '#999', paddingHorizontal: 4 },
  inputRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14 },
  serviceInput: { flex: 1 },
  priceInput: { width: 80 },
  addBtn: { backgroundColor: '#000', borderRadius: 8, paddingHorizontal: 16, justifyContent: 'center' },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
