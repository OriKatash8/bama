import { useState, useMemo, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Platform, TouchableOpacity } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { MapPin, Calendar } from 'lucide-react-native';
import { Screen } from '@components/layout/Screen';
import { NoticeBoardCard } from '@features/noticeboard/components/NoticeBoardCard';
import { ProjectDetailModal } from '@features/noticeboard/components/ProjectDetailModal';
import { useNoticeboard } from '@features/noticeboard/hooks/useNoticeboard';
import { useProfile } from '@features/profile/hooks/useProfile';
import { useUiStore } from '@core/stores/uiStore';
import { useTheme } from '@core/hooks/useTheme';
import { useAuthStore } from '@core/stores/authStore';
import { useSettingsStore } from '@core/stores/settingsStore';
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

function getGreetingKey(): string {
  const hour = new Date().getHours();
  if (hour >= 4 && hour < 12) return 'noticeboard.greeting_morning';
  if (hour >= 12 && hour < 18) return 'noticeboard.greeting_afternoon';
  if (hour >= 18 && hour < 22) return 'noticeboard.greeting_evening';
  return 'noticeboard.greeting_night';
}

function formatDeadline(deadline: string): string {
  const d = new Date(deadline);
  if (isNaN(d.getTime())) return deadline;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export default function DashboardScreen() {
  const { user, profile, isLoading: profileLoading } = useProfile();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const router = useRouter();
  const segments = useSegments();
  const modeSegment = segments[0];

  const language = useSettingsStore((s) => s.language);
  const fontFamilyBold = language === 'he' ? 'Heebo-Bold' : 'Montserrat-Bold';
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';

  const categories = useMemo(
    () => profileLoading ? null : [...new Set((profile?.skills ?? []).map(s => s.category))],
    [profile?.skills, profileLoading]
  );

  const { requests, posters, isLoading } = useNoticeboard(categories);

  const { showToast } = useUiStore();
  const colors = useTheme();

  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<ProjectRequest | null>(null);
  const [selectedView, setSelectedView] = useState<'details' | 'bid'>('details');

  const [activeProjects, setActiveProjects] = useState<ActiveProject[]>([]);

  useEffect(() => {
    if (!currentUserId) {
      console.log('[ActiveProjects] No currentUserId, skipping fetch');
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
      }
    }

    fetchActiveProjects();
  }, [currentUserId]);

  const visible = requests.filter((r) => !dismissed.has(r.id));

  function dismiss(id: string) {
    setDismissed((prev) => new Set([...prev, id]));
    if (selected?.id === id) setSelected(null);
  }

  function handleApply(request: ProjectRequest) {
    showToast(t('noticeboard.offer_submitted'), 'success');
    dismiss(request.id);
  }

  const gradientText = Platform.OS === 'web' ? ({
    background: 'linear-gradient(to right, #004aad, #cb6ce6)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  } as object) : {};

  const greeting = t(getGreetingKey());
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
        <View style={styles.topBar}>
          <Text style={[styles.greetText, { color: colors.text, textAlign: rtl ? 'right' : 'left' }, gradientText]} numberOfLines={2}>
            {greeting}, {user?.displayName} :)
          </Text>
        </View>

        {activeProjects.length > 0 && (
          <View style={styles.projectsSection}>
            <Text style={[styles.heading, { color: colors.text, marginBottom: 16, textAlign: rtl ? 'right' : 'left' }, gradientText]}>
              {t('noticeboard.projects_in_progress')}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.projectsScroll}
            >
              {activeProjects.map(({ chat, project, clientName }) => (
                <TouchableOpacity
                  key={chat.id}
                  style={[styles.projectCard, { borderColor: colors.border }]}
                  onPress={() => router.push(`/${modeSegment}/(tabs)/chats/${chat.id}`)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.projectCardTitle, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]} numberOfLines={1}>
                    {project.title}
                  </Text>
                  <Text style={[styles.projectCardMeta, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
                    {t('noticeboard.client_prefix')}{clientName}
                  </Text>
                  <View style={[styles.projectCardRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                    <Calendar size={12} color={colors.textMuted} strokeWidth={1.5} />
                    <Text style={[styles.projectCardMeta, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
                      {formatDeadline(project.deadline)}
                    </Text>
                  </View>
                  <View style={[styles.projectCardRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                    <MapPin size={12} color={colors.textMuted} strokeWidth={1.5} />
                    <Text style={[styles.projectCardMeta, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]} numberOfLines={1}>
                      {project.location}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        <View style={styles.header}>
          <Text style={[styles.heading, { fontFamily: fontFamilyBold, color: colors.text }, gradientText]}>
            {t('noticeboard.notice_board')}
          </Text>
          {!isLoading && (
            <Text style={[styles.count, { color: colors.textMuted, textAlign: 'center' }]}>
              {openProjectsLabel}
            </Text>
          )}
        </View>

        {isLoading ? (
          <ActivityIndicator size="large" color="#cb6ce6" style={{ marginTop: 40 }} />
        ) : visible.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={[styles.emptyText, { color: colors.textSec, textAlign: rtl ? 'right' : 'left' }]}>
              {t('noticeboard.no_projects')}
            </Text>
            <Text style={[styles.emptySubtext, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
              {t('noticeboard.check_back')}
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {visible.map((item) => (
              <NoticeBoardCard
                key={item.id}
                request={item}
                poster={posters[item.clientId]}
                onPress={() => { setSelectedView('details'); setSelected(item); }}
                onApply={() => { setSelectedView('details'); setSelected(item); }}
                onMakeOffer={() => { setSelectedView('bid'); setSelected(item); }}
                onDismiss={() => dismiss(item.id)}
                isApplying={false}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <ProjectDetailModal
        request={selected}
        onClose={() => setSelected(null)}
        onApply={() => selected && handleApply(selected)}
        onDismiss={() => selected && dismiss(selected.id)}
        isApplying={false}
        initialView={selectedView}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 48,
  },
  greetText: { fontSize: 26, fontWeight: '600', textAlign: 'left' },
  projectsSection: { marginBottom: 8, alignItems: 'center' },
  projectsScroll: { paddingHorizontal: 16, gap: 12, paddingBottom: 16 },
  projectCard: {
    width: 200,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 4,
    backgroundColor: '#ffffff',
  },
  projectCardTitle: { fontSize: 14, fontWeight: '700' },
  projectCardMeta: { fontSize: 12 },
  projectCardRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  header: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 8,
  },
  heading: { fontSize: 36, fontWeight: '800', fontFamily: 'Montserrat', textAlign: 'center', textTransform: 'uppercase' },
  count: { fontSize: 13, fontWeight: '500' },
  flex: { flex: 1 },
  scrollContent: { paddingBottom: 100 },
  list: { paddingVertical: 8 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 8 },
  emptyText: { fontSize: 17, fontWeight: '600' },
  emptySubtext: { fontSize: 14 },
});
