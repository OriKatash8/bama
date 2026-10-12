import type { Ref } from 'react';
import { SafeAreaView, ScrollView, KeyboardAvoidingView, Platform, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView as AndroidSafeAreaView } from 'react-native-safe-area-context';
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
  /** The page's ScrollView (when `scrollable`), for children that scroll the page. */
  scrollRef?: Ref<ScrollView>;
  /** False locks the page (no scroll, no bounce) — e.g. while an empty state fills it. */
  scrollEnabled?: boolean;
};

export function Screen({ children, scrollable = true, style, backgroundColor, gradient, keyboardShouldPersistTaps, scrollRef, scrollEnabled = true }: ScreenProps) {
  const colors = useTheme();
  const bg: readonly [string, string] = gradient
    ? gradient
    : backgroundColor
      ? [backgroundColor, backgroundColor]
      : colors.bgGradient;

  const body = (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {scrollable ? (
        <ScrollView ref={scrollRef} style={styles.transparent} contentContainerStyle={[styles.content, style]} keyboardShouldPersistTaps={keyboardShouldPersistTaps} showsVerticalScrollIndicator={false} scrollEnabled={scrollEnabled} bounces={scrollEnabled}>{children}</ScrollView>
      ) : (
        children
      )}
    </KeyboardAvoidingView>
  );

  return (
    <LinearGradient colors={bg} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.safe}>
      {/* React Native's SafeAreaView is iOS-only (a plain View elsewhere), so on
          Android the screen would draw under the status and navigation bars.
          Android therefore uses the safe-area-context one. iOS and web keep
          RN's: on iOS it pads by the view's OWN position, whereas the library's
          iOS view applies the provider's full insets and would double-pad
          screens under a header or above the tab bar. */}
      {Platform.OS === 'android' ? (
        <AndroidSafeAreaView style={styles.safe} edges={['top', 'right', 'bottom', 'left']}>{body}</AndroidSafeAreaView>
      ) : (
        <SafeAreaView style={styles.safe}>{body}</SafeAreaView>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  transparent: { backgroundColor: 'transparent' },
  content: { flexGrow: 1, padding: 16 },
});
