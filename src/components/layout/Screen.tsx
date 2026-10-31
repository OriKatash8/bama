import { useContext, type Ref } from 'react';
import { SafeAreaView, ScrollView, KeyboardAvoidingView, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@core/hooks/useTheme';

export type ScreenEdge = 'top' | 'right' | 'bottom' | 'left';
const ALL_EDGES: readonly ScreenEdge[] = ['top', 'right', 'bottom', 'left'];

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
  /** Android only: which sides get the system-bar inset. Default all four. Under the tab layouts the
   *  context already reads top/bottom as 0 (the header and the docked bar own them), so screens there
   *  pass nothing; this is the escape hatch for a screen that needs to opt out of a side. */
  edges?: readonly ScreenEdge[];
};

export function Screen({ children, scrollable = true, style, backgroundColor, gradient, keyboardShouldPersistTaps, scrollRef, scrollEnabled = true, edges = ALL_EDGES }: ScreenProps) {
  const colors = useTheme();
  // The CONTEXT's insets, not the native view's: the tab layouts zero top and bottom here because
  // AppHeader and the docked tab bar own them. Null (no provider) pads nothing.
  const insets = useContext(SafeAreaInsetsContext);
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
          Android the screen would draw under the status and navigation bars. Android
          therefore pads itself from the safe-area CONTEXT. Not the library's native
          SafeAreaView: that measures the window, ignores the zeroing provider the tab
          layouts set, and so padded the top again under AppHeader (and the bottom
          against the docked tab bar). iOS and web keep RN's: on iOS it pads by the
          view's OWN position, so a screen under a header or above the tab bar needs
          nothing extra. */}
      {Platform.OS === 'android' ? (
        <View
          style={[
            styles.safe,
            {
              paddingTop: edges.includes('top') ? insets?.top ?? 0 : 0,
              paddingRight: edges.includes('right') ? insets?.right ?? 0 : 0,
              paddingBottom: edges.includes('bottom') ? insets?.bottom ?? 0 : 0,
              paddingLeft: edges.includes('left') ? insets?.left ?? 0 : 0,
            },
          ]}
        >
          {body}
        </View>
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
