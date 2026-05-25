import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';

type EquipmentListProps = {
  items: string[];
  isEditing: boolean;
  onChange?: (items: string[]) => void;
};

export function EquipmentList({ items, isEditing, onChange }: EquipmentListProps) {
  const [input, setInput] = useState('');

  function add() {
    const trimmed = input.trim();
    if (!trimmed || !onChange) return;
    onChange([...items, trimmed]);
    setInput('');
  }

  function remove(index: number) {
    onChange?.(items.filter((_, i) => i !== index));
  }

  return (
    <View style={styles.container}>
      {items.map((item, index) => (
        <View key={`${item}-${index}`} style={styles.row}>
          <Text style={styles.item}>{item}</Text>
          {isEditing && (
            <TouchableOpacity onPress={() => remove(index)} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <Text style={styles.remove}>×</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}
      {isEditing && (
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Add equipment..."
            placeholderTextColor="#aaa"
            onSubmitEditing={add}
            returnKeyType="done"
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
  item: { fontSize: 14, color: '#333', flex: 1 },
  remove: { fontSize: 20, color: '#999', paddingHorizontal: 4 },
  inputRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  addBtn: { backgroundColor: '#000', borderRadius: 8, paddingHorizontal: 16, justifyContent: 'center' },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
