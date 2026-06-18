import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useUiStore } from '@core/stores/uiStore';

export function ThemeToggleButton() {
  const isDark = useUiStore((s) => s.isDark);
  const toggleTheme = useUiStore((s) => s.toggleTheme);

  return (
    <TouchableOpacity style={styles.btn} onPress={toggleTheme} activeOpacity={0.8}>
      <Text style={styles.icon}>{isDark ? '☀️' : '🌙'}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#004aad',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 8,
  },
  icon: { fontSize: 20 },
});
