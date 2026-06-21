import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { ProjectRequest } from '@core/types/project';
import { getVacantSlots } from '@features/noticeboard/hooks/useNoticeboard';
import { useTheme } from '@core/hooks/useTheme';

type Props = {
  request: ProjectRequest;
  onPress: () => void;
  onApply: () => void;
  onDismiss: () => void;
  onMakeOffer: () => void;
  isApplying: boolean;
};

export function NoticeBoardCard({ request, onPress, onApply, onDismiss, onMakeOffer, isApplying }: Props) {
  const roleCount = getVacantSlots(request).reduce((sum, s) => sum + s.quantity, 0);
  const colors = useTheme();

  return (
    <TouchableOpacity style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.top}>
        <View style={styles.info}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{request.title}</Text>
          <Text style={[styles.location, { color: colors.textMuted }]}>📍 {request.location}</Text>
          <Text style={[styles.meta, { color: colors.textMuted }]}>{request.date}  ·  {roleCount} role{roleCount === 1 ? '' : 's'}</Text>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.offerBtn]}
            onPress={(e) => { e.stopPropagation?.(); onMakeOffer(); }}
            activeOpacity={0.8}
          >
            <Text style={styles.offerIcon}>$</Text>
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
    borderRadius: 14,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 6,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  info: { flex: 1 },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  location: { fontSize: 13, marginBottom: 3 },
  meta: { fontSize: 12 },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offerBtn: { backgroundColor: 'rgba(0,74,173,0.15)', borderWidth: 1.5, borderColor: '#004aad' },
  dismissBtn: { backgroundColor: 'rgba(229,57,53,0.15)', borderWidth: 1.5, borderColor: '#e53935' },
  disabled: { opacity: 0.5 },
  offerIcon: { fontSize: 16, color: '#004aad', fontWeight: '800' },
  dismissIcon: { fontSize: 14, color: '#e53935', fontWeight: '700' },
});
