import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { getCountFromServer, collection, query, where, type Query } from 'firebase/firestore';
import {
  Users, Briefcase, BookOpen, MessagesSquare, ShoppingBag, Flag,
  ChevronRight, ChevronLeft,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '@core/firebase/config';
import { useTheme } from '@core/hooks/useTheme';
import { useAppFont } from '@core/hooks/useAppFont';
import { useSettingsStore } from '@core/stores/settingsStore';
import { MoneyFlowChart } from '@components/charts/MoneyFlowChart';
import { useRegistrationStats } from '@features/admin/useRegistrationStats';
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
const DANGER = '#e53935';        // severity: reports

type Counts = { users: number | null; projects: number | null; courses: number | null; communities: number | null };

/** Count a query independently — a single failure returns null (rendered "—")
 *  instead of throwing and zeroing every other stat. */
async function countOf(q: Query): Promise<number | null> {
  try {
    return (await getCountFromServer(q)).data().count;
  } catch (e) {
    console.warn('[AdminDashboard] count query failed:', e);
    return null;
  }
}

export default function AdminDashboard() {
  const colors = useTheme();
  const font = useAppFont();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const language = useSettingsStore((s) => s.language);
  const rtl = language === 'he';
  const t = makeT(rtl ? he : en);
  const rowDir = rtl ? 'row-reverse' : 'row';
  const textAlign = rtl ? 'right' : 'left';
  const Chevron = rtl ? ChevronLeft : ChevronRight;

  const [counts, setCounts] = useState<Counts | null>(null);
  const [period, setPeriod] = useState<'daily' | 'weekly'>('daily');
  const [regView, setRegView] = useState<'total' | 'by_mode'>('total');
  const { labels, total, client, pro, loading: regLoading } = useRegistrationStats(period, rtl);
  const clientTotal = client.reduce((a, b) => a + b, 0);
  const proTotal = pro.reduce((a, b) => a + b, 0);

  useEffect(() => {
    (async () => {
      // Communities live in `chats` with type == 'community' (no `communities` collection).
      const [users, projects, courses, communities] = await Promise.all([
        countOf(collection(db, 'users')),
        countOf(collection(db, 'projects')),
        countOf(collection(db, 'courses')),
        countOf(query(collection(db, 'chats'), where('type', '==', 'community'))),
      ]);
      setCounts({ users, projects, courses, communities });
    })().catch(() => setCounts({ users: null, projects: null, courses: null, communities: null }));
  }, []);

  const metrics: { key: keyof Counts; label: string; icon: typeof Users }[] = [
    { key: 'users', label: t('admin_dashboard.total_users'), icon: Users },
    { key: 'projects', label: t('admin_dashboard.total_projects'), icon: Briefcase },
    { key: 'courses', label: t('admin_dashboard.total_courses'), icon: BookOpen },
    { key: 'communities', label: t('admin_dashboard.total_communities'), icon: MessagesSquare },
  ];

  const manage: { label: string; route: '/admin/courses' | '/admin/communities' | '/admin/marketplace'; icon: typeof Users }[] = [
    { label: t('admin_dashboard.courses'), route: '/admin/courses', icon: BookOpen },
    { label: t('admin_dashboard.communities'), route: '/admin/communities', icon: MessagesSquare },
    { label: t('admin_dashboard.marketplace'), route: '/admin/marketplace', icon: ShoppingBag },
  ];

  return (
    <View style={[styles.flex, { backgroundColor: colors.bg }]}>
      {/* Header — flat solid purple, two start-aligned lines */}
      <View style={[styles.header, { backgroundColor: HEADER_PURPLE, paddingTop: insets.top + 14, alignItems: rtl ? 'flex-end' : 'flex-start' }]}>
        <Text style={[styles.greeting, { ...font.regular, textAlign }]}>{t('admin_dashboard.greeting')}</Text>
        <Text style={[styles.headerTitle, { ...font.medium, textAlign }]}>{t('admin_dashboard.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Action queue */}
        <View style={[styles.headingRow, { flexDirection: rowDir }]}>
          <Text style={[styles.heading, { ...font.medium, color: colors.text, textAlign }]}>{t('admin_dashboard.attention')}</Text>
        </View>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.queueRow, { flexDirection: rowDir }]}
            onPress={() => router.push('/admin/reports')}
            activeOpacity={0.7}
          >
            <View style={[styles.queueIcon, { backgroundColor: DANGER + '1f' }]}>
              <Flag size={16} color={DANGER} strokeWidth={2.2} />
            </View>
            <Text style={[styles.queueLabel, { ...font.regular, color: colors.text, textAlign }]}>
              {t('admin_dashboard.reports')}
            </Text>
            <Chevron size={18} color={colors.textMuted} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {/* Metrics */}
        <Text style={[styles.heading, styles.headingSpaced, { ...font.medium, color: colors.text, textAlign }]}>
          {t('admin_dashboard.metrics')}
        </Text>
        <View style={[styles.grid, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          {metrics.map(({ key, label, icon: Icon }) => (
            <View key={key} style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.metricTop, { flexDirection: rowDir }]}>
                <Icon size={14} color={colors.primary} strokeWidth={2.2} />
                <Text style={[styles.metricLabel, { ...font.regular, color: colors.textMuted, textAlign }]} numberOfLines={1}>
                  {label}
                </Text>
              </View>
              {counts === null ? (
                <ActivityIndicator size="small" color={colors.primary} style={styles.metricSpinner} />
              ) : (
                <Text style={[styles.metricValue, { ...font.medium, color: colors.text, textAlign }]}>
                  {counts[key] ?? '—'}
                </Text>
              )}
            </View>
          ))}
        </View>

        {/* New registrations */}
        <View style={[styles.flowHeader, styles.headingSpaced, { flexDirection: rowDir }]}>
          <Text style={[styles.heading, { ...font.medium, color: colors.text, textAlign, width: 'auto', flex: 1 }]}>
            {t('admin_dashboard.registrations')}
          </Text>
          <View style={[styles.toggle, { flexDirection: rowDir, backgroundColor: colors.inputBg, borderColor: colors.border }]}>
            {(['daily', 'weekly'] as const).map((p) => {
              const active = period === p;
              return (
                <TouchableOpacity key={p} style={[styles.toggleBtn, active && { backgroundColor: colors.primary }]} onPress={() => setPeriod(p)} activeOpacity={0.8}>
                  <Text style={[styles.toggleText, { ...font.medium, color: active ? '#ffffff' : colors.textSec }]}>{t(`admin_dashboard.${p}`)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 12 }]}>
          {/* Total / By mode switch */}
          <View style={[styles.toggle, styles.viewToggle, { flexDirection: rowDir, alignSelf: rtl ? 'flex-end' : 'flex-start', backgroundColor: colors.inputBg, borderColor: colors.border }]}>
            {(['total', 'by_mode'] as const).map((v) => {
              const active = regView === v;
              return (
                <TouchableOpacity key={v} style={[styles.toggleBtn, styles.viewToggleBtn, active && { backgroundColor: colors.primary }]} onPress={() => setRegView(v)} activeOpacity={0.8}>
                  <Text style={[styles.toggleText, { ...font.medium, color: active ? '#ffffff' : colors.textSec }]}>{t(`admin_dashboard.reg_${v}`)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {regLoading ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 40 }} />
          ) : regView === 'total' ? (
            <MoneyFlowChart data={total} labels={labels} variant="bar" color={colors.primary} gridColor={colors.border} labelColor={colors.textMuted} />
          ) : (
            <>
              <MoneyFlowChart
                series={[{ color: colors.primary, data: client }, { color: HEADER_PURPLE, data: pro }]}
                labels={labels}
                gridColor={colors.border}
                labelColor={colors.textMuted}
              />
              <View style={[styles.legend, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                <View style={[styles.legendItem, { flexDirection: rowDir }]}>
                  <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
                  <Text style={[styles.legendLabel, { ...font.regular, color: colors.textSec }]}>{t('mode_picker.client')}</Text>
                  <Text style={[styles.legendValue, { ...font.medium, color: colors.text }]}>{clientTotal}</Text>
                </View>
                <View style={[styles.legendItem, { flexDirection: rowDir }]}>
                  <View style={[styles.legendDot, { backgroundColor: HEADER_PURPLE }]} />
                  <Text style={[styles.legendLabel, { ...font.regular, color: colors.textSec }]}>{t('mode_picker.professional')}</Text>
                  <Text style={[styles.legendValue, { ...font.medium, color: colors.text }]}>{proTotal}</Text>
                </View>
              </View>
            </>
          )}
        </View>

        {/* Manage — sub-pages reachable only from here */}
        <Text style={[styles.heading, styles.headingSpaced, { ...font.medium, color: colors.text, textAlign }]}>
          {t('admin_dashboard.manage')}
        </Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {manage.map(({ label, route, icon: Icon }, i) => (
            <TouchableOpacity
              key={route}
              style={[styles.queueRow, { flexDirection: rowDir }, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
              onPress={() => router.push(route)}
              activeOpacity={0.7}
            >
              <View style={[styles.queueIcon, { backgroundColor: colors.primary + '18' }]}>
                <Icon size={16} color={colors.primary} strokeWidth={2.2} />
              </View>
              <Text style={[styles.queueLabel, { ...font.regular, color: colors.text, textAlign }]}>{label}</Text>
              <Chevron size={18} color={colors.textMuted} strokeWidth={2} />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { paddingBottom: 14, paddingHorizontal: 16, gap: 2 },
  greeting: { fontSize: 11, color: 'rgba(255,255,255,0.7)', width: '100%' },
  headerTitle: { fontSize: 17, color: '#ffffff', width: '100%' },

  content: { padding: 16, paddingBottom: 40 },

  headingRow: { alignItems: 'center' },
  heading: { fontSize: 13, width: '100%' },
  headingSpaced: { marginTop: 22, marginBottom: 10 },

  card: { borderRadius: 12, borderWidth: 1, overflow: 'hidden', marginTop: 8 },
  queueRow: { alignItems: 'center', gap: 12, minHeight: 44, paddingHorizontal: 12, paddingVertical: 8 },
  queueIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  queueLabel: { flex: 1, fontSize: 13 },

  grid: { flexWrap: 'wrap', gap: 8 },
  metricCard: { flexGrow: 1, flexBasis: '46%', borderRadius: 12, borderWidth: 1, padding: 11 },
  metricTop: { alignItems: 'center', gap: 6, marginBottom: 6 },
  metricLabel: { flex: 1, fontSize: 11 },
  metricValue: { fontSize: 21 },
  metricSpinner: { alignSelf: 'flex-start' },

  flowHeader: { alignItems: 'center', justifyContent: 'space-between' },
  toggle: { borderRadius: 9, borderWidth: 1, padding: 2, gap: 2 },
  toggleBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 7 },
  toggleText: { fontSize: 12 },
  viewToggle: { marginBottom: 12 },
  viewToggleBtn: { paddingHorizontal: 14 },

  legend: { flexWrap: 'wrap', gap: 14, marginTop: 12 },
  legendItem: { alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 11 },
  legendValue: { fontSize: 11 },
});
