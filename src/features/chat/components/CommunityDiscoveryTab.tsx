import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useTheme } from '@core/hooks/useTheme';
import { useAppFont } from '@core/hooks/useAppFont';
import { useAuthStore } from '@core/stores/authStore';
import { useCommunityDiscovery } from '../hooks/useCommunityDiscovery';
import type { Chat } from '../types';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import { useSettingsStore } from '@core/stores/settingsStore';

type Translations = typeof en;
function makeT(translations: Translations) {
  return (key: string): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
}

interface Props {
  onRequestCommunity: () => void;
}

export function CommunityDiscoveryTab({ onRequestCommunity }: Props) {
  const colors = useTheme();
  const font = useAppFont();
  const router = useRouter();
  const segments = useSegments();
  const modeSegment = segments[0];
  const user = useAuthStore((s) => s.user);
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';

  const { myCommunities, discover, joinStatuses, requestToJoin } = useCommunityDiscovery(user?.id);

  function navigateToCommunity(communityId: string) {
    router.push(`/${modeSegment}/(tabs)/chats/${communityId}` as never);
  }

  function formatLastMessage(c: Chat): string {
    return c.lastMessage?.text ?? '';
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header row */}
      <View style={[styles.headerRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
        <Text style={[styles.pageTitle, { fontFamily: font.bold, color: colors.text }]}>
          {t('chats_page.tab_communities')}
        </Text>
        <TouchableOpacity style={[styles.plusBtn, { backgroundColor: colors.primary }]} onPress={onRequestCommunity}>
          <Plus size={16} color="#fff" />
          <Text style={[styles.plusBtnText, { fontFamily: font.semiBold }]}>{t('communities.request_create')}</Text>
        </TouchableOpacity>
      </View>

      {/* My Communities */}
      <Text style={[styles.sectionLabel, { fontFamily: font.semiBold, color: colors.textSec, textAlign: rtl ? 'right' : 'left' }]}>
        {t('communities.my_communities')}
      </Text>
      {myCommunities.length === 0 ? (
        <Text style={[styles.empty, { fontFamily: font.regular, color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
          {t('communities.no_communities')}
        </Text>
      ) : (
        myCommunities.map((c) => (
          <TouchableOpacity
            key={c.id}
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => navigateToCommunity(c.id)}
            activeOpacity={0.75}
          >
            <View style={[styles.cardHeader, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
              <Text style={[styles.cardName, { fontFamily: font.semiBold, color: colors.text }]} numberOfLines={1}>
                {c.name}
              </Text>
              <Text style={[styles.memberCount, { fontFamily: font.regular, color: colors.textMuted }]}>
                {c.members.length} {t('communities.members')}
              </Text>
            </View>
            {!!formatLastMessage(c) && (
              <Text style={[styles.preview, { fontFamily: font.regular, color: colors.textSec, textAlign: rtl ? 'right' : 'left' }]} numberOfLines={1}>
                {formatLastMessage(c)}
              </Text>
            )}
          </TouchableOpacity>
        ))
      )}

      {/* Discover */}
      <Text style={[styles.sectionLabel, { fontFamily: font.semiBold, color: colors.textSec, marginTop: 20, textAlign: rtl ? 'right' : 'left' }]}>
        {t('communities.discover')}
      </Text>
      {discover.length === 0 ? (
        <Text style={[styles.empty, { fontFamily: font.regular, color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
          {t('communities.no_discover')}
        </Text>
      ) : (
        discover.map((c) => {
          const status = joinStatuses[c.id];
          return (
            <View key={c.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.cardHeader, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                <Text style={[styles.cardName, { fontFamily: font.semiBold, color: colors.text }]} numberOfLines={1}>
                  {c.name}
                </Text>
                <Text style={[styles.memberCount, { fontFamily: font.regular, color: colors.textMuted }]}>
                  {c.members.length} {t('communities.members')}
                </Text>
              </View>
              {!!c.description && (
                <Text style={[styles.description, { fontFamily: font.regular, color: colors.textSec, textAlign: rtl ? 'right' : 'left' }]} numberOfLines={2}>
                  {c.description as string}
                </Text>
              )}
              <View style={[styles.cardFooter, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                {status === 'pending' ? (
                  <View style={styles.pendingBadge}>
                    <Text style={[styles.pendingText, { fontFamily: font.semiBold }]}>{t('communities.pending')}</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.joinBtn, { backgroundColor: colors.primary }]}
                    onPress={() => requestToJoin(c.id, user?.displayName ?? '')}
                  >
                    <Text style={[styles.joinBtnText, { fontFamily: font.semiBold }]}>{t('communities.request_join')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })
      )}

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingTop: 8 },
  headerRow: { alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  pageTitle: { fontSize: 18, fontWeight: '700' },
  plusBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16 },
  plusBtnText: { color: '#fff', fontSize: 13 },
  sectionLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  empty: { fontSize: 14, marginBottom: 8 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  cardHeader: { alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  cardName: { fontSize: 15, fontWeight: '600', flex: 1 },
  memberCount: { fontSize: 12, flexShrink: 0 },
  preview: { fontSize: 13 },
  description: { fontSize: 13, marginBottom: 10 },
  cardFooter: { marginTop: 8 },
  joinBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16 },
  joinBtnText: { color: '#fff', fontSize: 13 },
  pendingBadge: { backgroundColor: '#9ca3af', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  pendingText: { color: '#fff', fontSize: 13 },
});
