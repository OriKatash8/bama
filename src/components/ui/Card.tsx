import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { shadow } from '@core/theme/shadow';

type CardProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Card({ children, style }: CardProps) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#eee',  ...shadow({ color: '#000', opacity: 0.06, radius: 8, offsetX: 0, offsetY: 2, elevation: 2 }),
     },
});
