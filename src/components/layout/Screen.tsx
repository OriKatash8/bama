import { SafeAreaView, ScrollView, KeyboardAvoidingView, Platform, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@core/hooks/useTheme';

type ScreenProps = {
  children: React.ReactNode;
  scrollable?: boolean;
  style?: StyleProp<ViewStyle>;
  backgroundColor?: string;
};

export function Screen({ children, scrollable = true, style, backgroundColor }: ScreenProps) {
  const colors = useTheme();
  const bgColor = backgroundColor ?? colors.bg;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bgColor }]}>
      <KeyboardAvoidingView
        style={[styles.flex, { backgroundColor: bgColor }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {scrollable ? (
          <ScrollView style={{ backgroundColor: bgColor }} contentContainerStyle={[styles.content, style]}>{children}</ScrollView>
        ) : (
          children
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: 16 },
});
