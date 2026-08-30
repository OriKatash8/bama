import type { ReactNode } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Check } from 'lucide-react-native';

type Props = {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: ReactNode;
};

export function Checkbox({ checked, onChange, label }: Props) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => onChange(!checked)}
      activeOpacity={0.7}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked && <Check size={13} color="#ffffff" strokeWidth={2.5} />}
      </View>
      {label != null && <View style={styles.labelWrap}>{label}</View>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  box: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.3)',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  boxChecked: {
    backgroundColor: '#004aad',
    borderColor: '#004aad',
  },
  labelWrap: {
    flex: 1,
  },
});
