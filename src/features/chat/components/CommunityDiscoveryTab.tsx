import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { Image } from 'expo-image';
import { AppText } from '@components/ui/AppText';
import { useTheme } from '@core/hooks/useTheme';
import { useAppFont } from '@core/hooks/useAppFont';
import { useAuthStore } from '@core/stores/authStore';
import { useCommunityDiscovery } from '../hooks/useCommunityDiscovery';
import type { Chat } from '../types';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import { useSettingsStore } from '@core/stores/settingsStore';
import { CREW_CATEGORIES, CATEGORY_LABEL_KEY } from '@features/crew/data/categories';

type Translations = typeof en;
function makeT(translations: Translations) {
  return (key: string): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
}

const CATEGORY_IMAGE: Record<string, number> = {
  'Video Photographer': require('../../../../assets/images/categories/videographer-blue.png'),
  'Still Photographer': require('../../../../assets/images/categories/blue-cam.png'),
  'Editor':             require('../../../../assets/images/categories/blue-edit.png'),
  'Graphic Designer':   require('../../../../assets/images/categories/blue-grafic.png'),
  'Social Media':       require('../../../../assets/images/categories/blue-social.png'),
  'Studio & Audio':     require('../../../../assets/images/categories/blue-sound.png'),
  'Lighting Tech':      require('../../../../assets/images/categories/blue-lightning.png'),
  'Sound Recordist':    require('../../../../assets/images/categories/blue-mic.png'),
};

const CATEGORIES = Object.keys(CREW_CATEGORIES);

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

  const [filterCategory, setFilterCategory] = useState<string | null>(null);

  const { myCommunities, discover, joinStatuses, requestToJoin } = useCommunityDiscovery(user?.id);

  const filteredDiscover = filterCategory
    ? discover.filter((c) => c.category === filterCategory)
    : discover;

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
        <AppText weight="bold" style={[styles.pageTitle, { color: colors.text }]}>
          {t('chats_page.tab_communities')}
        </AppText>
        <TouchableOpacity style={[styles.plusBtn, { backgroundColor: colors.primary }]} onPress={onRequestCommunity}>
          <Plus size={16} color="#fff" />
          <AppText weight="semiBold" style={styles.plusBtnText}>{t('communities.request_create')}</AppText>
        </TouchableOpacity>
      </View>

      {/* My Communities */}
      <AppText weight="semiBold" style={[styles.sectionLabel, { color: colors.textSec, textAlign: rtl ? 'right' : 'left' }]}>
        {t('communities.my_communities')}
      </AppText>
      {myCommunities.length === 0 ? (
        <AppText weight="regular" style={[styles.empty, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
          {t('communities.no_communities')}
        </AppText>
      ) : (
        myCommunities.map((c) => (
          <TouchableOpacity
            key={c.id}
            style={[styles.card, { backgroundColor: '#ffffff', borderColor: colors.border }]}
            onPress={() => navigateToCommunity(c.id)}
            activeOpacity={0.75}
          >
            <View style={[styles.cardHeader, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
              {c.category && CATEGORY_IMAGE[c.category] ? (
                <Image
                  source={CATEGORY_IMAGE[c.category]}
                  style={{ width: 32, height: 32, borderRadius: 6, marginRight: rtl ? 0 : 8, marginLeft: rtl ? 8 : 0 }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
              ) : null}
              <AppText weight="semiBold" style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>
                {c.name}
              </AppText>
              <AppText weight="regular" style={[styles.memberCount, { color: colors.textMuted }]}>
                {c.members.length} {t('communities.members')}
              </AppText>
            </View>
            {!!formatLastMessage(c) && (
              <AppText weight="regular" style={[styles.preview, { color: colors.textSec, textAlign: rtl ? 'right' : 'left' }]} numberOfLines={1}>
                {formatLastMessage(c)}
              </AppText>
            )}
          </TouchableOpacity>
        ))
      )}

      {/* Discover */}
      <AppText weight="semiBold" style={[styles.sectionLabel, { color: colors.textSec, marginTop: 20, textAlign: rtl ? 'right' : 'left' }]}>
        {t('communities.discover')}
      </AppText>

      {/* Category filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8, flexDirection: rtl ? 'row-reverse' : 'row' }}
        style={{ marginBottom: 12 }}
      >
        {/* "All" chip */}
        <TouchableOpacity
          style={[styles.filterChip, filterCategory === null && styles.filterChipActive]}
          onPress={() => setFilterCategory(null)}
          activeOpacity={0.7}
        >
          <AppText weight="semiBold" style={[styles.filterChipText, filterCategory === null && styles.filterChipTextActive]}>
            {t('chats_page.filter_all')}
          </AppText>
        </TouchableOpacity>

        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[styles.filterChip, filterCategory === cat && styles.filterChipActive]}
            onPress={() => setFilterCategory(filterCategory === cat ? null : cat)}
            activeOpacity={0.7}
          >
            <AppText weight="semiBold" style={[styles.filterChipText, filterCategory === cat && styles.filterChipTextActive]}>
              {rtl && CATEGORY_LABEL_KEY[cat] ? t(CATEGORY_LABEL_KEY[cat]) : cat}
            </AppText>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {filteredDiscover.length === 0 ? (
        <AppText weight="regular" style={[styles.empty, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
          {t('communities.no_discover')}
        </AppText>
      ) : (
        filteredDiscover.map((c) => {
          const status = joinStatuses[c.id];
          return (
            <View key={c.id} style={[styles.card, { backgroundColor: '#ffffff', borderColor: colors.border }]}>
              <View style={[styles.cardHeader, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                {c.category && CATEGORY_IMAGE[c.category] ? (
                  <Image
                    source={CATEGORY_IMAGE[c.category]}
                    style={{ width: 32, height: 32, borderRadius: 6, marginRight: rtl ? 0 : 8, marginLeft: rtl ? 8 : 0 }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                ) : null}
                <AppText weight="semiBold" style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>
                  {c.name}
                </AppText>
                <AppText weight="regular" style={[styles.memberCount, { color: colors.textMuted }]}>
                  {c.members.length} {t('communities.members')}
                </AppText>
              </View>
              {!!c.description && (
                <AppText weight="regular" style={[styles.description, { color: colors.textSec, textAlign: rtl ? 'right' : 'left' }]} numberOfLines={2}>
                  {c.description as string}
                </AppText>
              )}
              <View style={[styles.cardFooter, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                {status === 'pending' ? (
                  <View style={styles.pendingBadge}>
                    <AppText weight="semiBold" style={styles.pendingText}>{t('communities.pending')}</AppText>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.joinBtn, { backgroundColor: colors.primary }]}
                    onPress={() => requestToJoin(c.id, user?.displayName ?? '')}
                  >
                    <AppText weight="semiBold" style={styles.joinBtnText}>{t('communities.request_join')}</AppText>
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
  filterChip: {
    borderWidth: 1,
    borderColor: '#004aad',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: 'transparent',
  },
  filterChipActive: { backgroundColor: '#004aad' },
  filterChipText: { fontSize: 12, color: '#004aad' },
  filterChipTextActive: { color: '#ffffff' },
});
