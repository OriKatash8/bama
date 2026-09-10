import { SafeAreaView, ScrollView, KeyboardAvoidingView, Platform, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@core/hooks/useTheme';

type ScreenProps = {
  children: React.ReactNode;
  scrollable?: boolean;
  style?: StyleProp<ViewStyle>;
  backgroundColor?: string;
  /** Two-stop background gradient, painted top-to-bottom. Wins over `backgroundColor`. */
  gradient?: readonly [string, string];
  keyboardShouldPersistTaps?: 'always' | 'handled' | 'never';
};

export function Screen({ children, scrollable = true, style, backgroundColor, gradient, keyboardShouldPersistTaps }: ScreenProps) {
  const colors = useTheme();
  const bg: readonly [string, string] = gradient
    ? gradient
    : backgroundColor
      ? [backgroundColor, backgroundColor]
      : colors.bgGradient;

  return (
    <LinearGradient colors={bg} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.safe}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {scrollable ? (
            <ScrollView style={styles.transparent} contentContainerStyle={[styles.content, style]} keyboardShouldPersistTaps={keyboardShouldPersistTaps} showsVerticalScrollIndicator={false}>{children}</ScrollView>
          ) : (
            children
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  transparent: { backgroundColor: 'transparent' },
  content: { flexGrow: 1, padding: 16 },
});
