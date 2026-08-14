import { useState, useMemo, useEffect } from 'react';
import { View, Text, ScrollView, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, useWindowDimensions } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { MapPin, CalendarDays } from 'lucide-react-native';
import { Screen } from '@components/layout/Screen';
import { AppText } from '@components/ui/AppText';
import { NoticeBoardCard } from '@features/noticeboard/components/NoticeBoardCard';
import { ProjectDetailModal } from '@features/noticeboard/components/ProjectDetailModal';
import { useNoticeboard } from '@features/noticeboard/hooks/useNoticeboard';
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
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = screenWidth - 32;
  const inProgressCardWidth = Math.round(screenWidth * 0.82);

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

  const categories = useMemo(
    () => profileLoading ? null : [...new Set((profile?.skills ?? []).map(s => s.category))],
    [profile?.skills, profileLoading]
  );

  const { requests: visible, posters, isLoading, dismiss: hookDismiss } = useNoticeboard(categories, currentUserId);

  const { showToast } = useUiStore();
  const colors = useTheme();

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

  const openProjectsLabel = visible.length === 1
    ? t('noticeboard.open_projects_one', { count: visible.length })
    : t('noticeboard.open_projects_other', { count: visible.length });

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
            <View style={[styles.sectionHeader, { flexDirection: rowDir }]}>
              <AppText weight="bold" style={styles.sectionTitle}>
                {t('noticeboard.projects_in_progress')}
              </AppText>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.projectsScroll}
            >
              {activeProjects.map(({ chat, project, clientName }) => (
                <TouchableOpacity
                  key={chat.id}
                  style={[styles.projectCard, { width: inProgressCardWidth }]}
                  onPress={() => router.push(`/${modeSegment}/(tabs)/chats/${chat.id}` as never)}
                  activeOpacity={0.75}
                >
                  {/* Header: client initial avatar + title/name column */}
                  <View style={[styles.projectCardHeader, { flexDirection: rowDir }]}>
                    <View style={styles.projectClientAvatar}>
                      <AppText weight="bold" style={styles.projectClientInitial}>
                        {clientName.charAt(0).toUpperCase()}
                      </AppText>
                    </View>
                    <View style={[styles.projectCardNameCol, { alignItems: rtl ? 'flex-end' : 'flex-start' }]}>
                      <AppText weight="bold" style={[styles.projectCardTitle, { textAlign: rtl ? 'right' : 'left' }]} numberOfLines={1}>
                        {project.title}
                      </AppText>
                      <AppText weight="regular" style={[styles.projectCardClient, { textAlign: rtl ? 'right' : 'left' }]} numberOfLines={1}>
                        {t('noticeboard.client_prefix')}{clientName}
                      </AppText>
                    </View>
                  </View>

                  {/* Stat squares: location + end date */}
                  <View style={[styles.projectStatsRow, { flexDirection: rowDir }]}>
                    <View style={styles.projectStatSquare}>
                      <MapPin size={12} color={MUTED} strokeWidth={1.5} />
                      <AppText weight="regular" style={styles.projectStatLabel}>
                        {t('chats_page.stat_location')}
                      </AppText>
                      <AppText weight="bold" style={styles.projectStatValue} numberOfLines={1}>
                        {project.location || '—'}
                      </AppText>
                    </View>
                    <View style={styles.projectStatSquare}>
                      <CalendarDays size={12} color={MUTED} strokeWidth={1.5} />
                      <AppText weight="regular" style={styles.projectStatLabel}>
                        {t('chats_page.stat_deadline')}
                      </AppText>
                      <AppText weight="bold" style={styles.projectStatValue} numberOfLines={1}>
                        {formatDeadlineShort(project.deadline, t('builder.flexible'))}
                      </AppText>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── Notice board ── */}
        <View style={[styles.sectionHeader, { flexDirection: rowDir, paddingHorizontal: 16 }]}>
          <AppText weight="bold" style={styles.sectionTitle}>
            {t('noticeboard.notice_board')}
          </AppText>
          {!isLoading && (
            <AppText weight="regular" style={styles.sectionCount}>
              {openProjectsLabel}
            </AppText>
          )}
        </View>

        {isLoading ? (
          <ActivityIndicator size="large" color="#cb6ce6" style={{ marginTop: 40 }} />
        ) : visible.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={[styles.emptyText, { ...font.semiBold, color: colors.textSec, textAlign: rtl ? 'right' : 'left' }]}>
              {t('noticeboard.no_projects')}
            </Text>
            <Text style={[styles.emptySubtext, { ...font.regular, color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
              {t('noticeboard.check_back')}
            </Text>
          </View>
        ) : (
          <FlatList
            data={visible}
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
        professionalCategories={categories ?? []}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { paddingBottom: 140 },

  // Section headers
  sectionHeader: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sectionTitle: {
    fontSize: 16,
    color: BLUE,
  },
  sectionCount: {
    fontSize: 12,
    color: MUTED,
  },

  // In-progress section
  projectsSection: { marginBottom: 4 },
  projectsScroll: { paddingHorizontal: 16, gap: 12, paddingBottom: 12 },

  projectCard: {
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#ffffff',
    gap: 12,
    ...CARD_SHADOW,
  },
  projectCardHeader: {
    alignItems: 'center',
    gap: 10,
  },
  projectClientAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  projectClientInitial: {
    fontSize: 15,
    color: '#ffffff',
  },
  projectCardNameCol: {
    flex: 1,
    gap: 2,
  },
  projectCardTitle: {
    fontSize: 14,
    color: BLUE,
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
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 3,
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

  // Notice board
  gridContent: { paddingVertical: 8, gap: 12, paddingBottom: 100 },

  // Empty state
  center: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 8 },
  emptyText: { fontSize: 17, fontWeight: '600' },
  emptySubtext: { fontSize: 14 },

});
