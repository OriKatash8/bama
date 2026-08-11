import { useState, useMemo, useEffect } from 'react';
import { View, Text, ScrollView, FlatList, StyleSheet, ActivityIndicator, Platform, TouchableOpacity, useWindowDimensions, Alert } from 'react-native';
import { Image } from 'expo-image';

const LOCATION_ICON = require('../../../../../assets/images/location-icon.png');
import { useRouter, useSegments } from 'expo-router';
import { Calendar } from 'lucide-react-native';
import { Screen } from '@components/layout/Screen';
import { NoticeBoardCard } from '@features/noticeboard/components/NoticeBoardCard';
import { ProjectDetailModal } from '@features/noticeboard/components/ProjectDetailModal';
import { useNoticeboard } from '@features/noticeboard/hooks/useNoticeboard';
import { useProfile } from '@features/profile/hooks/useProfile';
import { useUiStore } from '@core/stores/uiStore';
import { useTheme } from '@core/hooks/useTheme';
import { useAuthStore } from '@core/stores/authStore';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
import { queryDocuments, getDocument, updateDocument, arrayUnion } from '@core/firebase/firestore';
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
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = screenWidth - 32;
  const { user, profile, isLoading: profileLoading } = useProfile();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const router = useRouter();
  const segments = useSegments();
  const modeSegment = segments[0];

  const language = useSettingsStore((s) => s.language);
  const font = useAppFont();
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';

  const categories = useMemo(
    () => profileLoading ? null : [...new Set((profile?.skills ?? []).map(s => s.category))],
    [profile?.skills, profileLoading]
  );

  const { requests, posters, isLoading } = useNoticeboard(categories, currentUserId);

  const { showToast } = useUiStore();
  const colors = useTheme();

  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!currentUserId) return;
    getDocument<{ dismissedNotices?: string[] }>(`users/${currentUserId}`).then((doc) => {
      if (doc?.dismissedNotices?.length) {
        setDismissed(new Set(doc.dismissedNotices));
      }
    });
  }, [currentUserId]);
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

  const visible = requests.filter((r) => !dismissed.has(r.id));

  function dismiss(id: string) {
    setDismissed((prev) => new Set([...prev, id]));
    if (selected?.id === id) setSelected(null);
    if (currentUserId) {
      updateDocument(`users/${currentUserId}`, { dismissedNotices: arrayUnion(id) });
    }
  }

  function handleDismiss(id: string) {
    Alert.alert(
      t('noticeboard.dismiss_title'),
      t('noticeboard.dismiss_body'),
      [
        { text: t('noticeboard.dismiss_cancel'), style: 'cancel' },
        { text: t('noticeboard.dismiss_confirm'), style: 'destructive', onPress: () => dismiss(id) },
      ]
    );
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

  const headingStyle = {
    color: '#004aad',
    ...font.bold,
  };

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
        {!activeProjectsLoading && activeProjects.length > 0 && (
          <View style={styles.projectsSection}>
            <Text style={[styles.heading, headingStyle, { marginBottom: 16, textAlign: 'center' }]}>
              {t('noticeboard.projects_in_progress')}
            </Text>
            <ScrollView
              horizontal={true}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.projectsScroll}
            >
              {activeProjects.map(({ chat, project, clientName }) => (
                <TouchableOpacity
                  key={chat.id}
                  style={[styles.projectCard, { borderColor: colors.border }]}
                  onPress={() => router.push(`/${modeSegment}/(tabs)/chats/${chat.id}` as never)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.projectCardTitle, { ...font.forText(project.title, 'bold'), color: '#004aad', textAlign: rtl ? 'right' : 'left' }]} numberOfLines={1}>
                    {project.title}
                  </Text>
                  <Text style={[styles.projectCardMeta, { ...font.forText(clientName, 'regular'), color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
                    {t('noticeboard.client_prefix')}{clientName}
                  </Text>
                  <View style={[styles.projectCardRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                    <Calendar size={12} color={colors.textMuted} strokeWidth={1.5} />
                    <Text style={[styles.projectCardMeta, { ...font.regular, color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
                      {formatDeadline(project.deadline)}
                    </Text>
                  </View>
                  <View style={[styles.projectCardRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                    <Image
                      source={LOCATION_ICON}
                      style={styles.locationIcon}
                      contentFit="contain"
                      cachePolicy="memory-disk"
                    />
                    <Text style={[styles.projectCardMeta, { ...font.forText(project.location, 'regular'), color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]} numberOfLines={1}>
                      {project.location}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        <View style={styles.header}>
          <Text style={[styles.heading, headingStyle]}>
            {t('noticeboard.notice_board')}
          </Text>
          {!isLoading && (
            <Text style={[styles.count, { ...font.regular, color: colors.textMuted, textAlign: 'center' }]}>
              {openProjectsLabel}
            </Text>
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
                onDismiss={() => handleDismiss(item.id)}
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
        onDismiss={() => selected && handleDismiss(selected.id)}
        isApplying={false}
        initialView={selectedView}
        professionalCategories={categories ?? []}
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
  projectsSection: { marginBottom: 8 },
  projectsScroll: { paddingHorizontal: 16, gap: 12, paddingBottom: 16 },
  projectCard: {
    width: 180,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 4,
    backgroundColor: '#ffffff',
  },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#004aad', marginBottom: 16 },
  projectCardTitle: { fontSize: 14, fontWeight: '700' },
  projectCardMeta: { fontSize: 12 },
  projectCardRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationIcon: { width: 14, height: 14 },
  header: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 8,
  },
  heading: { fontSize: 36, fontWeight: '800', fontFamily: 'Montserrat-Regular', textAlign: 'center', textTransform: 'uppercase' },
  count: { fontSize: 13, fontWeight: '500' },
  flex: { flex: 1 },
  scrollContent: { paddingBottom: 100 },
  gridContent: { paddingVertical: 8, gap: 12, alignItems: 'center' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 8 },
  emptyText: { fontSize: 17, fontWeight: '600' },
  emptySubtext: { fontSize: 14 },
});
