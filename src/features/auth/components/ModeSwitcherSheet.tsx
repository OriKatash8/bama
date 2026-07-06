import { Modal, View, Text, TouchableOpacity, StyleSheet, Pressable } from 'react-native';
import { useAuthStore } from '@core/stores/authStore';
import { useSwitchMode } from '@features/auth/hooks/useSwitchMode';
import type { ActiveMode } from '@core/types/user';

type Props = {
  visible: boolean;
  onClose: () => void;
};

const MODES: { mode: ActiveMode; title: string; subtitle: string }[] = [
  { mode: 'professional', title: 'Professional', subtitle: 'Manage your portfolio, receive bookings' },
  { mode: 'client', title: 'Client', subtitle: 'Browse professionals, build your crew' },
];

export function ModeSwitcherSheet({ visible, onClose }: Props) {
  const activeMode = useAuthStore((s) => s.activeMode);
  const { switchMode } = useSwitchMode();

  function handleSelect(mode: ActiveMode) {
    if (mode !== activeMode) {
      switchMode(mode);
    }
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>Switch Account</Text>
        {MODES.map(({ mode, title, subtitle }) => {
          const isActive = mode === activeMode;
          return (
            <TouchableOpacity
              key={mode}
              style={[styles.card, isActive && styles.cardActive]}
              onPress={() => handleSelect(mode)}
              activeOpacity={0.7}
            >
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{title}</Text>
                <Text style={[styles.cardSubtitle, isActive && styles.cardSubtitleActive]}>
                  {isActive ? 'Active now' : subtitle}
                </Text>
              </View>
              {isActive ? (
                <Text style={styles.check}>✓</Text>
              ) : (
                <Text style={styles.arrow}>→</Text>
              )}
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity style={styles.cancel} onPress={onClose} activeOpacity={0.7}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    gap: 12,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: '#444',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 8,
  },
  title: {
    color: '#888',
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 4,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e1e30',
    borderWidth: 1.5,
    borderColor: '#333',
    borderRadius: 14,
    padding: 14,
  },
  cardActive: { borderColor: '#6c47ff' },
  cardText: { flex: 1 },
  cardTitle: { color: '#fff', fontSize: 14, fontWeight: '600' },
  cardSubtitle: { color: '#888', fontSize: 11, marginTop: 2 },
  cardSubtitleActive: { color: '#6c47ff' },
  check: { color: '#6c47ff', fontSize: 16, fontWeight: '700' },
  arrow: { color: '#555', fontSize: 16 },
  cancel: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 4,
  },
  cancelText: { color: '#888', fontSize: 15, fontWeight: '500' },
});
