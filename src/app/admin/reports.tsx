import { useState, useEffect } from 'react';
import {
  View, StyleSheet, ScrollView, Pressable,
  ActivityIndicator, Image, Modal, TextInput,
} from 'react-native';
import {
  collection, onSnapshot, updateDoc, doc, getDoc, query, orderBy, Timestamp,
} from 'firebase/firestore';
import { db } from '@core/firebase/config';
import { callFunction } from '@core/firebase/functions';
import { useUiStore } from '@core/stores/uiStore';
import {
  AdminPage, AdminText, Card, CardHead, EmptyState, PillButton, Segment,
  RADIUS, SPACE, TYPE, useAdminPalette, useScopedT,
} from '@features/admin/ui';

type ModAction = 'warn' | 'suspend';
const moderateUser = callFunction<
  { targetUid: string; action: ModAction; reason: string; reportId?: string },
  { success: boolean; actionId: string }
>('moderateUser');

type Report = {
  id: string;
  /** Absent on user reports. 'community_deletion' is a community owner asking BAMA
   *  to delete their community (CommunityManageModal); it has no reported user. */
  type?: 'community_deletion';
  communityId?: string;
  communityName?: string;
  reporterId: string;
  reportedUserId: string;
  reportedUserName: string;
  reason: string;
  evidenceURLs: string[];
  status: 'pending' | 'reviewed' | 'resolved';
  createdAt: Timestamp | null;
};

type FilterTab = 'all' | 'pending' | 'reviewed' | 'resolved';
const FILTER_TABS: FilterTab[] = ['all', 'pending', 'reviewed', 'resolved'];

function formatDate(ts: Timestamp | null): string {
  if (!ts) return '—';
  const d = ts.toDate();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** The report's status as a tinted pill: pending → warn, reviewed → accent, resolved → good. */
function StatusChip({ status, label }: { status: Report['status']; label: string }) {
  const p = useAdminPalette();
  const [bg, fg] = {
    pending: [p.warnBg, p.warn],
    reviewed: [p.accentSoft, p.accent],
    resolved: [p.goodBg, p.good],
  }[status];
  return (
    <View style={[styles.chip, { backgroundColor: bg }]} testID="report-status">
      <AdminText weight="semiBold" numberOfLines={1} style={[TYPE.chip, { color: fg }]}>
        {label}
      </AdminText>
    </View>
  );
}

export default function ReportsAdmin() {
  const p = useAdminPalette();
  const { showToast } = useUiStore();
  const { t, rowDir, textAlign } = useScopedT('admin_reports');

  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>('pending');
  const [updating, setUpdating] = useState<Record<string, boolean>>({});
  const [resolvedNames, setResolvedNames] = useState<Record<string, string>>({});
  const [modTarget, setModTarget] = useState<{ report: Report; action: ModAction } | null>(null);
  const [modReason, setModReason] = useState('');
  const [modBusy, setModBusy] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Report)));
      setLoading(false);
    });
  }, []);

  // Resolve ids → current displayName: the reporter (always) and the reported
  // user only when its snapshot name is missing or degraded to the id.
  useEffect(() => {
    const needed: string[] = [];
    reports.forEach((r) => {
      if (r.reporterId) needed.push(r.reporterId);
      if (r.reportedUserId && (!r.reportedUserName || r.reportedUserName === r.reportedUserId)) {
        needed.push(r.reportedUserId);
      }
    });
    const unique = [...new Set(needed)].filter((id) => resolvedNames[id] === undefined);
    if (unique.length === 0) return;
    let active = true;
    (async () => {
      const entries = await Promise.all(
        unique.map(async (id) => {
          try {
            const snap = await getDoc(doc(db, 'users', id));
            return [id, (snap.data()?.displayName as string | undefined) ?? ''] as const;
          } catch {
            return [id, ''] as const;
          }
        }),
      );
      if (active) setResolvedNames((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    })();
    return () => { active = false; };
  }, [reports, resolvedNames]);

  function reportedName(r: Report): string {
    if (r.type === 'community_deletion') {
      return `${t('community_deletion')} · ${r.communityName || r.communityId || '—'}`;
    }
    if (r.reportedUserName && r.reportedUserName !== r.reportedUserId) return r.reportedUserName;
    return resolvedNames[r.reportedUserId] || r.reportedUserName || t('unknown_user');
  }

  async function updateStatus(id: string, status: Report['status']) {
    setUpdating((prev) => ({ ...prev, [id]: true }));
    try {
      await updateDoc(doc(db, 'reports', id), { status });
      showToast(t(status === 'reviewed' ? 'marked_reviewed' : 'marked_resolved'), 'success');
    } catch {
      showToast(t('update_failed'), 'error');
    } finally {
      setUpdating((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function submitModeration() {
    if (!modTarget) return;
    const reason = modReason.trim();
    if (!reason) { showToast(t('reason_required'), 'error'); return; }
    setModBusy(true);
    try {
      await moderateUser({ targetUid: modTarget.report.reportedUserId, action: modTarget.action, reason, reportId: modTarget.report.id });
      await updateDoc(doc(db, 'reports', modTarget.report.id), { status: 'resolved' }).catch(() => {});
      showToast(t(modTarget.action === 'suspend' ? 'suspended_toast' : 'warned_toast'), 'success');
      setModTarget(null);
      setModReason('');
    } catch (e) {
      showToast((e as { message?: string })?.message ?? t('action_failed'), 'error');
    } finally {
      setModBusy(false);
    }
  }

  const filtered = filter === 'all' ? reports : reports.filter((r) => r.status === filter);
  const countOf = (tab: FilterTab) => (tab === 'all' ? reports.length : reports.filter((r) => r.status === tab).length);

  return (
    <>
      <AdminPage title={t('title')} subtitle={t('greeting')} testID="reports-page">
        {/* Filter: a pill segmented control, each option with its count. Scrolls sideways on narrow phones. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.filterRow, { flexDirection: rowDir }]}
        >
          <Segment<FilterTab>
            options={FILTER_TABS.map((tab) => ({ value: tab, label: `${t(`filter_${tab}`)} (${countOf(tab)})` }))}
            value={filter}
            onChange={setFilter}
            label={t('title')}
            testIDPrefix="filter"
          />
        </ScrollView>

        {loading ? (
          <ActivityIndicator size="large" color={p.accent} style={styles.spinner} testID="reports-loading" />
        ) : filtered.length === 0 ? (
          <Card testID="reports-empty">
            <EmptyState text={t('empty')} />
          </Card>
        ) : (
          filtered.map((report) => {
            const busy = !!updating[report.id];
            return (
              <Card key={report.id} testID={`report-${report.id}`}>
                {/* Head: reported user (or the community) over reporter · date, status on the far side. */}
                <CardHead
                  title={reportedName(report)}
                  sub={`${resolvedNames[report.reporterId] || '—'} · ${formatDate(report.createdAt)}`}
                  side={<StatusChip status={report.status} label={t(`status_${report.status}`)} />}
                />

                <View style={[styles.body, { borderTopColor: p.border }]}>
                  <AdminText style={[styles.reason, { color: p.text2, textAlign }]}>{report.reason}</AdminText>

                  {(report.evidenceURLs?.length ?? 0) > 0 && (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={[styles.thumbs, { flexDirection: rowDir }]}
                    >
                      {report.evidenceURLs.map((url, i) => (
                        <Image key={i} source={{ uri: url }} style={[styles.thumb, { backgroundColor: p.surface3 }]} resizeMode="cover" />
                      ))}
                    </ScrollView>
                  )}

                  <View style={[styles.actions, { flexDirection: rowDir }]}>
                    {/* Moderate the reported user. A deletion request has no user to act on. */}
                    {report.type !== 'community_deletion' && (
                      <>
                        <PillButton
                          label={t('warn')}
                          testID={`warn-${report.id}`}
                          onPress={() => { setModTarget({ report, action: 'warn' }); setModReason(''); }}
                        />
                        <PillButton
                          label={t('suspend')}
                          variant="danger"
                          testID={`suspend-${report.id}`}
                          onPress={() => { setModTarget({ report, action: 'suspend' }); setModReason(''); }}
                        />
                      </>
                    )}
                    <View style={styles.spacer} />
                    {busy ? <ActivityIndicator size="small" color={p.accent} testID={`updating-${report.id}`} /> : null}
                    {report.status !== 'reviewed' && (
                      <PillButton
                        label={t('mark_reviewed')}
                        testID={`review-${report.id}`}
                        disabled={busy}
                        onPress={() => updateStatus(report.id, 'reviewed')}
                      />
                    )}
                    {report.status !== 'resolved' && (
                      <PillButton
                        label={t('resolve')}
                        variant="primary"
                        testID={`resolve-${report.id}`}
                        disabled={busy}
                        onPress={() => updateStatus(report.id, 'resolved')}
                      />
                    )}
                  </View>
                </View>
              </Card>
            );
          })
        )}
      </AdminPage>

      {/* Warn / Suspend reason modal */}
      <Modal visible={!!modTarget} transparent animationType="fade" onRequestClose={() => setModTarget(null)}>
        <View style={styles.overlay}>
          <Pressable
            style={[StyleSheet.absoluteFill, styles.scrim, { backgroundColor: p.shadow }]}
            onPress={() => setModTarget(null)}
            accessibilityRole="button"
            accessibilityLabel={t('cancel')}
          />
          <Card style={styles.modalCard} testID="mod-modal">
            <View style={styles.modalBody}>
              <AdminText weight="bold" style={[styles.modalTitle, { textAlign }]}>
                {modTarget?.action === 'suspend' ? t('suspend_user') : t('warn_user')}
                {modTarget ? ` · ${reportedName(modTarget.report)}` : ''}
              </AdminText>
              <AdminText style={[TYPE.rowMeta, { color: p.text3, textAlign }]}>{t('reason_hint')}</AdminText>
              <TextInput
                style={[
                  styles.reasonInput,
                  { color: p.text, borderColor: p.border, backgroundColor: p.surface2, textAlign },
                ]}
                value={modReason}
                onChangeText={setModReason}
                placeholder={t('reason_placeholder')}
                placeholderTextColor={p.text3}
                multiline
                testID="mod-reason"
              />
              <View style={[styles.modalActions, { flexDirection: rowDir }]}>
                <View style={styles.spacer} />
                <PillButton label={t('cancel')} onPress={() => setModTarget(null)} testID="mod-cancel" />
                {modBusy ? (
                  <ActivityIndicator size="small" color={p.accent} testID="mod-busy" />
                ) : (
                  <PillButton
                    label={modTarget?.action === 'suspend' ? t('suspend') : t('warn')}
                    variant={modTarget?.action === 'suspend' ? 'danger' : 'primary'}
                    onPress={submitModeration}
                    testID="mod-submit"
                  />
                )}
              </View>
            </View>
          </Card>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  filterRow: { flexGrow: 1 },
  spinner: { marginTop: 40 },
  chip: { borderRadius: RADIUS.pill, paddingVertical: 3, paddingHorizontal: 9, flexShrink: 0 },
  body: { borderTopWidth: 1, paddingVertical: 14, paddingHorizontal: SPACE.rowPadH, gap: 12 },
  reason: { fontSize: 14, lineHeight: 21 },
  thumbs: { gap: 8 },
  thumb: { width: 72, height: 72, borderRadius: 12 },
  actions: { alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  spacer: { flexGrow: 1 },

  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  scrim: { opacity: 0.45 },
  modalCard: { width: '100%', maxWidth: 420 },
  modalBody: { padding: SPACE.cardPad + 1, gap: 10 },
  modalTitle: { fontSize: 17, letterSpacing: -0.2 },
  reasonInput: {
    fontFamily: 'Heebo-Regular',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    fontSize: 14,
    minHeight: 84,
    textAlignVertical: 'top',
  },
  modalActions: { alignItems: 'center', gap: 8, marginTop: 4 },
});
