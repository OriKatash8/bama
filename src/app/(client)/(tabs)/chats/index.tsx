import { View, Text, StyleSheet, Image } from 'react-native';
import { Screen } from '@components/layout/Screen';
import { useTheme } from '@core/hooks/useTheme';

export default function ChatsScreen() {
  const colors = useTheme();

  return (
    <Screen scrollable={false}>
      <Image
        source={require('../../../../../assets/images/bama-logo.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      <Text style={[styles.heading, { color: colors.text }]}>Chats</Text>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <View style={styles.empty}>
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>No chats yet</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  logo: { width: '100%', height: 240, marginTop: 12 },
  heading: { fontSize: 22, fontWeight: '800', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  divider: { height: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 16 },
});
