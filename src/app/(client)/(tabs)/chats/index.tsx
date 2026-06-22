import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ScrollView } from 'react-native';
import { Users, Check, Plus } from 'lucide-react-native';
import { Screen } from '@components/layout/Screen';
import { useTheme } from '@core/hooks/useTheme';
import { useUiStore } from '@core/stores/uiStore';

const COMMUNITIES = [
  { id: '1', name: 'Video Editors', description: 'Tips, tools & collab for video editors', members: 128 },
  { id: '2', name: 'Filming', description: 'Cinematography, gear & on-set talk', members: 94 },
  { id: '3', name: 'Design', description: 'Motion graphics, branding & visual design', members: 76 },
];

export default function ChatsScreen() {
  const colors = useTheme();
  const { showToast } = useUiStore();
  const [requested, setRequested] = useState<Set<string>>(new Set());

  function requestJoin(community: typeof COMMUNITIES[number]) {
    setRequested((prev) => new Set(prev).add(community.id));
    showToast(`Join request sent to ${community.name}`, 'success');
  }

  return (
    <Screen scrollable={false}>
      <Image
        source={require('../../../../../assets/images/bama-logo.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      <Text style={[styles.heading, { color: colors.text }]}>Chats</Text>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <ScrollView contentContainerStyle={styles.list}>
        {COMMUNITIES.map((c) => (
          <TouchableOpacity
            key={c.id}
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
            activeOpacity={0.8}
          >
            <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
              <Users size={22} color="#fff" strokeWidth={1.5} />
            </View>
            <View style={styles.cardBody}>
              <Text style={[styles.cardName, { color: colors.text }]}>{c.name}</Text>
              <Text style={[styles.cardDesc, { color: colors.textMuted }]}>{c.description}</Text>
              <Text style={[styles.cardMembers, { color: colors.textMuted }]}>{c.members} members</Text>
            </View>
            {requested.has(c.id) ? (
              <View style={[styles.joinBtn, { backgroundColor: '#22c55e' }]}>
                <Check size={18} color="#fff" strokeWidth={2.5} />
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.joinBtn, { backgroundColor: colors.primary }]}
                onPress={() => requestJoin(c)}
                activeOpacity={0.75}
                hitSlop={8}
              >
                <Plus size={18} color="#fff" strokeWidth={2.5} />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  logo: { width: '100%', height: 240, marginTop: 12 },
  heading: { fontSize: 22, fontWeight: '800', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  divider: { height: 1 },
  list: { padding: 16, gap: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1, gap: 2 },
  cardName: { fontSize: 16, fontWeight: '700' },
  cardDesc: { fontSize: 13 },
  cardMembers: { fontSize: 12, marginTop: 2 },
  joinBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
