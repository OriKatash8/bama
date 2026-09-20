import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { rtlSafe } from '@utils/formatters';
import { View, Text, TextInput, ScrollView, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, Modal, useWindowDimensions, Platform } from 'react-native';
import { useRouter, useSegments, useFocusEffect } from 'expo-router';
import { MapPin, CalendarDays, CalendarCheck, MessageCircle, SlidersHorizontal, Search, Inbox, History, Briefcase, LayoutGrid } from 'lucide-react-native';
import { Screen } from '@components/layout/Screen';
import { GradientBand } from '@components/ui/GradientBand';
import { AppText } from '@components/ui/AppText';
import { NoticeBoardCard } from '@features/noticeboard/components/NoticeBoardCard';
import { ProjectDetailModal } from '@features/noticeboard/components/ProjectDetailModal';
import { NoticeHistoryView } from '@features/noticeboard/components/NoticeHistoryView';
import { useHiddenProjects } from '@features/noticeboard/hooks/useHiddenProjects';
import { hasNoticeHistory, isWithinHistoryWindow } from '@features/noticeboard/history';
import { NotifPermissionBanner } from '@features/notifications/components/NotifPermissionBanner';
import { NotifSoftAskModal } from '@features/notifications/components/NotifSoftAskModal';
import { useNotifPermissionPrompt } from '@features/notifications/hooks/useNotifPermissionPrompt';
import { useNotifSoftAsk } from '@features/notifications/hooks/useNotifSoftAsk';
import { useSentOffers } from '@features/offers/hooks/useSentOffers';
import { useNoticeboard } from '@features/noticeboard/hooks/useNoticeboard';
import { SlotBlockedSheet } from '@features/pricing/components/SlotBlockedSheet';
import { usePricingConfig } from '@features/pricing/hooks/usePricingConfig';
import { useFeeArrears } from '@features/pricing/hooks/useFeeArrears';
import { FeeArrearsSheet } from '@features/pricing/components/FeeArrearsSheet';
import { listenToSlotUsage, type SlotUsage } from '@features/pricing/services/slotsService';
import { listenToMyFees } from '@features/pricing/services/feesService';
import { getVacantSlots, roleIdForCategory } from '@features/noticeboard/matching';
import { offeredCategoriesByProject, hasUnofferedMatchingSlot } from '@features/noticeboard/unoffered';
import { ROLE_TO_LEGACY_CATEGORY, ROLE_BY_ID, labelOf } from '@features/crew/data/categories';
import { useProfile } from '@features/profile/hooks/useProfile';
import { useUiStore } from '@core/stores/uiStore';
import { useAuthStore } from '@core/stores/authStore';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
import { queryDocuments, getDocument } from '@core/firebase/firestore';
import { where } from '@core/firebase/firestore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import type { ProjectRequest, ProjectFee } from '@core/types/project';
import type { Chat } from '@features/chat/types';
import { useTabBarClearance, useModeAccent } from '@core/navigation/floatingTabBar';

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

/** Text. */
const TEXT = '#000000';
/** Buttons, outlines and icons. */
const BLUE = '#1D4ED8';
const STAT_BG = '#f5f6fb';
const PAGE_BG = '#FAFAFC';
/** Chrome draws `outline: auto` over the focus border; RN's types have no 'none'. */
const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null;

const CARD_SHADOW = {
  shadowColor: '#1e4fa3',
  shadowOpacity: 0.06,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 3,
} as const;

export default function DashboardScreen() {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  // The sheet's 20pt side padding, both sides.
  const cardWidth = screenWidth - 40;

  const { profile, isLoading: profileLoading } = useProfile();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const router = useRouter();
  const segments = useSegments();
  const modeSegment = segments[0];

  const language = useSettingsStore((s) => s.language);
  // The search magnifier takes the mode colour: purple client, blue pro.
  const { accent: searchIconColor } = useModeAccent();
  const tabBarClearance = useTabBarClearance();
  const font = useAppFont();
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const rowDir = rtl ? 'row-reverse' : ('row' as const);

  const roleSkills = useMemo(
    () => profileLoading ? null : (profile?.roleSkills ?? []),
    [profile?.roleSkills, profileLoading]
  );

  const { requests: visible, posters, isLoading, dismiss: hookDismiss, undismiss } = useNoticeboard(roleSkills, currentUserId);

  // Slot state, so a blocked professional is stopped BEFORE composing an offer
  // rather than by hireProfessional rejecting it afterwards. Same query the
  // server enforces with, so the two cannot disagree.
  const pricing = usePricingConfig();
  const [slotUsage, setSlotUsage] = useState<SlotUsage | null>(null);
  // This professional's own engagements, so the blocked sheet can say WHY each
  // slot is held. A slot held by a contested engagement is not one he can close.
  const [myFees, setMyFees] = useState<Map<string, ProjectFee> | null>(null);
  const [blockedFor, setBlockedFor] = useState<ProjectRequest | null>(null);
  const arrears = useFeeArrears();
  const [arrearsOpen, setArrearsOpen] = useState(false);

  useEffect(() => {
    if (!currentUserId) return;
    return listenToSlotUsage(currentUserId, setSlotUsage, pricing.maxOpenProjects);
  }, [currentUserId, pricing.maxOpenProjects]);

  // Only to explain the slots, never to gate anything: the cap is counted from
  // `slotHolders` on the projects above, and a fee record must not decide
  // capacity. This says which of those slots is held by a contest he cannot
  // close, so the sheet stops asking him to close it.
  useEffect(() => {
    if (!currentUserId) return;
    return listenToMyFees(currentUserId, setMyFees);
  }, [currentUserId]);

  // One cap for everyone. There is no tier that lifts it — capacity is not for
  // sale. A slot frees when the project completes or is cancelled, and a slot
  // held by a CONTESTED engagement frees when BAMA resolves it — which is a
  // third case the professional cannot act on, named as such in the sheet.
  const slotsBlocked = slotUsage?.atCap === true;

  /**
   * Open a notice, unless something stops this professional taking new work.
   * Returns true when blocked.
   *
   * ARREARS ARE CHECKED FIRST, and the two are not the same kind of thing. The
   * slot cap is a scheduling limit that a full calendar explains; arrears are an
   * account-standing matter that an empty calendar does not fix. A professional
   * in arrears with a free slot must still be told about the arrears, so testing
   * slots first would show them the wrong sheet.
   *
   * Both are pre-emptive mirrors of what `hireProfessional` enforces server-side —
   * they stop an offer being composed that the accept would reject.
   */
  function guardSlots(request: ProjectRequest): boolean {
    if (arrears.blocked) {
      setArrearsOpen(true);
      return true;
    }
    if (!slotsBlocked) return false;
    setBlockedFor(request);
    return true;
  }

  const lang: 'he' | 'en' = rtl ? 'he' : 'en';

  // ── Sort & filter (client-side over the already-matched list) ──
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'direct_first'>('newest');
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  /** Visual only: the search field's focus border. */
  const [searchFocused, setSearchFocused] = useState(false);
  const [search, setSearch] = useState('');
  const [sortModalVisible, setSortModalVisible] = useState(false);
  // The board shows the noticeboard by default; in-progress projects and history
  // are deliberate detours in the same page, not something competing for it.
  const [view, setView] = useState<'board' | 'in_progress' | 'history'>('board');
  const onBoard = view === 'board';
  const showInProgress = view === 'in_progress';
  const showHistory = view === 'history';

  // Opening a project's chat leaves the screen; coming back should land on the
  // board, not on whatever detour you were in. The toggle is view state, not a
  // preference — the spec is "the noticeboard page shows only the noticeboard by
  // default". Deps stay empty so the callback identity is stable and the effect
  // fires once per focus.
  useFocusEffect(
    useCallback(() => {
      setView('board');
    }, []),
  );

  // Same hook instance the history badge already used — `offers` comes free, so
  // the "have I bid on this?" check costs no extra query or listener.
  const { pendingCount, offers: sentOffers, loading: sentOffersLoading } = useSentOffers();
  // History lists only the last couple of days. Nothing is deleted: the offers
  // stay live for their clients, and `sentOffers` itself still feeds the board's
  // "already offered" logic below, whatever an offer's age.
  const historyOffers = useMemo(
    () => sentOffers.filter((o) => isWithinHistoryWindow(o.ts * 1000)),
    [sentOffers],
  );
  const historyPendingCount = useMemo(
    () => historyOffers.filter((o) => o.data.status === 'pending').length,
    [historyOffers],
  );
  // Restorable hidden notices. Always on for this page: the History button only
  // shows when there is something in it, so the page needs the count up front.
  const { projects: hiddenProjects, loading: hiddenLoading, restore: restoreHidden } = useHiddenProjects(true);
  const historyAvailable = hasNoticeHistory(historyOffers.length, hiddenProjects.length);
  const notifPrompt = useNotifPermissionPrompt();
  const softAsk = useNotifSoftAsk();
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

  // A project stays on the board while it still holds a vacant slot this pro can
  // fill AND has not already bid on. This replaces dismissing the whole project
  // on the first offer, which hid the other roles on it forever. See unoffered.ts.
  const offeredByProject = useMemo(() => offeredCategoriesByProject(sentOffers), [sentOffers]);
  const biddable = useMemo(
    () =>
      visible.filter((r) =>
        hasUnofferedMatchingSlot(
          r,
          // Direct invites bypass skill matching, as they do in useNoticeboard.
          r.targetProfessionalId === currentUserId ? null : (roleSkills ?? []),
          offeredByProject.get(r.id),
        ),
      ),
    [visible, roleSkills, offeredByProject, currentUserId],
  );

  const displayed = useMemo(() => {
    let list = biddable;
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
  }, [biddable, roleFilter, sortBy, search, currentUserId]);

  // Legacy category strings (for ProjectDetailModal's role-Q&A display, which is keyed by them).
  const categories = useMemo(
    () => (roleSkills ?? []).map((rs) => ROLE_TO_LEGACY_CATEGORY[rs.role]).filter(Boolean),
    [roleSkills],
  );

  const { showToast } = useUiStore();

  const [selected, setSelected] = useState<ProjectRequest | null>(null);
  const [selectedView, setSelectedView] = useState<'details' | 'bid'>('details');

  const [activeProjects, setActiveProjects] = useState<ActiveProject[]>([]);
  const [activeProjectsLoading, setActiveProjectsLoading] = useState(true);


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

  function handleApply(_request: ProjectRequest) {
    showToast(t('noticeboard.offer_submitted'), 'success');
    // A moment of intent: they just asked a client for work and will want to know
    // the reply. No-ops unless the OS prompt has never been shown.
    softAsk.ask('offers');
    // Deliberately NOT dismiss(): that wrote dismissedNotices, hiding the whole
    // project permanently because the pro bid on one of its roles. The notice now
    // drops out on its own once every slot they match is bid on — see `biddable`.
    setSelected(null);
  }

  const openProjectsLabel = displayed.length === 1
    ? t('noticeboard.open_projects_one', { count: displayed.length })
    : t('noticeboard.open_projects_other', { count: displayed.length });

  return (
    <Screen scrollable={false} backgroundColor={PAGE_BG}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarClearance }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Notice board ── the header sits on the violet band. */}
        <GradientBand style={styles.band} flip>
        <View style={[styles.noticeHeaderRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          <View style={{ flex: 1 }}>
            {/* Plain Text, not AppText: AppText applies its own font after the
                style, which would override the ExtraBold face. */}
            <Text
              style={[
                styles.sectionTitle,
                { fontFamily: rtl ? 'Heebo-ExtraBold' : font.bold.fontFamily, textAlign: rtl ? 'right' : 'left' },
              ]}
            >
              {showInProgress ? t('noticeboard.projects_in_progress') : showHistory ? t('history.title') : t('noticeboard.notice_board')}
            </Text>
            {onBoard && !isLoading && (
              <AppText weight="regular" style={[styles.sectionCount, { textAlign: rtl ? 'right' : 'left' }]}>
                {openProjectsLabel}
              </AppText>
            )}
          </View>
          {/* History — only when there is some (a sent offer or a restorable hidden
              notice). Like in-progress it names its destination: while in history
              it offers the board back, so it stays visible there. */}
          {(showHistory || historyAvailable) && (
          <TouchableOpacity
            style={styles.navBtn}
            onPress={() => setView((v) => (v === 'history' ? 'board' : 'history'))}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={showHistory ? t('noticeboard.notice_board') : t('history.title')}
            testID="noticeboard-history-btn"
          >
            {showHistory
              ? <LayoutGrid size={14} color={BLUE} strokeWidth={2.3} />
              : <History size={14} color={BLUE} strokeWidth={2.1} />}
            <AppText weight="semiBold" style={styles.navBtnText} numberOfLines={2}>
              {showHistory ? t('noticeboard.notice_board') : t('history.title')}
            </AppText>
            {!showHistory && historyPendingCount > 0 && (
              <View
                style={[
                  styles.historyBadge,
                  { [rtl ? 'left' : 'right']: -4 },
                ]}
              >
                <AppText weight="bold" style={styles.historyBadgeText}>{historyPendingCount > 99 ? '99+' : historyPendingCount}</AppText>
              </View>
            )}
          </TouchableOpacity>
          )}
          {/* Names its DESTINATION, not its state: on the board it offers
              in-progress, on in-progress it offers the board. A toggle whose label
              stays put leaves you guessing whether it is on or where it goes —
              this way there is always a visible button back. Never filled, since
              it navigates rather than filtering. */}
          <TouchableOpacity
            style={styles.navBtn}
            onPress={() => setView((v) => (v === 'in_progress' ? 'board' : 'in_progress'))}
            activeOpacity={0.8}
            accessibilityRole="button"
          >
            {showInProgress
              ? <LayoutGrid size={14} color={BLUE} strokeWidth={2.3} />
              : <Briefcase size={14} color={BLUE} strokeWidth={2.3} />}
            <AppText weight="semiBold" style={styles.navBtnText} numberOfLines={2}>
              {showInProgress ? t('noticeboard.notice_board') : t('noticeboard.in_progress_toggle')}
            </AppText>
          </TouchableOpacity>
          {onBoard && !isLoading && biddable.length > 0 && (
            <TouchableOpacity
              style={[styles.navBtn, filterActive && styles.navBtnActive]}
              onPress={openSortModal}
              activeOpacity={0.8}
            >
              <SlidersHorizontal size={14} color={filterActive ? '#ffffff' : BLUE} strokeWidth={2.3} />
              <AppText weight="semiBold" style={[styles.navBtnText, filterActive && styles.navBtnTextActive]} numberOfLines={2}>
                {t('noticeboard.filter_short')}
              </AppText>
            </TouchableOpacity>
          )}
        </View>
        </GradientBand>

        <View style={styles.sheet}>
        {/* Below the band, not above it: the band's pull-down extension sits
            directly above the band and would paint over anything there. */}
        {notifPrompt.visible && pendingCount > 0 && (
          <NotifPermissionBanner context="offers" onDismiss={notifPrompt.dismiss} />
        )}

        {/* ── In-progress projects — shown only while the toggle is on ── */}
        {showInProgress && activeProjects.length > 0 && (
          <View style={styles.projectsList}>
              {activeProjects.map(({ chat, project, clientName }) => (
                <View key={chat.id} style={styles.projectCard}>
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
                      <MapPin size={14} color={BLUE} strokeWidth={1.5} />
                      <AppText weight="regular" style={styles.projectStatLabel}>{t('chats_page.stat_location')}</AppText>
                      <AppText weight="bold" style={styles.projectStatValue} numberOfLines={1}>{project.location || '—'}</AppText>
                    </View>
                    <View style={styles.projectStatSquare}>
                      <CalendarDays size={14} color={BLUE} strokeWidth={1.5} />
                      <AppText weight="regular" style={styles.projectStatLabel}>{t('chats_page.stat_deadline')}</AppText>
                      <AppText weight="bold" style={styles.projectStatValue} numberOfLines={1}>{formatDeadlineShort(project.deadline, t('builder.flexible'))}</AppText>
                    </View>
                    <View style={styles.projectStatSquare}>
                      <CalendarCheck size={14} color={BLUE} strokeWidth={1.5} />
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
              ))}
          </View>
        )}

        {/* Toggled on with nothing running: say so, rather than showing an empty
            screen with no explanation of what the button did. */}
        {showInProgress && !activeProjectsLoading && activeProjects.length === 0 && (
          <View style={styles.inProgressEmpty}>
            <AppText weight="semiBold" style={styles.emptyText}>{t('noticeboard.no_in_progress')}</AppText>
            <AppText weight="regular" style={[styles.emptySubtext, { color: TEXT }]}>
              {t('noticeboard.no_in_progress_sub')}
            </AppText>
          </View>
        )}

        {showInProgress && activeProjectsLoading && (
          <ActivityIndicator color={BLUE} style={{ marginVertical: 24 }} />
        )}

        {/* ── History — shown only while that detour is on ── */}
        {showHistory && (
          <NoticeHistoryView
            offers={historyOffers}
            offersLoading={sentOffersLoading}
            hidden={hiddenProjects}
            hiddenLoading={hiddenLoading}
            // The write is useHiddenProjects' (arrayRemove on dismissedNotices);
            // the board reads dismissedNotices once, so drop it locally too.
            onRestore={(id) => { void restoreHidden(id); undismiss(id); }}
            onOpenProject={(p) => { if (guardSlots(p)) return; setSelectedView('details'); setSelected(p); }}
            posters={posters}
            cardWidth={cardWidth}
          />
        )}

        {onBoard && !isLoading && biddable.length > 0 && (
          <View style={[styles.searchRow, searchFocused && styles.searchRowFocused, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
            <TextInput
              style={[styles.searchInput, webNoOutline, { ...font.regular, textAlign: rtl ? 'right' : 'left' }]}
              placeholder={rtlSafe(rtl ? 'חיפוש בלוח המודעות…' : 'Search the notice board…', rtl)}
              placeholderTextColor="#9C99AD"
              value={search}
              onChangeText={setSearch}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              returnKeyType="search"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} activeOpacity={0.7}>
                <AppText weight="regular" style={[styles.clearBtn, { color: BLUE }]}>✕</AppText>
              </TouchableOpacity>
            )}
            <Search size={18} color={searchIconColor} strokeWidth={2.5} />
          </View>
        )}

        {!onBoard ? null : isLoading ? (
          <ActivityIndicator size="large" color={BLUE} style={{ marginTop: 40 }} />
        ) : displayed.length === 0 ? (
          <View style={[styles.center, { minHeight: screenHeight * 0.6 }]}>
            <Inbox size={48} color={BLUE} strokeWidth={1.5} style={{ marginBottom: 8 }} />
            <Text style={[styles.emptyText, { ...font.semiBold, color: TEXT, textAlign: 'center' }]}>
              {t('noticeboard.no_projects')}
            </Text>
            <Text style={[styles.emptySubtext, { ...font.regular, color: TEXT, textAlign: 'center' }]}>
              {t('noticeboard.check_back')}
            </Text>
            {!activeProjectsLoading && activeProjects.length === 0 && (
              <View style={styles.upgradeWrap}>
                <Text style={[styles.upgradeHint, { ...font.regular, color: TEXT, textAlign: 'center' }]}>
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
                onPress={() => { if (guardSlots(item)) return; setSelectedView('details'); setSelected(item); }}
                onApply={() => { if (guardSlots(item)) return; setSelectedView('details'); setSelected(item); }}
                onMakeOffer={() => { if (guardSlots(item)) return; setSelectedView('bid'); setSelected(item); }}
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
        </View>
      </ScrollView>

      <FeeArrearsSheet
        visible={arrearsOpen}
        arrears={arrears}
        onClose={() => setArrearsOpen(false)}
      />

      <SlotBlockedSheet
        visible={blockedFor !== null}
        targetProject={blockedFor}
        occupied={slotUsage?.projects ?? []}
        myFees={myFees ?? undefined}
        onClose={() => setBlockedFor(null)}
      />

      <ProjectDetailModal
        request={selected}
        onClose={() => setSelected(null)}
        onApply={() => selected && handleApply(selected)}
        onDismiss={() => selected && dismiss(selected.id)}
        isApplying={false}
        initialView={selectedView}
        professionalCategories={categories}
        roleSkills={selected?.targetProfessionalId === currentUserId ? null : (roleSkills ?? [])}
        offeredCategories={selected ? offeredByProject.get(selected.id) : undefined}
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


      <NotifSoftAskModal context={softAsk.context} onClose={softAsk.close} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // paddingBottom (tab bar clearance) is set inline. The lists inside this
  // scroll add only their own 8pt rhythm — they used to add another 100 each,
  // stacking on top of this.
  scrollContent: {},

  band: { paddingTop: 20, paddingHorizontal: 20, paddingBottom: 40 },
  /** Overlaps the band's bottom edge; zIndex so it paints over the gradient. */
  sheet: {
    flexGrow: 1,
    backgroundColor: PAGE_BG,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    marginTop: -22,
    zIndex: 1,
    paddingTop: 18,
    paddingHorizontal: 20,
    shadowColor: '#4C1D95',
    shadowOpacity: 0.09,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -6 },
    elevation: 6,
  },

  // Section headers — white on the band
  sectionTitle: {
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: '#FFFFFF',
  },
  sectionCount: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.82)',
  },

  // Notice board header + sort/filter. The band supplies the padding.
  noticeHeaderRow: {
    alignItems: 'center',
    gap: 8,
  },
  searchRow: {
    alignItems: 'center',
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EAE8F0',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    marginBottom: 12,
    gap: 8,
    shadowColor: '#4C1D95',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  searchRowFocused: { borderColor: BLUE },
  searchInput: { flex: 1, fontSize: 14, color: TEXT },
  clearBtn: { fontSize: 14, paddingHorizontal: 4 },
  // Icon over a small label, at a FIXED width: the middle button's label swaps
  // ("In progress" <-> "Notice board") and must not resize, or the page title
  // would reflow every time the view changes. A column, so nothing inside needs
  // a direction.
  navBtn: {
    // Explicit width AND height. English labels differ in line count — "Filter"
    // and "History" are one line, "In progress" and "Notice board" are two — so
    // without a fixed height the three buttons were visibly different sizes.
    // 50 × 44: the smallest that still fits. At 9pt the English "progress" is
    // 40.6pt against the 41pt left inside padding and border; 44 is the touch
    // minimum, and a two-line label (14 + 2 + 2×11) fits inside it.
    width: 50,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 3,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BLUE,
    backgroundColor: '#FFFFFF',
  },
  navBtnActive: { backgroundColor: BLUE },
  navBtnText: { fontSize: 9, lineHeight: 11, fontWeight: '600', color: '#000000', textAlign: 'center' },
  navBtnTextActive: { color: '#FFFFFF' },
  // White ring so the badge reads against the gradient behind the button.
  historyBadge: {
    position: 'absolute',
    top: -5,
    minWidth: 16,
    height: 16,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: BLUE,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyBadgeText: { fontSize: 9, fontWeight: '800', color: '#FFFFFF', lineHeight: 11 },
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
  sortHeader: { fontSize: 18, color: TEXT, marginBottom: 12 },
  sortSectionTitle: { fontSize: 12, color: TEXT, marginBottom: 8 },
  sortOptions: { flexWrap: 'wrap', gap: 8 },
  sortOption: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BLUE,
    backgroundColor: '#fff',
  },
  sortOptionActive: { backgroundColor: BLUE, borderColor: BLUE },
  sortOptionText: { fontSize: 13, color: TEXT, textAlign: 'center' },
  sortOptionTextActive: { color: '#ffffff' },
  sortFooter: { marginTop: 18, alignItems: 'center', gap: 12 },
  sortClearBtn: { paddingHorizontal: 12, paddingVertical: 12 },
  sortClearText: { fontSize: 14, color: TEXT },
  sortApplyBtn: { flex: 1, paddingVertical: 14, borderRadius: 16, backgroundColor: BLUE, alignItems: 'center' },
  sortApplyText: { fontSize: 15, color: '#ffffff' },

  // In-progress section
  // Vertical list, same rhythm as the noticeboard's gridContent — the two
  // sections swap into the same slot, so they should scroll the same way.
  projectsList: { paddingVertical: 8, gap: 12 },
  inProgressEmpty: { alignItems: 'center', paddingHorizontal: 32, paddingVertical: 48, gap: 6 },

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
    color: TEXT,
    lineHeight: 23,
  },
  projectCardClient: {
    fontSize: 12,
    color: TEXT,
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
    color: TEXT,
    textAlign: 'center',
  },
  projectStatValue: {
    fontSize: 12,
    color: TEXT,
    textAlign: 'center',
  },
  projectDivider: {
    height: 1,
    backgroundColor: '#F2F0F7',
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
  gridContent: { paddingVertical: 8, gap: 12 },

  // Empty state
  center: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 40 },
  emptyText: { fontSize: 17, fontWeight: '600', color: TEXT },
  emptySubtext: { fontSize: 14 },
  upgradeWrap: { alignItems: 'center', gap: 10, marginTop: 14 },
  upgradeHint: { fontSize: 14, lineHeight: 20, paddingHorizontal: 24 },
  upgradeBtn: { backgroundColor: BLUE, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 22 },
  upgradeBtnText: { color: '#ffffff', fontSize: 14 },

});
