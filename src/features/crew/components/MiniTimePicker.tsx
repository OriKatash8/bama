import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

type Props = {
  value: string; // "HH:MM"
  onSelect: (time: string) => void;
  onClose: () => void;
};

export function MiniTimePicker({ value, onSelect, onClose }: Props) {
  const [h, m] = value ? value.split(':') : ['12', '00'];
  const [selHour, setSelHour] = useState(h ?? '12');
  const [selMin, setSelMin] = useState(m ?? '00');

  function confirm() {
    onSelect(`${selHour}:${selMin}`);
    onClose();
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.box}>
              <Text style={styles.title}>בחר שעה</Text>
              <View style={styles.columns}>
                {/* Hours */}
                <View style={styles.colWrap}>
                  <Text style={styles.colLabel}>שעה</Text>
                  <ScrollView style={styles.col} showsVerticalScrollIndicator={false}>
                    {HOURS.map((hr) => (
                      <TouchableOpacity
                        key={hr}
                        style={[styles.item, selHour === hr && styles.itemSelected]}
                        onPress={() => setSelHour(hr)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.itemText, selHour === hr && styles.itemTextSelected]}>{hr}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
                <Text style={styles.colon}>:</Text>
                {/* Minutes */}
                <View style={styles.colWrap}>
                  <Text style={styles.colLabel}>דקות</Text>
                  <ScrollView style={styles.col} showsVerticalScrollIndicator={false}>
                    {MINUTES.map((mn) => (
                      <TouchableOpacity
                        key={mn}
                        style={[styles.item, selMin === mn && styles.itemSelected]}
                        onPress={() => setSelMin(mn)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.itemText, selMin === mn && styles.itemTextSelected]}>{mn}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>
              <TouchableOpacity style={styles.confirmBtn} onPress={confirm} activeOpacity={0.8}>
                <Text style={styles.confirmText}>אישור</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  box: {
    width: 260,
    borderRadius: 16,
    borderWidth: 2,
    padding: 16,
    backgroundColor: '#ffffff',
    borderColor: '#004aad',
    alignItems: 'center',
    gap: 12,
  },
  title: { fontSize: 16, fontWeight: '700', color: '#004aad' },
  columns: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  colWrap: { alignItems: 'center', gap: 4 },
  colLabel: { fontSize: 12, fontWeight: '600', color: '#004aad', opacity: 0.6 },
  col: { height: 180, width: 72 },
  item: {
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  itemSelected: { backgroundColor: '#004aad' },
  itemText: { fontSize: 18, fontWeight: '500', color: '#004aad' },
  itemTextSelected: { color: '#ffffff' },
  colon: { fontSize: 24, fontWeight: '700', color: '#004aad', marginTop: 20 },
  confirmBtn: {
    backgroundColor: '#004aad',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 32,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  confirmText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
