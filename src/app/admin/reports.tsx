import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Image, Modal, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  collection, onSnapshot, updateDoc, doc, getDoc, query, orderBy, Timestamp,
} from 'firebase/firestore';
import { ShieldAlert, ShieldBan } from 'lucide-react-native';
import { db } from '@core/firebase/config';
import { callFunction } from '@core/firebase/functions';
import { useTheme } from '@core/hooks/useTheme';
import { useAppFont } from '@core/hooks/useAppFont';
import { useUiStore } from '@core/stores/uiStore';
import { useSettingsStore } from '@core/stores/settingsStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

type Translations = typeof en;
function makeT(translations: Translations) {
  return (key: string): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
}

const HEADER_PURPLE = '#cb6ce6'; // theme accent — solid header fill

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
  const insets = useSafeAreaInsets();
  const { showToast } = useUiStore();
  const language = useSettingsStore((s) => s.language);
  const rtl = language === 'he';
  const t = makeT(rtl ? he : en);
  const rowDir = rtl ? 'row-reverse' : 'row';
  const textAlign = rtl ? 'right' : 'left';

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
    if (r.reportedUserName && r.reportedUserName !== r.reportedUserId) return r.reportedUserName;
    return resolvedNames[r.reportedUserId] || r.reportedUserName || t('admin_reports.unknown_user');
  }

  async function updateStatus(id: string, status: Report['status']) {
    setUpdating((prev) => ({ ...prev, [id]: true }));
    try {
      await updateDoc(doc(db, 'reports', id), { status });
      showToast(t(status === 'reviewed' ? 'admin_reports.marked_reviewed' : 'admin_reports.marked_resolved'), 'success');
    } catch {
      showToast(t('admin_reports.update_failed'), 'error');
    } finally {
      setUpdating((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function submitModeration() {
    if (!modTarget) return;
    const reason = modReason.trim();
    if (!reason) { showToast(t('admin_reports.reason_required'), 'error'); return; }
    setModBusy(true);
    try {
      await moderateUser({ targetUid: modTarget.report.reportedUserId, action: modTarget.action, reason, reportId: modTarget.report.id });
      await updateDoc(doc(db, 'reports', modTarget.report.id), { status: 'resolved' }).catch(() => {});
      showToast(t(modTarget.action === 'suspend' ? 'admin_reports.suspended_toast' : 'admin_reports.warned_toast'), 'success');
      setModTarget(null);
      setModReason('');
    } catch (e) {
      showToast((e as { message?: string })?.message ?? t('admin_reports.action_failed'), 'error');
    } finally {
      setModBusy(false);
    }
  }

  const filtered = filter === 'all' ? reports : reports.filter((r) => r.status === filter);

  return (
    <View style={[styles.flex, { backgroundColor: colors.bg }]}>
      {/* Header — flat solid purple */}
      <View style={[styles.header, { backgroundColor: HEADER_PURPLE, paddingTop: insets.top + 14, alignItems: rtl ? 'flex-end' : 'flex-start' }]}>
        <Text style={[styles.greeting, { ...font.regular, textAlign }]}>{t('admin_reports.greeting')}</Text>
        <Text style={[styles.headerTitle, { ...font.medium, textAlign }]}>{t('admin_reports.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Filter pills */}
        <View style={[styles.filters, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          {FILTER_TABS.map((tab) => {
            const count = tab === 'all' ? reports.length : reports.filter((r) => r.status === tab).length;
            const active = filter === tab;
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.pill, { backgroundColor: active ? colors.primary : colors.inputBg }]}
                onPress={() => setFilter(tab)}
                activeOpacity={0.8}
              >
                <Text style={[styles.pillText, { ...font.medium, color: active ? '#ffffff' : colors.textSec }]}>
                  {t(`admin_reports.filter_${tab}`)} ({count})
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : filtered.length === 0 ? (
          <Text style={[styles.empty, { ...font.regular, color: colors.textMuted, textAlign }]}>{t('admin_reports.empty')}</Text>
        ) : (
          filtered.map((report) => (
            <View key={report.id} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
              {/* Header: reported user + status */}
              <View style={[styles.cardHead, { flexDirection: rowDir }]}>
                <Text style={[styles.reportedName, { ...font.bold, color: colors.text, textAlign }]} numberOfLines={1}>
                  {reportedName(report)}
                </Text>
                <View style={[styles.badge, { backgroundColor: STATUS_COLORS[report.status] + '22' }]}>
                  <Text style={[styles.badgeText, { ...font.semiBold, color: STATUS_COLORS[report.status] }]}>
                    {t(`admin_reports.status_${report.status}`)}
                  </Text>
                </View>
              </View>

              {/* Reporter + date */}
              <Text style={[styles.metaLine, { ...font.regular, color: colors.textMuted, textAlign }]} numberOfLines={1}>
                {`${resolvedNames[report.reporterId] || '—'} · ${formatDate(report.createdAt)}`}
              </Text>

              {/* Reason */}
              <Text style={[styles.reasonText, { ...font.regular, color: colors.textSec, textAlign }]}>
                {report.reason}
              </Text>

              {/* Evidence */}
              {report.evidenceURLs.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbScroll}>
                  {report.evidenceURLs.map((url, i) => (
                    <Image key={i} source={{ uri: url }} style={styles.thumb} resizeMode="cover" />
                  ))}
                </ScrollView>
              )}

              {/* Moderate the reported user */}
              <View style={[styles.actions, { flexDirection: rowDir }]}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.modBtn, { flexDirection: rowDir, borderColor: '#ff9800' }]}
                  onPress={() => { setModTarget({ report, action: 'warn' }); setModReason(''); }}
                  activeOpacity={0.7}
                >
                  <ShieldAlert size={15} color="#ff9800" strokeWidth={2.2} />
                  <Text style={[styles.actionText, { ...font.semiBold, color: '#ff9800' }]}>{t('admin_reports.warn')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.modBtn, { flexDirection: rowDir, borderColor: '#e53935' }]}
                  onPress={() => { setModTarget({ report, action: 'suspend' }); setModReason(''); }}
                  activeOpacity={0.7}
                >
                  <ShieldBan size={15} color="#e53935" strokeWidth={2.2} />
                  <Text style={[styles.actionText, { ...font.semiBold, color: '#e53935' }]}>{t('admin_reports.suspend')}</Text>
                </TouchableOpacity>
              </View>

              {/* Report status */}
              <View style={[styles.actions, { flexDirection: rowDir }]}>
                {report.status !== 'reviewed' && (
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#2196f322' }]}
                    onPress={() => updateStatus(report.id, 'reviewed')}
                    disabled={!!updating[report.id]}
                    activeOpacity={0.7}
                  >
                    {updating[report.id] ? <ActivityIndicator size="small" color="#2196f3" /> : (
                      <Text style={[styles.actionText, { ...font.semiBold, color: '#2196f3' }]}>{t('admin_reports.mark_reviewed')}</Text>
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
                    {updating[report.id] ? <ActivityIndicator size="small" color="#4caf50" /> : (
                      <Text style={[styles.actionText, { ...font.semiBold, color: '#4caf50' }]}>{t('admin_reports.resolve')}</Text>
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
            <Text style={[styles.modalTitle, { ...font.bold, color: colors.text, textAlign }]}>
              {modTarget?.action === 'suspend' ? t('admin_reports.suspend_user') : t('admin_reports.warn_user')}
              {modTarget ? ` · ${reportedName(modTarget.report)}` : ''}
            </Text>
            <Text style={[styles.modalHint, { ...font.regular, color: colors.textMuted, textAlign }]}>
              {t('admin_reports.reason_hint')}
            </Text>
            <TextInput
              style={[styles.reasonInput, { ...font.regular, color: colors.text, borderColor: colors.border, backgroundColor: colors.bg, textAlign }]}
              value={modReason}
              onChangeText={setModReason}
              placeholder={t('admin_reports.reason_placeholder')}
              placeholderTextColor={colors.placeholder}
              multiline
            />
            <View style={[styles.modalActions, { flexDirection: rowDir }]}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.inputBg }]} onPress={() => setModTarget(null)} activeOpacity={0.8}>
                <Text style={[styles.modalBtnText, { ...font.semiBold, color: colors.textSec }]}>{t('admin_reports.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: modTarget?.action === 'suspend' ? '#e53935' : '#ff9800' }]}
                onPress={submitModeration}
                disabled={modBusy}
                activeOpacity={0.85}
              >
                {modBusy ? <ActivityIndicator size="small" color="#fff" /> : (
                  <Text style={[styles.modalBtnText, { ...font.semiBold, color: '#fff' }]}>
                    {modTarget?.action === 'suspend' ? t('admin_reports.suspend') : t('admin_reports.warn')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { paddingBottom: 14, paddingHorizontal: 16, gap: 2 },
  greeting: { fontSize: 11, color: 'rgba(255,255,255,0.7)', width: '100%' },
  headerTitle: { fontSize: 17, color: '#ffffff', width: '100%' },

  content: { padding: 16, paddingBottom: 100 },

  filters: { flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  pill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  pillText: { fontSize: 13 },

  empty: { fontSize: 15, marginTop: 40, width: '100%', textAlign: 'center' },

  card: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 12, gap: 8 },
  cardHead: { justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  reportedName: { flex: 1, fontSize: 15 },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  badgeText: { fontSize: 12 },
  metaLine: { fontSize: 12 },
  reasonText: { fontSize: 14, lineHeight: 20 },
  thumbScroll: { marginTop: 2 },
  thumb: { width: 72, height: 72, borderRadius: 8, marginRight: 8 },

  actions: { gap: 8, marginTop: 2 },
  actionBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 10 },
  modBtn: { borderWidth: 1.5, backgroundColor: 'transparent' },
  actionText: { fontSize: 13 },

  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalCard: { width: '100%', maxWidth: 420, borderRadius: 18, padding: 18, gap: 10 },
  modalTitle: { fontSize: 17 },
  modalHint: { fontSize: 13 },
  reasonInput: { borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 14, minHeight: 84, textAlignVertical: 'top' },
  modalActions: { gap: 8, marginTop: 4 },
  modalBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10 },
  modalBtnText: { fontSize: 14 },
});
