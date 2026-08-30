import { View, Text, StyleSheet, ScrollView } from 'react-native';
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

  // Last 7 days, oldest → newest. No data source yet → all zeros (scaffold).
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toLocaleDateString(rtl ? 'he-IL' : 'en-US', { weekday: 'short' });
  });
  const zeros = [0, 0, 0, 0, 0, 0, 0];

  const metrics: { key: string; label: string; value: string; icon: typeof Coins }[] = [
    { key: 'revenue', label: t('admin_money.total_revenue'), value: '₪0', icon: Coins },
    { key: 'fees', label: t('admin_money.platform_fees'), value: '₪0', icon: Percent },
    { key: 'payouts', label: t('admin_money.pending_payouts'), value: '₪0', icon: Clock },
    { key: 'transactions', label: t('admin_money.transactions'), value: '0', icon: ArrowLeftRight },
  ];

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
        <Text style={[styles.heading, styles.headingSpaced, { ...font.medium, color: colors.text, textAlign }]}>
          {t('admin_money.flow_heading')}
        </Text>
        <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.chartLabel, { ...font.regular, color: colors.textMuted, textAlign }]}>{t('admin_money.revenue_7d')}</Text>
          <MoneyFlowChart data={zeros} labels={days} variant="area" color={colors.primary} gridColor={colors.border} labelColor={colors.textMuted} />
        </View>
        <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 8 }]}>
          <Text style={[styles.chartLabel, { ...font.regular, color: colors.textMuted, textAlign }]}>{t('admin_money.fees_7d')}</Text>
          <MoneyFlowChart data={zeros} labels={days} variant="bar" color={HEADER_PURPLE} gridColor={colors.border} labelColor={colors.textMuted} />
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

  chartCard: { borderRadius: 12, borderWidth: 1, padding: 12 },
  chartLabel: { fontSize: 11, marginBottom: 8, width: '100%' },

  note: { alignItems: 'flex-start', gap: 10, borderRadius: 12, borderWidth: 1, padding: 14, marginTop: 22 },
  noteTitle: { fontSize: 13, marginBottom: 2 },
  noteBody: { fontSize: 12, lineHeight: 17 },
});
