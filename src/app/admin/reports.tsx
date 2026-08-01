import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Image,
} from 'react-native';
import {
  collection, onSnapshot, updateDoc, doc, query, orderBy, Timestamp,
} from 'firebase/firestore';
import { db } from '@core/firebase/config';
import { useTheme } from '@core/hooks/useTheme';
import { useAppFont } from '@core/hooks/useAppFont';
import { useUiStore } from '@core/stores/uiStore';
import { Screen } from '@components/layout/Screen';

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

  useEffect(() => {
    const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Report)));
      setLoading(false);
    });
  }, []);

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

  const filtered = filter === 'all' ? reports : reports.filter((r) => r.status === filter);

  return (
    <Screen scrollable={false}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <Text style={[styles.title, { fontFamily: font.bold, color: colors.text }]}>
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
                <Text style={[styles.tabText, { fontFamily: font.semiBold, color: active ? '#fff' : colors.textMuted }]}>
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
            <Text style={[styles.emptyText, { fontFamily: font.regular, color: colors.textMuted }]}>
              No {filter === 'all' ? '' : filter} reports.
            </Text>
          </View>
        ) : (
          filtered.map((report) => (
            <View key={report.id} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
              {/* Header row */}
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <Text style={[styles.reportedName, { fontFamily: font.bold, color: colors.text }]}>
                    {report.reportedUserName || 'Unknown User'}
                  </Text>
                  <Text style={[styles.date, { fontFamily: font.regular, color: colors.textMuted }]}>
                    {formatDate(report.createdAt)}
                  </Text>
                </View>
                <View style={[styles.badge, { backgroundColor: STATUS_COLORS[report.status] + '22' }]}>
                  <Text style={[styles.badgeText, { fontFamily: font.semiBold, color: STATUS_COLORS[report.status] }]}>
                    {report.status}
                  </Text>
                </View>
              </View>

              {/* Reason */}
              <Text style={[styles.reasonText, { fontFamily: font.regular, color: colors.textSec }]}>
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

              {/* Action buttons */}
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
                      <Text style={[styles.actionText, { fontFamily: font.semiBold, color: '#2196f3' }]}>
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
                      <Text style={[styles.actionText, { fontFamily: font.semiBold, color: '#4caf50' }]}>
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionText: { fontSize: 13 },
});
