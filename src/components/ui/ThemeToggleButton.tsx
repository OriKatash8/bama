import { TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from '@components/ui/Text';
import { useUiStore } from '@core/stores/uiStore';
import { shadow } from '@core/theme/shadow';

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
    ...shadow({ color: '#000', opacity: 0.35, radius: 4, offsetX: 0, offsetY: 2, elevation: 8 }),
  },
  icon: { fontSize: 20 },
});
