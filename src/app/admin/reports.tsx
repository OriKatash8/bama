import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Image, Modal, TextInput,
} from 'react-native';
import {
  collection, onSnapshot, updateDoc, doc, getDoc, query, orderBy, Timestamp,
} from 'firebase/firestore';
import { ShieldAlert, ShieldBan } from 'lucide-react-native';
import { db } from '@core/firebase/config';
import { callFunction } from '@core/firebase/functions';
import { useTheme } from '@core/hooks/useTheme';
import { useAppFont } from '@core/hooks/useAppFont';
import { useUiStore } from '@core/stores/uiStore';
import { Screen } from '@components/layout/Screen';

type ModAction = 'warn' | 'suspend';
const moderateUser = callFunction<
  { targetUid: string; action: ModAction; reason: string; reportId?: string },
  { success: boolean; actionId: string }
>('moderateUser');

type Report = {
  id: string;
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

const STATUS_COLORS: Record<Report['status'], string> = {
  pending: '#ff9800',
  reviewed: '#2196f3',
  resolved: '#4caf50',
};

function formatDate(ts: Timestamp | null): string {
  if (!ts) return '—';
  const d = ts.toDate();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export default function ReportsAdmin() {
  const colors = useTheme();
  const font = useAppFont();
  const { showToast } = useUiStore();

  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>('pending');
  const [updating, setUpdating] = useState<Record<string, boolean>>({});
  // Fallback names for reports whose denormalized name is blank or is just the id.
  const [resolvedNames, setResolvedNames] = useState<Record<string, string>>({});
  // Warn/suspend the reported user, straight from the report.
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

  // Resolve reportedUserId → current displayName only when the stored name is
  // missing or degraded to the id. The denormalized name (evidence snapshot)
  // stays primary; this just fills the gaps.
  useEffect(() => {
    const missing = reports
      .filter((r) => !r.reportedUserName || r.reportedUserName === r.reportedUserId)
      .map((r) => r.reportedUserId)
      .filter((id) => id && resolvedNames[id] === undefined);
    const unique = [...new Set(missing)];
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

  async function updateStatus(id: string, status: Report['status']) {
    setUpdating((prev) => ({ ...prev, [id]: true }));
    try {
      await updateDoc(doc(db, 'reports', id), { status });
      showToast(`Report marked as ${status}`, 'success');
    } catch {
      showToast('Failed to update report', 'error');
    } finally {
      setUpdating((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function submitModeration() {
    if (!modTarget) return;
    const reason = modReason.trim();
    if (!reason) { showToast('A reason is required', 'error'); return; }
    setModBusy(true);
    try {
      await moderateUser({
        targetUid: modTarget.report.reportedUserId,
        action: modTarget.action,
        reason,
        reportId: modTarget.report.id,
      });
      // Acting on a report means it's been handled → mark it resolved.
      await updateDoc(doc(db, 'reports', modTarget.report.id), { status: 'resolved' }).catch(() => {});
      showToast(modTarget.action === 'suspend' ? 'User suspended' : 'User warned', 'success');
      setModTarget(null);
      setModReason('');
    } catch (e) {
      showToast((e as { message?: string })?.message ?? 'Action failed', 'error');
    } finally {
      setModBusy(false);
    }
  }

  const filtered = filter === 'all' ? reports : reports.filter((r) => r.status === filter);

  return (
    <Screen scrollable={false}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <Text style={[styles.title, { ...font.bold, color: colors.text }]}>
          Reports
        </Text>

        {/* Filter tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabRow}
        >
          {FILTER_TABS.map((tab) => {
            const count = tab === 'all' ? reports.length : reports.filter((r) => r.status === tab).length;
            const active = filter === tab;
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setFilter(tab)}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabText, { ...font.semiBold, color: active ? '#fff' : colors.textMuted }]}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)} ({count})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {loading ? (
          <ActivityIndicator size="large" color="#004aad" style={{ marginTop: 40 }} />
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { ...font.regular, color: colors.textMuted }]}>
              No {filter === 'all' ? '' : filter} reports.
            </Text>
          </View>
        ) : (
          filtered.map((report) => (
            <View key={report.id} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
              {/* Header row */}
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <Text style={[styles.reportedName, { ...font.bold, color: colors.text }]}>
                    {(report.reportedUserName && report.reportedUserName !== report.reportedUserId)
                      ? report.reportedUserName
                      : (resolvedNames[report.reportedUserId] || report.reportedUserName || 'Unknown User')}
                  </Text>
                  <Text style={[styles.date, { ...font.regular, color: colors.textMuted }]}>
                    {formatDate(report.createdAt)}
                  </Text>
                </View>
                <View style={[styles.badge, { backgroundColor: STATUS_COLORS[report.status] + '22' }]}>
                  <Text style={[styles.badgeText, { ...font.semiBold, color: STATUS_COLORS[report.status] }]}>
                    {report.status}
                  </Text>
                </View>
              </View>

              {/* Reason */}
              <Text style={[styles.reasonText, { ...font.regular, color: colors.textSec }]}>
                {report.reason}
              </Text>

              {/* Evidence thumbnails */}
              {report.evidenceURLs.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbScroll}>
                  {report.evidenceURLs.map((url, i) => (
                    <Image key={i} source={{ uri: url }} style={styles.thumb} resizeMode="cover" />
                  ))}
                </ScrollView>
              )}

              {/* Moderate the reported user */}
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.modBtn, { borderColor: '#ff9800' }]}
                  onPress={() => { setModTarget({ report, action: 'warn' }); setModReason(''); }}
                  activeOpacity={0.7}
                >
                  <ShieldAlert size={15} color="#ff9800" strokeWidth={2.2} />
                  <Text style={[styles.actionText, { ...font.semiBold, color: '#ff9800' }]}>Warn</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.modBtn, { borderColor: '#e53935' }]}
                  onPress={() => { setModTarget({ report, action: 'suspend' }); setModReason(''); }}
                  activeOpacity={0.7}
                >
                  <ShieldBan size={15} color="#e53935" strokeWidth={2.2} />
                  <Text style={[styles.actionText, { ...font.semiBold, color: '#e53935' }]}>Suspend</Text>
                </TouchableOpacity>
              </View>

              {/* Report status */}
              <View style={styles.actions}>
                {report.status !== 'reviewed' && (
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#2196f322' }]}
                    onPress={() => updateStatus(report.id, 'reviewed')}
                    disabled={!!updating[report.id]}
                    activeOpacity={0.7}
                  >
                    {updating[report.id] ? (
                      <ActivityIndicator size="small" color="#2196f3" />
                    ) : (
                      <Text style={[styles.actionText, { ...font.semiBold, color: '#2196f3' }]}>
                        Mark Reviewed
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
                {report.status !== 'resolved' && (
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#4caf5022' }]}
                    onPress={() => updateStatus(report.id, 'resolved')}
                    disabled={!!updating[report.id]}
                    activeOpacity={0.7}
                  >
                    {updating[report.id] ? (
                      <ActivityIndicator size="small" color="#4caf50" />
                    ) : (
                      <Text style={[styles.actionText, { ...font.semiBold, color: '#4caf50' }]}>
                        Resolve
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Warn / Suspend reason modal */}
      <Modal visible={!!modTarget} transparent animationType="fade" onRequestClose={() => setModTarget(null)}>
        <View style={styles.overlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setModTarget(null)} />
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { ...font.bold, color: colors.text }]}>
              {modTarget?.action === 'suspend' ? 'Suspend user' : 'Warn user'}
              {modTarget ? ` · ${(modTarget.report.reportedUserName && modTarget.report.reportedUserName !== modTarget.report.reportedUserId) ? modTarget.report.reportedUserName : (resolvedNames[modTarget.report.reportedUserId] || 'user')}` : ''}
            </Text>
            <Text style={[styles.modalHint, { ...font.regular, color: colors.textMuted }]}>
              This reason is shown to the user and kept as a record. The report will be resolved.
            </Text>
            <TextInput
              style={[styles.reasonInput, { ...font.regular, color: colors.text, borderColor: colors.border, backgroundColor: colors.bg }]}
              value={modReason}
              onChangeText={setModReason}
              placeholder="Reason"
              placeholderTextColor={colors.placeholder}
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: 'rgba(0,0,0,0.06)' }]} onPress={() => setModTarget(null)} activeOpacity={0.8}>
                <Text style={[styles.modalBtnText, { ...font.semiBold, color: colors.textSec }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: modTarget?.action === 'suspend' ? '#e53935' : '#ff9800' }]}
                onPress={submitModeration}
                disabled={modBusy}
                activeOpacity={0.85}
              >
                {modBusy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[styles.modalBtnText, { ...font.semiBold, color: '#fff' }]}>{modTarget?.action === 'suspend' ? 'Suspend' : 'Warn'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 100 },
  title: { fontSize: 28, fontWeight: '800', marginBottom: 16 },
  tabRow: { gap: 8, marginBottom: 16 },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(0,74,173,0.08)',
  },
  tabActive: {
    backgroundColor: '#004aad',
  },
  tabText: { fontSize: 13 },
  empty: { alignItems: 'center', marginTop: 40 },
  emptyText: { fontSize: 15 },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardHeaderLeft: { flex: 1, gap: 2 },
  reportedName: { fontSize: 15, fontWeight: '700' },
  date: { fontSize: 12 },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: 12, textTransform: 'capitalize' },
  reasonText: { fontSize: 14, lineHeight: 20 },
  thumbScroll: { marginTop: 4 },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 8,
    marginRight: 8,
  },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: 8,
  },
  modBtn: { borderWidth: 1.5, backgroundColor: 'transparent' },
  actionText: { fontSize: 13 },

  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalCard: { width: '100%', maxWidth: 420, borderRadius: 18, padding: 18, gap: 10 },
  modalTitle: { fontSize: 17 },
  modalHint: { fontSize: 13 },
  reasonInput: { borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 14, minHeight: 84, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  modalBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10 },
  modalBtnText: { fontSize: 14 },
});
