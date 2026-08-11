import { View, StyleSheet } from 'react-native';
import { AppText } from './AppText';

type BadgeProps = {
  label: string;
  color?: string;
  textColor?: string;
};

export function Badge({ label, color = '#f0f0f0', textColor = '#333' }: BadgeProps) {
  return (
    <View style={[styles.pill, { backgroundColor: color }]}>
      <AppText weight="medium" style={[styles.text, { color: textColor }]}>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start' },
  text: { fontSize: 12, fontWeight: '500' },
});
