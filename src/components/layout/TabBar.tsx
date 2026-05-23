import { View, StyleSheet } from 'react-native';

type TabBarProps = {
  children: React.ReactNode;
};

export function TabBar({ children }: TabBarProps) {
  return <View style={styles.bar}>{children}</View>;
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#eee', backgroundColor: '#fff', paddingBottom: 8 },
});
