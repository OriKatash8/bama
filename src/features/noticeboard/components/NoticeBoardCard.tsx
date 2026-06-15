import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { ProjectRequest } from '@core/types/project';

type Props = {
  request: ProjectRequest;
  onPress: () => void;
  onApply: () => void;
  onDismiss: () => void;
  isApplying: boolean;
};

export function NoticeBoardCard({ request, onPress, onApply, onDismiss, isApplying }: Props) {
  const roleCount = request.crewSlots.reduce((sum, s) => sum + s.quantity, 0);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.top}>
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>{request.title}</Text>
          <Text style={styles.location}>📍 {request.location}</Text>
          <Text style={styles.meta}>{request.date}  ·  {roleCount} role{roleCount === 1 ? '' : 's'}  ·  ${request.budget.toLocaleString()}</Text>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.applyBtn, isApplying && styles.disabled]}
            onPress={(e) => { e.stopPropagation?.(); onApply(); }}
            disabled={isApplying}
            activeOpacity={0.8}
          >
            <Text style={styles.applyIcon}>✓</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.dismissBtn]}
            onPress={(e) => { e.stopPropagation?.(); onDismiss(); }}
            activeOpacity={0.8}
          >
            <Text style={styles.dismissIcon}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  info: { flex: 1 },
  title: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 4 },
  location: { fontSize: 13, color: '#555', marginBottom: 3 },
  meta: { fontSize: 12, color: '#888' },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyBtn: { backgroundColor: '#e8f5e9', borderWidth: 1.5, borderColor: '#4caf50' },
  dismissBtn: { backgroundColor: '#fdecea', borderWidth: 1.5, borderColor: '#e53e3e' },
  disabled: { opacity: 0.5 },
  applyIcon: { fontSize: 16, color: '#2e7d32', fontWeight: '700' },
  dismissIcon: { fontSize: 14, color: '#e53e3e', fontWeight: '700' },
});
