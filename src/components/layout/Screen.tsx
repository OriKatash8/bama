import { SafeAreaView, ScrollView, KeyboardAvoidingView, Platform, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

type ScreenProps = {
  children: React.ReactNode;
  scrollable?: boolean;
  style?: StyleProp<ViewStyle>;
  backgroundColor?: string;
};

export function Screen({ children, scrollable = true, style, backgroundColor }: ScreenProps) {
  return (
    <SafeAreaView style={[styles.safe, backgroundColor ? { backgroundColor } : undefined]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {scrollable ? (
          <ScrollView contentContainerStyle={[styles.content, style]}>{children}</ScrollView>
        ) : (
          children
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: 16 },
});
