import { useState, useMemo, useRef, type RefObject } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Platform } from 'react-native';
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
import { communityCategoryLabel } from '@features/crew/data/categories';

type Translations = typeof en;
function makeT(translations: Translations) {
  return (key: string, vars?: Record<string, string | number>): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    if (typeof result !== 'string') return key;
    if (!vars) return result;
    return result.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ''));
  };
}


/** The "my communities" strip is filled up to this many tiles with "+" tiles
 *  that lead to Discover. */
const STRIP_FILL_COUNT = 5;

/** How far above the first Discover card a "+" tile's scroll stops. */
const CARDS_SCROLL_INSET = 8;

// Violet palette for this tab. Local on purpose: useTheme reaches the whole app.
const VIOLET = '#6D28D9';
const VIOLET_DEEP = '#4C1D95';
const INK = '#1A1626';
/** The pro chats sheet's side padding — the strip and chips bleed by this much. */
const SHEET_PAD = 20;
/** Row padding 14 + avatar 46 + gap 11 ≈ 69: separators start where the text does. */
const SEPARATOR_INSET = 69;
/** Chrome draws `outline: auto` over the focus border; RN's types have no 'none'. */
const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null;

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
  /** The screen's scrolling ScrollView. This tab renders inside it, so its own
   *  ScrollView grows to full height and never scrolls — the page is what moves. */
  pageScrollRef: RefObject<ScrollView | null>;
}

/** Exported so the community details page renders the SAME avatar — the gradient
 *  fallback is hashed off the community id, so a second copy would drift. */
export function CommunityAvatar({ community, size = 46 }: { community: Chat; size?: number }) {
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

export function CommunityDiscoveryTab({ onRequestCommunity, pageScrollRef }: Props) {
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
  /** Visual only: the search field's focus border. */
  const [searchFocused, setSearchFocused] = useState(false);

  // ── Page scroll: a "+" tile in the strip takes the user down to the Discover
  //    cards themselves — past the heading, search and chips — so the next tap
  //    can be a Join. ──
  const cardsAnchorRef = useRef<View>(null);
  function scrollToDiscover() {
    const page = pageScrollRef.current;
    // getInnerViewRef is on ScrollView at runtime but missing from its TS types.
    const content = (page as unknown as { getInnerViewRef?: () => View | null } | null)?.getInnerViewRef?.();
    const anchor = cardsAnchorRef.current;
    if (!page || !content || !anchor) return;
    // Measured against the page's content view, which is the space scrollTo offsets
    // are in — however much header sits above this tab.
    anchor.measureLayout(content, (_x, y) => {
      page.scrollTo({ y: Math.max(0, y - CARDS_SCROLL_INSET), animated: true });
    });
  }

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


  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>

      {/* My Communities — only for someone who is in at least one. */}
      {myCommunities.length > 0 && (
        <>
          <View style={[styles.sectionRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
            <AppText weight="bold" style={styles.sectionLabel}>
              {t('communities.my_communities')}
            </AppText>
          </View>

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
                      <CommunityAvatar community={c} size={56} />
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

              {/* Fill the strip up to STRIP_FILL_COUNT, numbered after the real
                  communities. Each "+" is an invitation, not a community: it
                  scrolls down to Discover, where the communities to join are. */}
              {Array.from({ length: Math.max(0, STRIP_FILL_COUNT - myCommunities.length) }, (_, i) => {
                const n = myCommunities.length + i + 1;
                return (
                  <TouchableOpacity
                    key={`fill-${n}`}
                    style={[styles.stripItem, rtl && { transform: [{ scaleX: -1 }] }]}
                    onPress={scrollToDiscover}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={t('communities.discover')}
                  >
                    <View style={styles.placeholderSquare}>
                      <AppText weight="semiBold" style={styles.placeholderPlus}>+</AppText>
                    </View>
                    {/* One row always: "Community 5" overflows the 68pt tile at the
                        shared size while "קהילה 5" does not, so it shrinks to fit. */}
                    <AppText
                      weight="regular"
                      style={styles.stripTitle}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                    >
                      {t('communities.placeholder_name', { n })}
                    </AppText>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {canScrollLeft && (
              <TouchableOpacity style={[styles.stripArrow, styles.stripArrowLeft]} onPress={() => scrollStrip('left')} activeOpacity={0.8}>
                <ChevronLeft size={20} color={VIOLET_DEEP} strokeWidth={2.5} />
              </TouchableOpacity>
            )}
            {canScrollRight && (
              <TouchableOpacity style={[styles.stripArrow, styles.stripArrowRight]} onPress={() => scrollStrip('right')} activeOpacity={0.8}>
                <ChevronRight size={20} color={VIOLET_DEEP} strokeWidth={2.5} />
              </TouchableOpacity>
            )}
          </View>
        </>
      )}

      {/* Discover */}
      <AppText
        weight="bold"
        style={[styles.sectionLabel, { marginTop: myCommunities.length > 0 ? 20 : 0, marginBottom: 12, textAlign: rtl ? 'right' : 'left' }]}>
        {t('communities.discover')}
      </AppText>

      {/* Search bar (above the category filter) */}
      <View style={[styles.searchRow, searchFocused && styles.searchRowFocused, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
        <Search size={18} color="#8B8898" strokeWidth={2.5} />
        <TextInput
          style={[styles.searchInput, webNoOutline, { ...font.regular, textAlign: rtl ? 'right' : 'left' }]}
          placeholder={rtl ? 'חיפוש קהילות…' : 'Search communities…'}
          placeholderTextColor="#9C99AD"
          value={search}
          onChangeText={setSearch}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
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
        contentContainerStyle={{ paddingHorizontal: SHEET_PAD, gap: 7 }}
        style={[{ marginHorizontal: -SHEET_PAD, marginBottom: 12 }, rtl && { transform: [{ scaleX: -1 }] }]}
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
              {communityCategoryLabel(cat, rtl ? 'he' : 'en')}
            </AppText>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Where the Discover cards begin — a "+" tile scrolls the page to here. */}
      <View ref={cardsAnchorRef} testID="discover-cards-anchor" collapsable={false} />

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
        <View style={styles.listCard}>
        {filteredDiscover.map((c, index) => {
          const status = joinStatuses[c.id];
          const isMember = memberIds.has(c.id);
          const isPending = !isMember && status === 'pending';
          return (
            <View key={c.id}>
              {/* Hairline between rows, inset past the avatar. None above the first. */}
              {index > 0 && (
                <View style={[styles.separator, rtl ? { marginRight: SEPARATOR_INSET } : { marginLeft: SEPARATOR_INSET }]} />
              )}
              <View style={[styles.cardRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                <CommunityAvatar community={c} size={46} />

                <View style={styles.textGroup}>
                  <View style={[styles.nameRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                    <AppText weight="semiBold" numberOfLines={1} ellipsizeMode="tail" style={[styles.cardName, { textAlign: rtl ? 'right' : 'left', flexShrink: 1 }]}>
                      {c.name}
                    </AppText>
                    {isMember ? (
                      <View style={[styles.statusBadge, { backgroundColor: '#E9F5EC' }]}>
                        <AppText weight="semiBold" style={[styles.statusBadgeText, { color: '#2F7A45' }]}>{rtl ? 'חבר' : 'Member'}</AppText>
                      </View>
                    ) : isPending ? (
                      <View style={[styles.statusBadge, { backgroundColor: '#FBEFD9' }]}>
                        <AppText weight="semiBold" style={[styles.statusBadgeText, { color: '#9A5B0E' }]}>{rtl ? 'ממתין' : 'Pending'}</AppText>
                      </View>
                    ) : null}
                  </View>
                  <View style={[styles.metaRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                    <Users size={12} color="#8B8898" strokeWidth={1.5} />
                    <AppText weight="regular" style={styles.memberCount}>
                      {c.members.length} {t('communities.members')}
                    </AppText>
                  </View>
                </View>

                {isMember ? (
                  <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={() => navigateToCommunity(c.id)} activeOpacity={0.8} hitSlop={{ top: 5, bottom: 5 }}>
                    <AppText weight="semiBold" style={styles.btnTextSecondary}>{rtl ? 'פתח צ׳אט' : 'Open chat'}</AppText>
                  </TouchableOpacity>
                ) : isPending ? (
                  <TouchableOpacity
                    style={[styles.btn, styles.btnMuted, styles.btnMutedRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}
                    hitSlop={{ top: 5, bottom: 5 }}
                    onPress={() => confirmCancelJoin(c.id, c.name ?? '')}
                    accessibilityRole="button"
                    accessibilityLabel={rtl ? 'ביטול בקשת הצטרפות' : 'Withdraw join request'}
                    activeOpacity={0.7}
                  >
                    <AppText weight="semiBold" style={styles.btnTextMuted}>{rtl ? 'בקשה נשלחה' : 'Requested'}</AppText>
                    <X size={13} color="#6B6880" strokeWidth={2.5} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={() => requestToJoin(c.id, user?.displayName ?? '')} activeOpacity={0.8} hitSlop={{ top: 5, bottom: 5 }}>
                    <AppText weight="bold" style={styles.btnTextPrimary}>{rtl ? 'הצטרף' : 'Join'}</AppText>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}
        </View>
      )}

      {/* Clears the + button: it sits 110 up and is 56 tall. */}
      <View style={{ height: 180 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // The pro chats sheet supplies the side padding.
  container: { paddingTop: 0 },
  sectionRow: { alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: INK },
  // One container for every Discover row; rows carry no surface of their own.
  listCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EFEDF5',
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#4C1D95',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: '#F0EEF6' },
  cardRow: { alignItems: 'center', gap: 11, paddingVertical: 11, paddingHorizontal: 14 },
  textGroup: { flex: 1, minWidth: 0 },
  nameRow: { alignItems: 'center', gap: 6 },
  metaRow: { alignItems: 'center', gap: 4, marginTop: 2 },
  cardName: { fontSize: 14.5, fontWeight: '600', color: INK },
  memberCount: { fontSize: 11.5, color: '#8B8898' },
  statusBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  statusBadgeText: { fontSize: 10, fontWeight: '600' },
  // 34 visual + 5 of hitSlop each side ≈ 44.
  btn: {
    height: 34,
    borderRadius: 11,
    paddingHorizontal: 15,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  btnSecondary: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DDD7EC' },
  btnPrimary: { backgroundColor: VIOLET },
  btnMuted: { backgroundColor: '#F4F3F8' },
  btnMutedRow: { gap: 6 },
  btnTextSecondary: { color: VIOLET_DEEP, fontSize: 12.5, fontWeight: '600' },
  btnTextPrimary: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '700' },
  btnTextMuted: { color: '#6B6880', fontSize: 12.5, fontWeight: '600' },
  searchRow: {
    alignItems: 'center',
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EAE8F0',
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
    paddingHorizontal: 14,
    gap: 8,
    shadowColor: '#4C1D95',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  searchRowFocused: { borderColor: '#8B5CF6' },
  searchInput: { flex: 1, fontSize: 14, color: '#1A1626' },
  clearBtn: { fontSize: 14, paddingHorizontal: 4 },
  filterChip: {
    borderWidth: 1,
    borderColor: '#EAE8F0',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: '#FFFFFF',
  },
  filterChipActive: { backgroundColor: VIOLET, borderColor: VIOLET },
  filterChipText: { fontSize: 12.5, fontWeight: '600', color: '#6B6880' },
  filterChipTextActive: { color: '#FFFFFF' },
  emptyState: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  emptyIconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 16, marginTop: 4, textAlign: 'center' },
  emptySubtitle: { fontSize: 13, maxWidth: 260, textAlign: 'center' },
  emptyCta: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },

  stripWrap: { position: 'relative' },
  stripOuter: { marginHorizontal: -SHEET_PAD, marginBottom: 8 },
  stripScroll: { paddingHorizontal: SHEET_PAD, paddingTop: 8, paddingBottom: 4, gap: 12 },
  stripItem: { alignItems: 'center', width: 64 },
  // Matches CommunityAvatar's geometry at size 56 (radius = round(56 × 0.26) =
  // 15), so a "+" tile occupies exactly the space a real community does. Dashed,
  // so it reads as an empty slot rather than a community.
  placeholderSquare: {
    width: 56,
    height: 56,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#DED8EE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderPlus: { fontSize: 24, lineHeight: 28, color: '#9C99AD' },
  stripArrow: {
    position: 'absolute',
    top: 20,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDE9F7',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    shadowColor: '#4C1D95',
    shadowOpacity: 0.14,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  stripArrowLeft: { left: 0 },
  stripArrowRight: { right: 0 },
  stripIconWrap: { position: 'relative', marginBottom: 6 },
  stripTitle: { fontSize: 10.5, fontWeight: '500', color: '#5B5768', textAlign: 'center', maxWidth: 64 },
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
