import { useState, useMemo } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { Users } from 'lucide-react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { AppText } from '@components/ui/AppText';
import { useTheme } from '@core/hooks/useTheme';
import { useAppFont } from '@core/hooks/useAppFont';
import { useAuthStore } from '@core/stores/authStore';
import { useCommunityDiscovery } from '../hooks/useCommunityDiscovery';
import type { Chat } from '../types';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import { useSettingsStore } from '@core/stores/settingsStore';
import { categoryLabel } from '@features/crew/data/categories';

type Translations = typeof en;
function makeT(translations: Translations) {
  return (key: string): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
}


const GRADIENTS: [string, string][] = [
  ['#1e4fa3', '#cb6ce6'],
  ['#0ea5e9', '#6366f1'],
  ['#f59e0b', '#ef4444'],
  ['#10b981', '#3b82f6'],
  ['#8b5cf6', '#ec4899'],
  ['#f97316', '#eab308'],
];

function communityGradient(id: string): [string, string] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  return GRADIENTS[h % GRADIENTS.length];
}

interface Props {
  onRequestCommunity: () => void;
}

function CommunityAvatar({ community, size = 46 }: { community: Chat; size?: number }) {
  const radius = Math.round(size * 0.26);
  const marginStyle = {};
  if (community.photoURL) {
    return (
      <Image
        source={{ uri: community.photoURL }}
        style={{ width: size, height: size, borderRadius: radius, ...marginStyle }}
        contentFit="cover"
        cachePolicy="memory-disk"
      />
    );
  }
  return (
    <LinearGradient
      colors={communityGradient(community.id)}
      style={{ width: size, height: size, borderRadius: radius, alignItems: 'center', justifyContent: 'center', ...marginStyle }}
    >
      <AppText weight="bold" style={{ color: '#fff', fontSize: Math.round(size * 0.43) }}>
        {(community.name ?? '?').charAt(0).toUpperCase()}
      </AppText>
    </LinearGradient>
  );
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

  const memberIds = useMemo(() => new Set(myCommunities.map((c) => c.id)), [myCommunities]);

  // Filter chips reflect the categories that actually exist among the communities.
  const availableCategories = useMemo(
    () => [...new Set(discover.map((c) => c.category).filter((cat): cat is string => !!cat))],
    [discover],
  );

  const filteredDiscover = filterCategory
    ? discover.filter((c) => c.category === filterCategory)
    : discover;

  function navigateToCommunity(communityId: string) {
    router.push(`/${modeSegment}/(tabs)/chats/${communityId}` as never);
  }

  function formatLastMessage(c: Chat): string {
    return c.lastMessage?.text ?? '';
  }

  const cardShadow = {
    shadowColor: '#1e4fa3',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>

      {/* My Communities — label */}
      <View style={[styles.sectionRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
        <AppText weight="semiBold" style={[styles.sectionLabel, { color: colors.textSec }]}>
          {t('communities.my_communities')}
        </AppText>
      </View>

      {myCommunities.length === 0 ? (
        <AppText weight="regular" style={[styles.empty, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
          {t('communities.no_communities')}
        </AppText>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.stripScroll}
          style={[styles.stripOuter, rtl && { transform: [{ scaleX: -1 }] }]}
        >
          {myCommunities.map((c) => {
            const unread = c.unreadCount?.[user?.id ?? ''] ?? 0;
            return (
              <TouchableOpacity
                key={c.id}
                style={[styles.stripItem, rtl && { transform: [{ scaleX: -1 }] }]}
                onPress={() => navigateToCommunity(c.id)}
                activeOpacity={0.75}
              >
                <View style={styles.stripIconWrap}>
                  <CommunityAvatar community={c} size={60} />
                  {unread > 0 && (
                    <View style={[styles.stripBadge, styles.stripBadgeRight]}>
                      <AppText weight="bold" style={styles.stripBadgeText}>
                        {unread > 99 ? '99+' : String(unread)}
                      </AppText>
                    </View>
                  )}
                </View>
                <AppText weight="regular" style={styles.stripTitle} numberOfLines={2}>
                  {c.name ?? ''}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Discover */}
      <AppText weight="semiBold" style={[styles.sectionLabel, { color: colors.textSec, marginTop: 20, textAlign: rtl ? 'right' : 'left' }]}>
        {t('communities.discover')}
      </AppText>

      {/* Category filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        style={[{ marginHorizontal: -16, marginBottom: 12 }, rtl && { transform: [{ scaleX: -1 }] }]}
      >
        <TouchableOpacity
          style={[styles.filterChip, filterCategory === null && styles.filterChipActive, rtl && { transform: [{ scaleX: -1 }] }]}
          onPress={() => setFilterCategory(null)}
          activeOpacity={0.7}
        >
          <AppText weight="semiBold" style={[styles.filterChipText, filterCategory === null && styles.filterChipTextActive]}>
            {t('chats_page.filter_all')}
          </AppText>
        </TouchableOpacity>

        {availableCategories.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[styles.filterChip, filterCategory === cat && styles.filterChipActive, rtl && { transform: [{ scaleX: -1 }] }]}
            onPress={() => setFilterCategory(filterCategory === cat ? null : cat)}
            activeOpacity={0.7}
          >
            <AppText weight="semiBold" style={[styles.filterChipText, filterCategory === cat && styles.filterChipTextActive]}>
              {categoryLabel(cat, rtl ? 'he' : 'en')}
            </AppText>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {filteredDiscover.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={[styles.emptyIconCircle, { backgroundColor: colors.inputBg }]}>
            <Users size={32} color={colors.primary} strokeWidth={1.5} />
          </View>
          <AppText weight="bold" style={[styles.emptyTitle, { color: colors.text }]}>
            {t('communities.no_discover_title')}
          </AppText>
          <AppText weight="regular" style={[styles.emptySubtitle, { color: colors.textMuted }]}>
            {t('communities.no_discover_subtitle')}
          </AppText>
          <TouchableOpacity style={[styles.emptyCta, { backgroundColor: colors.primary }]} onPress={onRequestCommunity} activeOpacity={0.7}>
            <AppText weight="semiBold" style={{ color: '#fff', fontSize: 14 }}>{t('communities.request_create')}</AppText>
          </TouchableOpacity>
        </View>
      ) : (
        filteredDiscover.map((c) => {
          const status = joinStatuses[c.id];
          return (
            <View key={c.id} style={[styles.card, { backgroundColor: '#ffffff', borderColor: colors.border, ...cardShadow }]}>
              <View style={[styles.cardHeader, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                <CommunityAvatar community={c} />
                <View style={{ flex: 1 }}>
                  <AppText weight="semiBold" style={[styles.cardName, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]} numberOfLines={1}>
                    {c.name}
                  </AppText>
                  <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <Users size={12} color={colors.textMuted} strokeWidth={1.5} />
                    <AppText weight="regular" style={[styles.memberCount, { color: colors.textMuted }]}>
                      {c.members.length} {t('communities.members')}
                    </AppText>
                  </View>
                </View>
              </View>
              {!!c.description && (
                <AppText weight="regular" style={[styles.description, { color: colors.textSec, textAlign: rtl ? 'right' : 'left' }]} numberOfLines={2}>
                  {c.description as string}
                </AppText>
              )}
              <View style={[styles.cardFooter, { flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
                {memberIds.has(c.id) ? (
                  <>
                    <AppText weight="semiBold" style={styles.memberLabel}>{t('communities.member')}</AppText>
                    <TouchableOpacity
                      style={[styles.joinBtn, { backgroundColor: colors.primary }]}
                      onPress={() => navigateToCommunity(c.id)}
                    >
                      <AppText weight="semiBold" style={styles.joinBtnText}>{t('communities.open_chat')}</AppText>
                    </TouchableOpacity>
                  </>
                ) : status === 'pending' ? (
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
  sectionRow: { alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  empty: { fontSize: 14, marginBottom: 8 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  cardHeader: { alignItems: 'center', marginBottom: 4, gap: 14 },
  cardName: { fontSize: 15, fontWeight: '600' },
  memberCount: { fontSize: 12 },
  preview: { fontSize: 13 },
  description: { fontSize: 13, marginBottom: 10 },
  cardFooter: { marginTop: 8 },
  joinBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16 },
  joinBtnText: { color: '#fff', fontSize: 13 },
  memberLabel: { color: '#10b981', fontSize: 13 },
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
  emptyState: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  emptyIconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 16, marginTop: 4, textAlign: 'center' },
  emptySubtitle: { fontSize: 13, maxWidth: 260, textAlign: 'center' },
  emptyCta: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },

  stripOuter: { marginHorizontal: -16, marginBottom: 8 },
  stripScroll: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, gap: 12 },
  stripItem: { alignItems: 'center', width: 68 },
  stripIconWrap: { position: 'relative', marginBottom: 6 },
  stripTitle: { fontSize: 11, color: '#004aad', textAlign: 'center', maxWidth: 64 },
  stripBadge: {
    position: 'absolute',
    top: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  stripBadgeRight: { right: -4 },
  stripBadgeLeft: { left: -4 },
  stripBadgeText: { color: '#fff', fontSize: 10 },
});
