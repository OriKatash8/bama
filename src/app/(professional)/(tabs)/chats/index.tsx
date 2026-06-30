import { useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { ChatsScreen as ChatsList } from '@features/chat/screens/ChatsScreen';
import { Screen } from '@components/layout/Screen';
import { useTheme } from '@core/hooks/useTheme';

const TABS = ['Chats', 'Courses', 'Communities'] as const;
type Tab = typeof TABS[number];

export default function ProfessionalChatsScreen() {
  const colors = useTheme();
  const [active, setActive] = useState<Tab>('Chats');

  return (
    <Screen scrollable={false}>
      <Image
        source={require('../../../../../assets/images/bama-logo.png')}
        style={styles.logo}
        resizeMode="contain"
      />

      <View style={styles.tabBar}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, active === tab && { borderBottomColor: colors.accent, borderBottomWidth: 2 }]}
            onPress={() => setActive(tab)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, { color: active === tab ? colors.accent : colors.textMuted }]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      {active === 'Chats' && <ChatsList />}

      {active === 'Courses' && (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderIcon}>🎓</Text>
          <Text style={[styles.placeholderTitle, { color: colors.text }]}>Courses</Text>
          <Text style={[styles.placeholderSub, { color: colors.textMuted }]}>
            Professional courses and training will appear here.
          </Text>
        </View>
      )}

      {active === 'Communities' && (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderIcon}>🤝</Text>
          <Text style={[styles.placeholderTitle, { color: colors.text }]}>Communities</Text>
          <Text style={[styles.placeholderSub, { color: colors.textMuted }]}>
            Professional communities and groups will appear here.
          </Text>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  logo: { width: '100%', height: 240, marginTop: 12 },
  tabBar: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 16 },
  tab: { flex: 1, alignItems: 'center', paddingBottom: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 15, fontWeight: '600' },
  divider: { height: 1 },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 40 },
  placeholderIcon: { fontSize: 48, marginBottom: 4 },
  placeholderTitle: { fontSize: 20, fontWeight: '700' },
  placeholderSub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
