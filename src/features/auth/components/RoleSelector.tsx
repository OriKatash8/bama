import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { UserRole } from '@core/types/user';

type RoleSelectorProps = {
  value: UserRole;
  onChange: (role: UserRole) => void;
};

export function RoleSelector({ value, onChange }: RoleSelectorProps) {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.option, value === 'client' && styles.active]}
        onPress={() => onChange('client')}
        activeOpacity={0.8}
      >
        <Text style={[styles.label, value === 'client' && styles.activeLabel]}>Client</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.option, value === 'professional' && styles.active]}
        onPress={() => onChange('professional')}
        activeOpacity={0.8}
      >
        <Text style={[styles.label, value === 'professional' && styles.activeLabel]}>
          Professional
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    overflow: 'hidden',
  },
  option: { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: '#fff' },
  active: { backgroundColor: '#000' },
  label: { fontSize: 14, fontWeight: '500', color: '#333' },
  activeLabel: { color: '#fff' },
});
