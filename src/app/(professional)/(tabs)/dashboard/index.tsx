import { useState, useMemo, useEffect, useRef } from 'react';
import { View, Text, TextInput, ScrollView, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, Modal, useWindowDimensions } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { MapPin, CalendarDays, CalendarCheck, MessageCircle, ChevronLeft, ChevronRight, SlidersHorizontal, Search, Inbox, History } from 'lucide-react-native';
import { Screen } from '@components/layout/Screen';
import { AppText } from '@components/ui/AppText';
import { NoticeBoardCard } from '@features/noticeboard/components/NoticeBoardCard';
import { ProjectDetailModal } from '@features/noticeboard/components/ProjectDetailModal';
import { NoticeHistorySheet } from '@features/noticeboard/components/NoticeHistorySheet';
import { useSentOffers } from '@features/offers/hooks/useSentOffers';
import { useNoticeboard } from '@features/noticeboard/hooks/useNoticeboard';
import { getVacantSlots, roleIdForCategory } from '@features/noticeboard/matching';
import { ROLE_TO_LEGACY_CATEGORY, ROLE_BY_ID, labelOf } from '@features/crew/data/categories';
import { useProfile } from '@features/profile/hooks/useProfile';
import { useUiStore } from '@core/stores/uiStore';
import { useTheme } from '@core/hooks/useTheme';
import { useAuthStore } from '@core/stores/authStore';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
import { queryDocuments, getDocument } from '@core/firebase/firestore';
import { where } from '@core/firebase/firestore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import type { ProjectRequest } from '@core/types/project';
import type { Chat } from '@features/chat/types';

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

type ActiveProject = {
  chat: Chat;
  project: ProjectRequest;
  clientName: string;
};

function formatDeadlineShort(deadline?: string, flexibleLabel?: string): string {
  if (!deadline) return '—';
  if (deadline === 'flexible') return flexibleLabel ?? '—';
  const [y, m, d] = deadline.split('-');
  if (!y || !m || !d) return deadline;
  return `${d}/${m}`;
}

const BLUE = '#1e4fa3';
const MUTED = '#8890b0';
const STAT_BG = '#f5f6fb';
const CARD_SHADOW = {
  shadowColor: '#1e4fa3',
  shadowOpacity: 0.06,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 3,
} as const;

export default function DashboardScreen() {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const cardWidth = screenWidth - 32;
  const inProgressCardWidth = screenWidth - 104;
  const inProgressCardGap = 40;

  const { profile, isLoading: profileLoading } = useProfile();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const router = useRouter();
  const segments = useSegments();
  const modeSegment = segments[0];

  const language = useSettingsStore((s) => s.language);
  const font = useAppFont();
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const rowDir = rtl ? 'row-reverse' : ('row' as const);

  const roleSkills = useMemo(
    () => profileLoading ? null : (profile?.roleSkills ?? []),
    [profile?.roleSkills, profileLoading]
  );

  const { requests: visible, posters, isLoading, dismiss: hookDismiss } = useNoticeboard(roleSkills, currentUserId);

  const lang: 'he' | 'en' = rtl ? 'he' : 'en';

  // ── Sort & filter (client-side over the already-matched list) ──
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'direct_first'>('newest');
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { pendingCount } = useSentOffers();
  const [draftSort, setDraftSort] = useState<'newest' | 'oldest' | 'direct_first'>('newest');
  const [draftRole, setDraftRole] = useState<string | null>(null);

  const proRoles = useMemo(
    () => (roleSkills ?? []).map((rs) => ({ id: rs.role, label: labelOf(ROLE_BY_ID[rs.role], lang) })).filter((r) => !!ROLE_BY_ID[r.id]),
    [roleSkills, lang],
  );
  const showRoleFilter = proRoles.length > 1;
  const filterActive = sortBy !== 'newest' || roleFilter !== null;

  function openSortModal() {
    setDraftSort(sortBy);
    setDraftRole(roleFilter);
    setSortModalVisible(true);
  }
  function applySort() {
    setSortBy(draftSort);
    setRoleFilter(draftRole);
    setSortModalVisible(false);
  }
  function clearSort() {
    setDraftSort('newest');
    setDraftRole(null);
    setSortBy('newest');
    setRoleFilter(null);
    setSortModalVisible(false);
  }

  const displayed = useMemo(() => {
    let list = visible;
    if (roleFilter) {
      list = list.filter((r) => getVacantSlots(r).some((s) => roleIdForCategory(s.category) === roleFilter));
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        (r.title ?? '').toLowerCase().includes(q) ||
        (r.description ?? '').toLowerCase().includes(q) ||
        (r.location ?? '').toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => {
      if (sortBy === 'direct_first') {
        // Notices addressed directly to this professional float to the top,
        // newest-first within each group.
        const ad = a.targetProfessionalId === currentUserId ? 0 : 1;
        const bd = b.targetProfessionalId === currentUserId ? 0 : 1;
        if (ad !== bd) return ad - bd;
        return b.createdAt.seconds - a.createdAt.seconds;
      }
      return sortBy === 'oldest'
        ? a.createdAt.seconds - b.createdAt.seconds
        : b.createdAt.seconds - a.createdAt.seconds;
    });
  }, [visible, roleFilter, sortBy, search, currentUserId]);

  // Legacy category strings (for ProjectDetailModal's role-Q&A display, which is keyed by them).
  const categories = useMemo(
    () => (roleSkills ?? []).map((rs) => ROLE_TO_LEGACY_CATEGORY[rs.role]).filter(Boolean),
    [roleSkills],
  );

  const { showToast } = useUiStore();
  const colors = useTheme();

  const [selected, setSelected] = useState<ProjectRequest | null>(null);
  const [selectedView, setSelectedView] = useState<'details' | 'bid'>('details');

  const [activeProjects, setActiveProjects] = useState<ActiveProject[]>([]);
  const [activeProjectsLoading, setActiveProjectsLoading] = useState(true);
  const [inProgressIndex, setInProgressIndex] = useState(0);
  const inProgressScrollRef = useRef<ScrollView>(null);

  function scrollToInProgress(index: number) {
    inProgressScrollRef.current?.scrollTo({ x: index * screenWidth, animated: true });
  }

  useEffect(() => {
    if (!currentUserId) {
      setActiveProjectsLoading(false);
      return;
    }

    async function fetchActiveProjects() {
      try {
        console.log('[ActiveProjects] Fetching for uid:', currentUserId);

        const chats = await queryDocuments<Chat>(
          'chats',
          where('type', '==', 'group'),
          where('members', 'array-contains', currentUserId)
        );

        console.log('[ActiveProjects] Group chats found:', chats.length);

        chats.forEach((c) => {
          console.log(`[ActiveProjects] Chat ${c.id} — projectId: ${c.projectId ?? 'none'}`);
        });

        const withProject = chats.filter((c) => Boolean(c.projectId));
        console.log('[ActiveProjects] Chats with a projectId:', withProject.length);

        const results = await Promise.all(
          withProject.map(async (chat) => {
            const project = await getDocument<ProjectRequest>(`projects/${chat.projectId}`);
            if (!project) {
              console.log(`[ActiveProjects] Project not found for chat ${chat.id}, projectId: ${chat.projectId}`);
              return null;
            }
            if (project.status === 'completed' || project.status === 'cancelled') {
              console.log(`[ActiveProjects] Filtered out project ${project.id} — status: ${project.status}`);
              return null;
            }
            // Only projects the current user is actually a professional on (an
            // assigned slot) — not ones they merely own as a client or were removed from.
            if (!(project.filledSlots ?? []).some((s) => s.professionalId === currentUserId)) {
              return null;
            }

            const clientDoc = await getDocument<{ displayName: string }>(`users/${project.clientId}`);
            const clientName = clientDoc?.displayName ?? 'Unknown';

            return { chat, project, clientName } satisfies ActiveProject;
          })
        );

        const active = results.filter((r): r is ActiveProject => r !== null);
        console.log('[ActiveProjects] Active projects after filtering:', active.length);
        setActiveProjects(active);
      } catch (err) {
        console.error('[ActiveProjects] Error fetching active projects:', err);
      } finally {
        setActiveProjectsLoading(false);
      }
    }

    fetchActiveProjects();
  }, [currentUserId]);

  function dismiss(id: string) {
    hookDismiss(id);
    if (selected?.id === id) setSelected(null);
  }

  function handleApply(request: ProjectRequest) {
    showToast(t('noticeboard.offer_submitted'), 'success');
    dismiss(request.id);
  }

  const openProjectsLabel = displayed.length === 1
    ? t('noticeboard.open_projects_one', { count: displayed.length })
    : t('noticeboard.open_projects_other', { count: displayed.length });

  return (
    <Screen scrollable={false}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── In-progress projects ── */}
        {!activeProjectsLoading && activeProjects.length > 0 && (
          <View style={styles.projectsSection}>
            {/* Compact section header */}
            <View style={[styles.sectionHeader, { flexDirection: rowDir, justifyContent: 'flex-start', gap: 8 }]}>
              <AppText weight="bold" style={[styles.sectionTitle, { textAlign: rtl ? 'right' : 'left' }]}>
                {t('noticeboard.projects_in_progress')}
              </AppText>
              <AppText weight="regular" style={styles.inProgressCounter}>
                {inProgressIndex + 1}/{activeProjects.length}
              </AppText>
            </View>

            <View style={styles.carouselWrap}>
            <ScrollView
              ref={inProgressScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.projectsScroll}
              pagingEnabled
              scrollEventThrottle={16}
              onScroll={(e) => {
                const idx = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
                setInProgressIndex(Math.max(0, Math.min(idx, activeProjects.length - 1)));
              }}
            >
              {activeProjects.map(({ chat, project, clientName }) => (
                <View key={chat.id} style={{ width: screenWidth, alignItems: 'center' }}>
                <View
                  style={[styles.projectCard, { width: inProgressCardWidth }]}
                >
                  {/* Zone 1: title + client name */}
                  <View style={[styles.projectCardHeader, { flexDirection: rowDir }]}>
                    <View style={[styles.projectCardNameCol, { alignItems: rtl ? 'flex-end' : 'flex-start' }]}>
                      <AppText weight="bold" style={[styles.projectCardTitle, { textAlign: rtl ? 'right' : 'left' }]} numberOfLines={2}>
                        {project.title}
                      </AppText>
                      <AppText weight="regular" style={[styles.projectCardClient, { textAlign: rtl ? 'right' : 'left' }]} numberOfLines={1}>
                        {t('noticeboard.client_prefix')}{clientName}
                      </AppText>
                    </View>
                  </View>

                  {/* Zone 2: 3 stat squares */}
                  <View style={[styles.projectStatsRow, { flexDirection: rowDir }]}>
                    <View style={styles.projectStatSquare}>
                      <MapPin size={14} color={MUTED} strokeWidth={1.5} />
                      <AppText weight="regular" style={styles.projectStatLabel}>{t('chats_page.stat_location')}</AppText>
                      <AppText weight="bold" style={styles.projectStatValue} numberOfLines={1}>{project.location || '—'}</AppText>
                    </View>
                    <View style={styles.projectStatSquare}>
                      <CalendarDays size={14} color={MUTED} strokeWidth={1.5} />
                      <AppText weight="regular" style={styles.projectStatLabel}>{t('chats_page.stat_deadline')}</AppText>
                      <AppText weight="bold" style={styles.projectStatValue} numberOfLines={1}>{formatDeadlineShort(project.deadline, t('builder.flexible'))}</AppText>
                    </View>
                    <View style={styles.projectStatSquare}>
                      <CalendarCheck size={14} color={MUTED} strokeWidth={1.5} />
                      <AppText weight="regular" style={styles.projectStatLabel}>{t('chats_page.stat_execution')}</AppText>
                      <AppText weight="bold" style={styles.projectStatValue} numberOfLines={1}>{formatDeadlineShort(project.exec, t('builder.flexible'))}</AppText>
                    </View>
                  </View>

                  {/* Divider */}
                  <View style={styles.projectDivider} />

                  {/* Zone 3: open chat button */}
                  <View style={[styles.projectBottomRow, { flexDirection: rowDir }]}>
                    <TouchableOpacity
                      style={[styles.projectChatBtn, { flexDirection: rowDir }]}
                      onPress={() => router.push(`/${modeSegment}/(tabs)/chats/${chat.id}` as never)}
                      activeOpacity={0.8}
                    >
                      <MessageCircle size={13} color="#ffffff" strokeWidth={2} />
                      <AppText weight="semiBold" style={styles.projectChatBtnText}>{t('chats_page.open_chat')}</AppText>
                    </TouchableOpacity>
                  </View>
                </View>
                </View>
              ))}
            </ScrollView>
              {inProgressIndex > 0 && (
                <TouchableOpacity
                  style={[styles.arrowBtn, { left: 0 }]}
                  onPress={() => scrollToInProgress(inProgressIndex - 1)}
                  activeOpacity={0.7}
                >
                  <View style={styles.arrowCircle}>
                    <ChevronLeft size={18} color="#004aad" strokeWidth={2.5} />
                  </View>
                </TouchableOpacity>
              )}
              {inProgressIndex < activeProjects.length - 1 && (
                <TouchableOpacity
                  style={[styles.arrowBtn, { right: 0 }]}
                  onPress={() => scrollToInProgress(inProgressIndex + 1)}
                  activeOpacity={0.7}
                >
                  <View style={styles.arrowCircle}>
                    <ChevronRight size={18} color="#004aad" strokeWidth={2.5} />
                  </View>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* ── Notice board ── */}
        <View style={[styles.noticeHeaderRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          <View style={{ flex: 1 }}>
            <AppText weight="bold" style={[styles.sectionTitle, { textAlign: rtl ? 'right' : 'left' }]}>
              {t('noticeboard.notice_board')}
            </AppText>
            {!isLoading && (
              <AppText weight="regular" style={[styles.sectionCount, { textAlign: rtl ? 'right' : 'left' }]}>
                {openProjectsLabel}
              </AppText>
            )}
          </View>
          {/* History — always available (sent offers + hidden projects) */}
          <TouchableOpacity
            style={styles.historyBtn}
            onPress={() => setHistoryOpen(true)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('history.title')}
          >
            <History size={18} color="#004aad" strokeWidth={2.2} />
            {pendingCount > 0 && (
              <View style={[styles.historyBadge, { backgroundColor: colors.accent, borderColor: colors.bg }]}>
                <AppText weight="bold" style={styles.historyBadgeText}>{pendingCount > 99 ? '99+' : pendingCount}</AppText>
              </View>
            )}
          </TouchableOpacity>
          {!isLoading && visible.length > 0 && (
            <TouchableOpacity
              style={[styles.sortBtn, filterActive && styles.sortBtnActive, { flexDirection: rtl ? 'row-reverse' : 'row' }]}
              onPress={openSortModal}
              activeOpacity={0.8}
            >
              <SlidersHorizontal size={15} color={filterActive ? '#ffffff' : '#004aad'} strokeWidth={2.5} />
              <AppText weight="semiBold" style={[styles.sortBtnText, filterActive && styles.sortBtnTextActive]}>
                {t('noticeboard.sort_filter')}
              </AppText>
            </TouchableOpacity>
          )}
        </View>

        {!isLoading && visible.length > 0 && (
          <View style={[styles.searchRow, { backgroundColor: '#ffffff', borderColor: colors.border, flexDirection: rtl ? 'row-reverse' : 'row' }]}>
            <Search size={16} color={colors.placeholder} strokeWidth={2.5} />
            <TextInput
              style={[styles.searchInput, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}
              placeholder={rtl ? 'חיפוש בלוח המודעות…' : 'Search the notice board…'}
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
        )}

        {isLoading ? (
          <ActivityIndicator size="large" color="#cb6ce6" style={{ marginTop: 40 }} />
        ) : displayed.length === 0 ? (
          <View style={[styles.center, { minHeight: screenHeight * 0.6 }]}>
            <Inbox size={48} color={colors.textMuted} strokeWidth={1.5} style={{ marginBottom: 8 }} />
            <Text style={[styles.emptyText, { ...font.semiBold, color: colors.textSec, textAlign: 'center' }]}>
              {t('noticeboard.no_projects')}
            </Text>
            <Text style={[styles.emptySubtext, { ...font.regular, color: colors.textMuted, textAlign: 'center' }]}>
              {t('noticeboard.check_back')}
            </Text>
            {!activeProjectsLoading && activeProjects.length === 0 && (
              <View style={styles.upgradeWrap}>
                <Text style={[styles.upgradeHint, { ...font.regular, color: colors.textMuted, textAlign: 'center' }]}>
                  {t('noticeboard.upgrade_profile_hint')}
                </Text>
                <TouchableOpacity
                  style={styles.upgradeBtn}
                  onPress={() => router.push('/(professional)/(tabs)/profile?edit=1')}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.upgradeBtnText, { ...font.bold }]}>{t('noticeboard.upgrade_profile_btn')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : (
          <FlatList
            data={displayed}
            keyExtractor={(item) => item.id}
            numColumns={1}
            scrollEnabled={false}
            contentContainerStyle={styles.gridContent}
            renderItem={({ item }) => (
              <NoticeBoardCard
                request={item}
                poster={posters[item.clientId]}
                onPress={() => { setSelectedView('details'); setSelected(item); }}
                onApply={() => { setSelectedView('details'); setSelected(item); }}
                onMakeOffer={() => { setSelectedView('bid'); setSelected(item); }}
                onDismiss={() => dismiss(item.id)}
                isApplying={false}
                isDirectInvite={item.targetProfessionalId === currentUserId}
                directInviteLabel={t('noticeboard.direct_invite')}
                compact
                cardWidth={cardWidth}
              />
            )}
          />
        )}
      </ScrollView>

      <ProjectDetailModal
        request={selected}
        onClose={() => setSelected(null)}
        onApply={() => selected && handleApply(selected)}
        onDismiss={() => selected && dismiss(selected.id)}
        isApplying={false}
        initialView={selectedView}
        professionalCategories={categories}
      />

      {/* Sort & filter modal */}
      <Modal visible={sortModalVisible} transparent animationType="fade" onRequestClose={() => setSortModalVisible(false)}>
        <View style={styles.sortOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setSortModalVisible(false)} />
          <View style={styles.sortCard}>
            <AppText weight="bold" style={[styles.sortHeader, { textAlign: rtl ? 'right' : 'left' }]}>
              {t('noticeboard.sort_filter')}
            </AppText>
            <AppText weight="semiBold" style={[styles.sortSectionTitle, { textAlign: rtl ? 'right' : 'left' }]}>
              {t('noticeboard.sort_title')}
            </AppText>
            <View style={[styles.sortOptions, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
              {(['newest', 'oldest', 'direct_first'] as const).map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.sortOption, draftSort === opt && styles.sortOptionActive]}
                  onPress={() => setDraftSort(opt)}
                  activeOpacity={0.8}
                >
                  <AppText weight="semiBold" style={[styles.sortOptionText, draftSort === opt && styles.sortOptionTextActive]}>
                    {t(opt === 'newest' ? 'noticeboard.sort_newest' : opt === 'oldest' ? 'noticeboard.sort_oldest' : 'noticeboard.sort_direct_first')}
                  </AppText>
                </TouchableOpacity>
              ))}
            </View>

            {showRoleFilter && (
              <>
                <AppText weight="semiBold" style={[styles.sortSectionTitle, { textAlign: rtl ? 'right' : 'left', marginTop: 14 }]}>
                  {t('noticeboard.filter_role_title')}
                </AppText>
                <View style={[styles.sortOptions, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                  <TouchableOpacity
                    style={[styles.sortOption, draftRole === null && styles.sortOptionActive]}
                    onPress={() => setDraftRole(null)}
                    activeOpacity={0.8}
                  >
                    <AppText weight="semiBold" style={[styles.sortOptionText, draftRole === null && styles.sortOptionTextActive]}>
                      {t('noticeboard.filter_role_all')}
                    </AppText>
                  </TouchableOpacity>
                  {proRoles.map((r) => (
                    <TouchableOpacity
                      key={r.id}
                      style={[styles.sortOption, draftRole === r.id && styles.sortOptionActive]}
                      onPress={() => setDraftRole(r.id)}
                      activeOpacity={0.8}
                    >
                      <AppText weight="semiBold" style={[styles.sortOptionText, draftRole === r.id && styles.sortOptionTextActive]}>
                        {r.label}
                      </AppText>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <View style={[styles.sortFooter, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
              <TouchableOpacity style={styles.sortClearBtn} onPress={clearSort} activeOpacity={0.8}>
                <AppText weight="semiBold" style={styles.sortClearText}>{t('noticeboard.clear')}</AppText>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sortApplyBtn} onPress={applySort} activeOpacity={0.85}>
                <AppText weight="semiBold" style={styles.sortApplyText}>{t('noticeboard.apply')}</AppText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Sent-offers + hidden-projects history */}
      <NoticeHistorySheet visible={historyOpen} onClose={() => setHistoryOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { paddingBottom: 140 },

  // Section headers
  sectionHeader: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sectionTitle: {
    fontSize: 24,
    color: BLUE,
  },
  sectionCount: {
    fontSize: 12,
    color: MUTED,
  },

  // Notice board header + sort/filter
  noticeHeaderRow: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  searchRow: {
    alignItems: 'center',
    borderRadius: 24,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    height: 44,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15 },
  clearBtn: { fontSize: 14, paddingHorizontal: 4 },
  sortBtn: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BLUE,
    backgroundColor: '#ffffff',
  },
  sortBtnActive: { backgroundColor: BLUE },
  sortBtnText: { fontSize: 13, color: BLUE },
  sortBtnTextActive: { color: '#ffffff' },
  historyBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BLUE,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyBadgeText: { fontSize: 10, color: '#ffffff', lineHeight: 13 },
  sortOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  sortCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
    maxHeight: '85%',
  },
  sortHeader: { fontSize: 18, color: BLUE, marginBottom: 12 },
  sortSectionTitle: { fontSize: 12, color: 'rgba(15,15,31,0.4)', marginBottom: 8 },
  sortOptions: { flexWrap: 'wrap', gap: 8 },
  sortOption: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,74,173,0.2)',
    backgroundColor: '#fff',
  },
  sortOptionActive: { backgroundColor: BLUE, borderColor: BLUE },
  sortOptionText: { fontSize: 13, color: BLUE, textAlign: 'center' },
  sortOptionTextActive: { color: '#ffffff' },
  sortFooter: { marginTop: 18, alignItems: 'center', gap: 12 },
  sortClearBtn: { paddingHorizontal: 12, paddingVertical: 12 },
  sortClearText: { fontSize: 14, color: 'rgba(15,15,31,0.4)' },
  sortApplyBtn: { flex: 1, paddingVertical: 14, borderRadius: 16, backgroundColor: BLUE, alignItems: 'center' },
  sortApplyText: { fontSize: 15, color: '#ffffff' },

  // In-progress section
  projectsSection: { marginBottom: 4 },
  projectsScroll: { paddingBottom: 12 },
  inProgressCounter: { fontSize: 13, color: '#8890b0' },
  carouselWrap: { position: 'relative' },
  arrowBtn: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    width: 36,
    zIndex: 10,
  },
  arrowCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,74,173,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  projectCard: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: '#ffffff',
    gap: 12,
    ...CARD_SHADOW,
  },
  projectCardHeader: {
    alignItems: 'center',
  },
  projectCardNameCol: {
    flex: 1,
    gap: 2,
  },
  projectCardTitle: {
    fontSize: 17,
    color: BLUE,
    lineHeight: 23,
  },
  projectCardClient: {
    fontSize: 12,
    color: MUTED,
  },
  projectStatsRow: {
    gap: 8,
  },
  projectStatSquare: {
    flex: 1,
    backgroundColor: STAT_BG,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 4,
  },
  projectStatLabel: {
    fontSize: 10,
    color: MUTED,
    textAlign: 'center',
  },
  projectStatValue: {
    fontSize: 12,
    color: BLUE,
    textAlign: 'center',
  },
  projectDivider: {
    height: 1,
    backgroundColor: 'rgba(30,79,163,0.12)',
  },
  projectBottomRow: {
    alignItems: 'center',
  },
  projectChatBtn: {
    alignItems: 'center',
    gap: 5,
    backgroundColor: BLUE,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  projectChatBtnText: {
    color: '#ffffff',
    fontSize: 12,
  },

  // Notice board
  gridContent: { paddingVertical: 8, gap: 12, paddingBottom: 100, paddingHorizontal: 16 },

  // Empty state
  center: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 40 },
  emptyText: { fontSize: 17, fontWeight: '600' },
  emptySubtext: { fontSize: 14 },
  upgradeWrap: { alignItems: 'center', gap: 10, marginTop: 14 },
  upgradeHint: { fontSize: 14, lineHeight: 20, paddingHorizontal: 24 },
  upgradeBtn: { backgroundColor: BLUE, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 22 },
  upgradeBtnText: { color: '#ffffff', fontSize: 14 },

});
