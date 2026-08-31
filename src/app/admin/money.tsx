import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Coins, Percent, Clock, ArrowLeftRight, Info } from 'lucide-react-native';
import { useTheme } from '@core/hooks/useTheme';
import { useAppFont } from '@core/hooks/useAppFont';
import { useSettingsStore } from '@core/stores/settingsStore';
import { MoneyFlowChart } from '@components/charts/MoneyFlowChart';
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

/**
 * Money — scaffold for future financial reporting. There is no payments data
 * source yet, so every figure is a hardcoded 0 placeholder. When payments are
 * wired up, replace the `value` fields with real queries.
 */
export default function MoneyAdmin() {
  const colors = useTheme();
  const font = useAppFont();
  const insets = useSafeAreaInsets();
  const language = useSettingsStore((s) => s.language);
  const rtl = language === 'he';
  const t = makeT(rtl ? he : en);
  const rowDir = rtl ? 'row-reverse' : 'row';
  const textAlign = rtl ? 'right' : 'left';

  const [period, setPeriod] = useState<'daily' | 'weekly'>('daily');

  // Buckets oldest → newest. No data source yet → all zeros (scaffold).
  // Daily = last 7 days (weekday labels); Weekly = last 6 weeks (week-start dates).
  const locale = rtl ? 'he-IL' : 'en-US';
  const labels = period === 'daily'
    ? Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return d.toLocaleDateString(locale, { weekday: 'short' });
      })
    : Array.from({ length: 6 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (5 - i) * 7);
        return d.toLocaleDateString(locale, { day: 'numeric', month: 'numeric' });
      });

  const metrics: { key: string; label: string; value: string; icon: typeof Coins }[] = [
    { key: 'revenue', label: t('admin_money.total_revenue'), value: '₪0', icon: Coins },
    { key: 'fees', label: t('admin_money.platform_fees'), value: '₪0', icon: Percent },
    { key: 'payouts', label: t('admin_money.pending_payouts'), value: '₪0', icon: Clock },
    { key: 'transactions', label: t('admin_money.transactions'), value: '0', icon: ArrowLeftRight },
  ];

  // Revenue sources (reused app palette). Marketplace/projects have fee backing
  // today; courses/subscriptions are future streams → all ₪0 for now.
  const sources = [
    { key: 'src_marketplace', color: colors.primary },
    { key: 'src_projects', color: HEADER_PURPLE },
    { key: 'src_courses', color: '#1c9d63' },
    { key: 'src_subscriptions', color: '#ff9800' },
    { key: 'src_other', color: colors.textMuted },
  ];
  const series = sources.map((s) => ({ color: s.color, data: labels.map(() => 0) }));

  return (
    <View style={[styles.flex, { backgroundColor: colors.bg }]}>
      {/* Header — matches the dashboard identity */}
      <View style={[styles.header, { backgroundColor: HEADER_PURPLE, paddingTop: insets.top + 14, alignItems: rtl ? 'flex-end' : 'flex-start' }]}>
        <Text style={[styles.greeting, { ...font.regular, textAlign }]}>{t('admin_money.greeting')}</Text>
        <Text style={[styles.headerTitle, { ...font.medium, textAlign }]}>{t('admin_money.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.heading, { ...font.medium, color: colors.text, textAlign }]}>{t('admin_money.metrics')}</Text>
        <View style={[styles.grid, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          {metrics.map(({ key, label, value, icon: Icon }) => (
            <View key={key} style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.metricTop, { flexDirection: rowDir }]}>
                <Icon size={14} color={colors.primary} strokeWidth={2.2} />
                <Text style={[styles.metricLabel, { ...font.regular, color: colors.textMuted, textAlign }]} numberOfLines={1}>
                  {label}
                </Text>
              </View>
              <Text style={[styles.metricValue, { ...font.medium, color: colors.text, textAlign }]}>{value}</Text>
            </View>
          ))}
        </View>

        {/* Money-flow graphs — scaffold, currently flat at zero */}
        <View style={[styles.flowHeader, styles.headingSpaced, { flexDirection: rowDir }]}>
          <Text style={[styles.heading, { ...font.medium, color: colors.text, textAlign, marginBottom: 0, width: 'auto', flex: 1 }]}>
            {t('admin_money.flow_heading')}
          </Text>
          {/* Daily / Weekly toggle */}
          <View style={[styles.toggle, { flexDirection: rowDir, backgroundColor: colors.inputBg, borderColor: colors.border }]}>
            {(['daily', 'weekly'] as const).map((p) => {
              const active = period === p;
              return (
                <TouchableOpacity
                  key={p}
                  style={[styles.toggleBtn, active && { backgroundColor: colors.primary }]}
                  onPress={() => setPeriod(p)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.toggleText, { ...font.medium, color: active ? '#ffffff' : colors.textSec }]}>
                    {t(`admin_money.${p}`)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.chartLabel, { ...font.regular, color: colors.textMuted, textAlign }]}>{t('admin_money.by_source')}</Text>
          <MoneyFlowChart series={series} labels={labels} gridColor={colors.border} labelColor={colors.textMuted} />

          {/* Legend — names each revenue source */}
          <View style={[styles.legend, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
            {sources.map((s) => (
              <View key={s.key} style={[styles.legendItem, { flexDirection: rowDir }]}>
                <View style={[styles.legendDot, { backgroundColor: s.color }]} />
                <Text style={[styles.legendLabel, { ...font.regular, color: colors.textSec }]} numberOfLines={1}>
                  {t(`admin_money.${s.key}`)}
                </Text>
                <Text style={[styles.legendValue, { ...font.medium, color: colors.text }]}>₪0</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Placeholder note — no payments data source yet */}
        <View style={[styles.note, { flexDirection: rowDir, backgroundColor: colors.card, borderColor: colors.border, marginTop: 22 }]}>
          <Info size={18} color={colors.textMuted} strokeWidth={2} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.noteTitle, { ...font.medium, color: colors.text, textAlign }]}>{t('admin_money.coming_soon_title')}</Text>
            <Text style={[styles.noteBody, { ...font.regular, color: colors.textMuted, textAlign }]}>{t('admin_money.coming_soon_body')}</Text>
          </View>
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
  heading: { fontSize: 13, width: '100%', marginBottom: 10 },
  headingSpaced: { marginTop: 22 },

  grid: { flexWrap: 'wrap', gap: 8 },
  metricCard: { flexGrow: 1, flexBasis: '46%', borderRadius: 12, borderWidth: 1, padding: 11 },
  metricTop: { alignItems: 'center', gap: 6, marginBottom: 6 },
  metricLabel: { flex: 1, fontSize: 11 },
  metricValue: { fontSize: 21 },

  flowHeader: { alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  toggle: { borderRadius: 9, borderWidth: 1, padding: 2, gap: 2 },
  toggleBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 7 },
  toggleText: { fontSize: 12 },

  chartCard: { borderRadius: 12, borderWidth: 1, padding: 12 },
  chartLabel: { fontSize: 11, marginBottom: 8, width: '100%' },
  legend: { flexWrap: 'wrap', gap: 10, marginTop: 12 },
  legendItem: { alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 11 },
  legendValue: { fontSize: 11 },

  note: { alignItems: 'flex-start', gap: 10, borderRadius: 12, borderWidth: 1, padding: 14, marginTop: 22 },
  noteTitle: { fontSize: 13, marginBottom: 2 },
  noteBody: { fontSize: 12, lineHeight: 17 },
});
