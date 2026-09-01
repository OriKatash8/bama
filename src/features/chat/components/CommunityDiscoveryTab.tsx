import { useState, useMemo, useRef } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { Users, Search, ChevronLeft, ChevronRight, X } from 'lucide-react-native';
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
  const [search, setSearch] = useState('');

  // ── My-communities strip scroll (arrows) ──
  const stripRef = useRef<ScrollView>(null);
  const [stripX, setStripX] = useState(0);
  const [stripContentW, setStripContentW] = useState(0);
  const [stripViewW, setStripViewW] = useState(0);
  const maxStripX = Math.max(0, stripContentW - stripViewW);
  const canScrollLeft = rtl ? stripX < maxStripX - 4 : stripX > 4;
  const canScrollRight = rtl ? stripX > 4 : stripX < maxStripX - 4;
  function scrollStrip(dir: 'left' | 'right') {
    // The strip is mirrored in RTL, so visual-left corresponds to a larger offset.
    const delta = 200 * (dir === 'left' ? (rtl ? 1 : -1) : (rtl ? -1 : 1));
    const next = Math.max(0, Math.min(maxStripX, stripX + delta));
    stripRef.current?.scrollTo({ x: next, animated: true });
  }

  const { myCommunities, discover, joinStatuses, requestToJoin, cancelJoinRequest } = useCommunityDiscovery(user?.id);

  const memberIds = useMemo(() => new Set(myCommunities.map((c) => c.id)), [myCommunities]);

  // Filter chips reflect the categories that actually exist among the communities.
  const availableCategories = useMemo(
    () => [...new Set(discover.map((c) => c.category).filter((cat): cat is string => !!cat))],
    [discover],
  );

  const q = search.trim().toLowerCase();
  const filteredDiscover = discover.filter((c) => {
    const matchCat = !filterCategory || c.category === filterCategory;
    const matchText =
      !q ||
      (c.name ?? '').toLowerCase().includes(q) ||
      (typeof c.description === 'string' && c.description.toLowerCase().includes(q));
    return matchCat && matchText;
  });

  function confirmCancelJoin(communityId: string, communityName: string) {
    Alert.alert(
      rtl ? 'לבטל את הבקשה?' : 'Withdraw request?',
      rtl
        ? `הבקשה להצטרף אל ${communityName} תבוטל. תמיד אפשר לבקש שוב.`
        : `Your request to join ${communityName} will be withdrawn. You can ask again later.`,
      [
        { text: rtl ? 'השאר' : 'Keep', style: 'cancel' },
        {
          text: rtl ? 'בטל בקשה' : 'Withdraw',
          style: 'destructive',
          onPress: () => { void cancelJoinRequest(communityId); },
        },
      ],
    );
  }

  function navigateToCommunity(communityId: string) {
    router.push(`/${modeSegment}/(tabs)/chats/${communityId}` as never);
  }

  function formatLastMessage(c: Chat): string {
    return c.lastMessage?.text ?? '';
  }

  const cardShadow = {
    shadowColor: '#534ab7',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>

      {/* My Communities — label */}
      <View style={[styles.sectionRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
        <AppText weight="semiBold" style={[styles.sectionLabel, { color: '#004aad' }]}>
          {t('communities.my_communities')}
        </AppText>
      </View>

      {myCommunities.length === 0 ? (
        <AppText weight="regular" style={[styles.empty, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
          {t('communities.no_communities')}
        </AppText>
      ) : (
        <View style={styles.stripWrap}>
        <ScrollView
          ref={stripRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={(e) => setStripX(e.nativeEvent.contentOffset.x)}
          onLayout={(e) => setStripViewW(e.nativeEvent.layout.width)}
          onContentSizeChange={(w) => setStripContentW(w)}
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

        {canScrollLeft && (
          <TouchableOpacity style={[styles.stripArrow, styles.stripArrowLeft]} onPress={() => scrollStrip('left')} activeOpacity={0.8}>
            <ChevronLeft size={20} color="#004aad" strokeWidth={2.5} />
          </TouchableOpacity>
        )}
        {canScrollRight && (
          <TouchableOpacity style={[styles.stripArrow, styles.stripArrowRight]} onPress={() => scrollStrip('right')} activeOpacity={0.8}>
            <ChevronRight size={20} color="#004aad" strokeWidth={2.5} />
          </TouchableOpacity>
        )}
        </View>
      )}

      {/* Discover */}
      <AppText weight="semiBold" style={[styles.sectionLabel, { color: '#004aad', marginTop: 20, marginBottom: 12, textAlign: rtl ? 'right' : 'left' }]}>
        {t('communities.discover')}
      </AppText>

      {/* Search bar (above the category filter) */}
      <View style={[styles.searchRow, { backgroundColor: '#ffffff', borderColor: colors.border, flexDirection: rtl ? 'row-reverse' : 'row' }]}>
        <Search size={16} color={colors.placeholder} strokeWidth={2.5} />
        <TextInput
          style={[styles.searchInput, { ...font.regular, color: colors.text, textAlign: rtl ? 'right' : 'left' }]}
          placeholder={rtl ? 'חיפוש קהילות…' : 'Search communities…'}
          placeholderTextColor={colors.placeholder}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} activeOpacity={0.7}>
            <AppText weight="regular" style={[styles.clearBtn, { color: colors.textMuted }]}>✕</AppText>
          </TouchableOpacity>
        )}
      </View>

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
          const isMember = memberIds.has(c.id);
          const isPending = !isMember && status === 'pending';
          return (
            <View key={c.id} style={[styles.card, { ...cardShadow }]}>
              <View style={[styles.cardRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                <CommunityAvatar community={c} size={52} />

                <View style={styles.textGroup}>
                  <View style={[styles.nameRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                    <AppText weight="bold" numberOfLines={1} style={[styles.cardName, { color: colors.text, textAlign: rtl ? 'right' : 'left', flexShrink: 1 }]}>
                      {c.name}
                    </AppText>
                    {isMember ? (
                      <View style={[styles.statusBadge, { backgroundColor: '#e4f7f0' }]}>
                        <AppText weight="semiBold" style={[styles.statusBadgeText, { color: '#1c9d78' }]}>{rtl ? 'חבר' : 'Member'}</AppText>
                      </View>
                    ) : isPending ? (
                      <View style={[styles.statusBadge, { backgroundColor: '#fbeccb' }]}>
                        <AppText weight="semiBold" style={[styles.statusBadgeText, { color: '#b7791f' }]}>{rtl ? 'ממתין' : 'Pending'}</AppText>
                      </View>
                    ) : null}
                  </View>
                  <View style={[styles.metaRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                    <Users size={12} color="#9aa0b8" strokeWidth={1.5} />
                    <AppText weight="regular" style={styles.memberCount}>
                      {c.members.length} {t('communities.members')}
                    </AppText>
                  </View>
                </View>

                {isMember ? (
                  <TouchableOpacity style={styles.btnSolid} onPress={() => navigateToCommunity(c.id)} activeOpacity={0.8}>
                    <AppText weight="semiBold" style={styles.btnTextLight}>{rtl ? 'פתח צ׳אט' : 'Open chat'}</AppText>
                  </TouchableOpacity>
                ) : isPending ? (
                  <TouchableOpacity
                    style={[styles.btnMuted, styles.btnMutedRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}
                    onPress={() => confirmCancelJoin(c.id, c.name ?? '')}
                    accessibilityRole="button"
                    accessibilityLabel={rtl ? 'ביטול בקשת הצטרפות' : 'Withdraw join request'}
                    activeOpacity={0.7}
                  >
                    <AppText weight="semiBold" style={styles.btnTextMuted}>{rtl ? 'בקשה נשלחה' : 'Requested'}</AppText>
                    <X size={13} color="#9aa0b8" strokeWidth={2.5} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.btnSoft} onPress={() => requestToJoin(c.id, user?.displayName ?? '')} activeOpacity={0.8}>
                    <AppText weight="semiBold" style={styles.btnTextBlue}>{rtl ? 'הצטרף' : 'Join'}</AppText>
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
  card: { backgroundColor: '#ffffff', borderRadius: 16, padding: 13, marginBottom: 12 },
  cardRow: { alignItems: 'center', gap: 12 },
  textGroup: { flex: 1 },
  nameRow: { alignItems: 'center', gap: 6 },
  metaRow: { alignItems: 'center', gap: 4, marginTop: 2 },
  cardName: { fontSize: 15.5 },
  memberCount: { fontSize: 12, color: '#9aa0b8' },
  statusBadge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  statusBadgeText: { fontSize: 11 },
  btnSolid: { backgroundColor: '#004aad', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14 },
  btnSoft: { backgroundColor: '#e8f0fd', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14 },
  btnMuted: { backgroundColor: '#eceef3', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14 },
  btnMutedRow: { alignItems: 'center', gap: 6 },
  btnTextLight: { color: '#ffffff', fontSize: 13 },
  btnTextBlue: { color: '#004aad', fontSize: 13 },
  btnTextMuted: { color: '#9aa0b8', fontSize: 13 },
  searchRow: {
    alignItems: 'center',
    borderRadius: 24,
    marginBottom: 12,
    paddingHorizontal: 14,
    height: 44,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15 },
  clearBtn: { fontSize: 14, paddingHorizontal: 4 },
  filterChip: {
    borderWidth: 1,
    borderColor: '#004aad',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: '#ffffff',
  },
  filterChipActive: { backgroundColor: '#004aad' },
  filterChipText: { fontSize: 12, color: '#004aad' },
  filterChipTextActive: { color: '#ffffff' },
  emptyState: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  emptyIconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 16, marginTop: 4, textAlign: 'center' },
  emptySubtitle: { fontSize: 13, maxWidth: 260, textAlign: 'center' },
  emptyCta: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },

  stripWrap: { position: 'relative' },
  stripOuter: { marginHorizontal: -16, marginBottom: 8 },
  stripScroll: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, gap: 12 },
  stripItem: { alignItems: 'center', width: 68 },
  stripArrow: {
    position: 'absolute',
    top: 20,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    shadowColor: '#1e4fa3',
    shadowOpacity: 0.14,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  stripArrowLeft: { left: 0 },
  stripArrowRight: { right: 0 },
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
