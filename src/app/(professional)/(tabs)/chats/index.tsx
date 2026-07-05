import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
      {/* Gradient header — title + tabs inside */}
      <View style={styles.headerWrap}>
        <LinearGradient
          colors={['#cb6ce6', '#004aad']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradient}
        >
          <Text style={styles.headerTitle}>Chats</Text>

          <View style={styles.tabBar}>
            {TABS.map((tab) => {
              const isActive = active === tab;
              return (
                <TouchableOpacity
                  key={tab}
                  style={styles.tab}
                  onPress={() => setActive(tab)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.tabPill, isActive && styles.tabPillActive]}>
                    <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                      {tab}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </LinearGradient>
        <View style={[styles.concaveCap, { backgroundColor: colors.bg }]} />
      </View>

      {/* Content */}
      {active === 'Chats' && <ChatsList />}
      {active !== 'Chats' && (
        <View style={styles.comingSoon}>
          <Text style={[styles.comingSoonText, { color: colors.textMuted }]}>Coming soon</Text>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    alignSelf: 'stretch',
    marginHorizontal: -16,
    marginTop: -16,
  },
  gradient: {
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 40,
    gap: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  concaveCap: {
    height: 40,
    marginTop: -40,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
  },
  tabBar: {
    flexDirection: 'row',
    width: '100%',
    paddingHorizontal: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
  },
  tabPill: {
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  tabPillActive: {
    backgroundColor: '#fff',
  },
  tabText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.65)',
  },
  tabTextActive: {
    color: '#004aad',
    fontWeight: '700',
  },
  comingSoon: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  comingSoonText: {
    fontSize: 15,
  },
});
