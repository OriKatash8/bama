import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform } from 'react-native';
import type { ProjectRequest } from '@core/types/project';

type Props = {
  request: ProjectRequest | null;
  onClose: () => void;
  onApply: () => void;
  onDismiss: () => void;
  isApplying: boolean;
};

export function ProjectDetailModal({ request, onClose, onApply, onDismiss, isApplying }: Props) {
  if (!request) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>{request.title}</Text>

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Date</Text>
              <Text style={styles.metaValue}>{request.date}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Location</Text>
              <Text style={styles.metaValue}>{request.location}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Budget</Text>
              <Text style={styles.metaValue}>${request.budget.toLocaleString()}</Text>
            </View>
          </View>

          <Text style={styles.sectionLabel}>Description</Text>
          <Text style={styles.description}>{request.description}</Text>

          <Text style={styles.sectionLabel}>Roles Needed</Text>
          {request.crewSlots.map((s, i) => (
            <View key={i} style={styles.slotRow}>
              <Text style={styles.slotQty}>{s.quantity}×</Text>
              <View>
                <Text style={styles.slotSub}>{s.subcategory}</Text>
                <Text style={styles.slotCat}>{s.category}</Text>
              </View>
            </View>
          ))}

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.applyBtn, isApplying && styles.disabled]}
              onPress={onApply}
              disabled={isApplying}
              activeOpacity={0.8}
            >
              <Text style={styles.applyText}>{isApplying ? 'Sending…' : '✓  Apply for this project'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.dismissBtn} onPress={onDismiss} activeOpacity={0.8}>
              <Text style={styles.dismissText}>✕  Not interested</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 36,
    maxHeight: '85%',
    ...(Platform.OS === 'web' ? { maxWidth: 540, alignSelf: 'center' as any, width: '100%', borderRadius: 20, bottom: 'auto' as any, top: '50%' as any, transform: [{ translateY: -50 }] } : {}),
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: { fontSize: 22, fontWeight: '800', color: '#111', marginBottom: 16 },
  metaRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  metaItem: { flex: 1, backgroundColor: '#f5f5f5', borderRadius: 10, padding: 10 },
  metaLabel: { fontSize: 11, color: '#888', fontWeight: '600', marginBottom: 2, textTransform: 'uppercase' },
  metaValue: { fontSize: 14, color: '#111', fontWeight: '600' },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#888', textTransform: 'uppercase', marginBottom: 8 },
  description: { fontSize: 15, color: '#333', lineHeight: 22, marginBottom: 20 },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  slotQty: { fontSize: 18, fontWeight: '800', color: '#004aad', width: 32 },
  slotSub: { fontSize: 15, fontWeight: '600', color: '#111' },
  slotCat: { fontSize: 12, color: '#888', marginTop: 1 },
  actions: { marginTop: 24, gap: 10 },
  applyBtn: {
    backgroundColor: '#004aad',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  disabled: { backgroundColor: '#aaa' },
  applyText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  dismissBtn: {
    borderWidth: 1.5,
    borderColor: '#e53e3e',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  dismissText: { color: '#e53e3e', fontSize: 15, fontWeight: '600' },
});
