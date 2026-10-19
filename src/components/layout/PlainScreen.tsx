import { SafeAreaView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * `Screen` without its KeyboardAvoidingView, for a screen whose ScrollView adjusts for the
 * keyboard itself (`automaticallyAdjustKeyboardInsets`). Stacking both adjusts twice and leaves
 * a gap above the keyboard. Same gradient + SafeAreaView as Screen, same `scrollable={false}`
 * contract: the screen supplies its own ScrollView.
 */
export function PlainScreen({ children, backgroundColor = '#FFFFFF' }: { children: React.ReactNode; backgroundColor?: string }) {
  return (
    <LinearGradient colors={[backgroundColor, backgroundColor]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.fill}>
      <SafeAreaView style={styles.fill}>{children}</SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
