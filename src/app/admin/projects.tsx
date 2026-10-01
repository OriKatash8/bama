import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Search } from 'lucide-react-native';
import { getDocument, queryDocuments } from '@core/firebase/firestore';
import {
  AdminPage,
  AdminText,
  Card,
  CardHead,
  Chip,
  EmptyState,
  HEEBO,
  PillButton,
  RADIUS,
  Row,
  SPACE,
  TYPE,
  WhoBlock,
  useAdminPalette,
  useScopedT,
} from '@features/admin/ui';
import { filterProjects, type AdminProjectRow } from '@features/admin/projects/filterProjects';
import type { ProjectRequest } from '@core/types/project';
import type { User } from '@core/types/user';

/** The pill is the focus affordance; the browser's input outline would sit inside it. */
const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null;

function fmtDate(ms: number): string {
  if (!ms) return '—';
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

type Tone = 'accent' | 'warn' | 'good' | 'bad';
const STATUS_TONE: Record<string, Tone> = { open: 'accent', in_progress: 'warn', completed: 'good', cancelled: 'bad' };

/**
 * Every project — title, client, status, date — with a search by title or
 * client name. Opened from the dashboard's "total projects" tile; not a tab.
 * Tapping a project opens its group chat, read-only (admin/project-chat). A
 * project has no chat until its first hire.
 */
export default function ProjectsAdmin() {
  const p = useAdminPalette();
  const { t, rowDir, textAlign } = useScopedT('admin_projects');
  const router = useRouter();

  const [rows, setRows] = useState<AdminProjectRow[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [term, setTerm] = useState('');

  const load = useCallback(async () => {
    setState('loading');
    try {
      const projects = await queryDocuments<ProjectRequest & { id: string }>('projects');
      // One read per client, not per project.
      const clientIds = [...new Set(projects.map((pr) => pr.clientId).filter(Boolean))];
      const clients = await Promise.all(clientIds.map((id) => getDocument<User>(`users/${id}`).catch(() => null)));
      const nameOf = new Map(clientIds.map((id, i) => [id, clients[i]?.displayName ?? '']));
      setRows(projects.map((pr) => ({
        id: pr.id,
        title: pr.title ?? '',
        clientName: nameOf.get(pr.clientId) ?? '',
        status: pr.status ?? 'open',
        createdAt: (pr.createdAt?.seconds ?? 0) * 1000,
        chatId: pr.chatId ?? null,
      })));
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => filterProjects(rows, term), [rows, term]);

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/admin' as never);
  }

  function open(row: AdminProjectRow) {
    if (!row.chatId) return;
    router.push(`/admin/project-chat?chatId=${row.chatId}&projectId=${row.id}` as never);
  }

  return (
    <AdminPage title={t('title')} subtitle={t('greeting')} onBack={goBack}>
      <Card testID="projects-list">
        <CardHead
          title={t('all_projects')}
          side={state === 'ready' ? <View testID="projects-count"><Chip label={String(rows.length)} tabular /></View> : undefined}
        />
        <View style={[styles.searchBar, { flexDirection: rowDir }]}>
          <View style={[styles.search, { flexDirection: rowDir, backgroundColor: p.surface2, borderColor: p.border }]}>
            <Search size={15} color={p.text3} strokeWidth={2.4} />
            <TextInput
              style={[styles.searchInput, webNoOutline, { color: p.text, fontFamily: HEEBO.regular, textAlign }]}
              value={term}
              onChangeText={setTerm}
              placeholder={t('search_placeholder')}
              placeholderTextColor={p.text3}
              accessibilityLabel={t('search_placeholder')}
              autoCapitalize="none"
              autoCorrect={false}
              testID="projects-search"
            />
          </View>
        </View>

        {state === 'loading' ? (
          <View style={styles.busy}>
            <ActivityIndicator size="small" color={p.accent} testID="projects-loading" />
          </View>
        ) : state === 'error' ? (
          <View style={[styles.errorBox, { alignItems: textAlign === 'right' ? 'flex-end' : 'flex-start' }]}>
            <AdminText style={[TYPE.rowMeta, { color: p.text2, textAlign }]}>{t('list_failed')}</AdminText>
            <PillButton variant="primary" label={t('retry')} onPress={() => void load()} testID="projects-retry" />
          </View>
        ) : rows.length === 0 ? (
          <EmptyState text={t('no_projects')} testID="projects-empty" />
        ) : shown.length === 0 ? (
          <EmptyState text={t('no_match')} testID="projects-no-match" />
        ) : (
          shown.map((row) => {
            const tone = STATUS_TONE[row.status] ?? 'accent';
            const meta = [row.clientName || t('unknown_client'), fmtDate(row.createdAt)].join(' · ');
            return (
              <Row
                key={row.id}
                rowDir={rowDir}
                testID={`project-row-${row.id}`}
                onPress={() => open(row)}
                accessibilityLabel={`${row.title}, ${meta}`}
              >
                <WhoBlock name={row.title || '—'} meta={meta} textAlign={textAlign} />
                {row.chatId ? (
                  <StatusPill tone={tone} label={t(`status_${row.status}`)} />
                ) : (
                  <View style={[styles.side, { alignItems: textAlign === 'right' ? 'flex-start' : 'flex-end' }]}>
                    <StatusPill tone={tone} label={t(`status_${row.status}`)} />
                    <AdminText style={[TYPE.rowMeta, { color: p.text3 }]}>{t('no_chat')}</AdminText>
                  </View>
                )}
              </Row>
            );
          })
        )}
      </Card>
    </AdminPage>
  );
}

/** A project's status: the palette's tone on its tint. */
function StatusPill({ tone, label }: { tone: Tone; label: string }) {
  const p = useAdminPalette();
  const [bg, fg] =
    tone === 'good' ? [p.goodBg, p.good]
      : tone === 'warn' ? [p.warnBg, p.warn]
        : tone === 'bad' ? [p.badBg, p.bad]
          : [p.accentSoft, p.accent];
  return (
    <View style={[styles.statusPill, { backgroundColor: bg }]}>
      <AdminText weight="semiBold" numberOfLines={1} style={[TYPE.chip, { color: fg }]}>
        {label}
      </AdminText>
    </View>
  );
}

const styles = StyleSheet.create({
  searchBar: { alignItems: 'center', gap: 10, paddingHorizontal: SPACE.rowPadH, paddingBottom: 10 },
  search: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 8,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  busy: { paddingVertical: 20, alignItems: 'center' },
  errorBox: { padding: SPACE.rowPadH, gap: 10 },
  side: { gap: 2, flexShrink: 0 },
  statusPill: { borderRadius: RADIUS.pill, paddingVertical: 3, paddingHorizontal: 10, flexShrink: 0 },
});
