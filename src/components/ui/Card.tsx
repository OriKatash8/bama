import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

type CardProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Card({ children, style }: CardProps) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#eee', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
});
