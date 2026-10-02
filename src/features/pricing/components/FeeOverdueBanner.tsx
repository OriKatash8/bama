import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { AlertCircle } from 'lucide-react-native';
import { AppText } from '@components/ui/AppText';
import { useSettingsStore } from '@core/stores/settingsStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

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

/**
 * Persistent notice for a professional whose fee is overdue — the state in which
 * hireProfessional and the offer rule refuse new work.
 *
 * Same stance as FeeArrearsSheet: account standing, not a product. What is owed,
 * what is paused, what is NOT (existing projects), and how settlement happens —
 * outside the app. No pay button, and nothing that reads as buying access.
 *
 * Rendered only while `useFeeArrears().overdueBlocked`, which is itself behind
 * the feeOverdueBlockEnabled kill switch.
 */
export function FeeOverdueBanner({ amount }: { amount: number }) {
  const router = useRouter();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const align = rtl ? 'right' : 'left';

  return (
    <View style={styles.box} accessibilityRole="alert" testID="fee-overdue-banner">
      <View style={[styles.header, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
        <AlertCircle size={18} color={RED} strokeWidth={2} />
        <AppText weight="bold" style={[styles.title, { textAlign: align }]}>
          {t('noticeboard.overdue_banner_title')}
        </AppText>
      </View>
      <AppText weight="regular" style={[styles.body, { textAlign: align }]}>
        {t('noticeboard.overdue_banner_body', { amount: amount.toLocaleString() })}
      </AppText>
      <AppText weight="regular" style={[styles.how, { textAlign: align }]}>
        {t('noticeboard.overdue_banner_how')}
      </AppText>
      <TouchableOpacity onPress={() => router.push('/settings/pricing')} activeOpacity={0.7}>
        <AppText weight="semiBold" style={[styles.link, { textAlign: align }]}>
          {t('noticeboard.overdue_banner_terms')}
        </AppText>
      </TouchableOpacity>
    </View>
  );
}

const RED = '#C4321F';

// lineHeight ≥ 1.47 × fontSize throughout: Heebo clips glyph tops below that on iOS.
const styles = StyleSheet.create({
  box: {
    backgroundColor: '#FDECEA',
    borderColor: '#F3C1BA',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  header: { alignItems: 'center', gap: 8, marginBottom: 6 },
  title: { fontSize: 15, lineHeight: 23, color: RED, flexShrink: 1 },
  body: { fontSize: 14, lineHeight: 21, color: '#3B1712', marginBottom: 6 },
  how: { fontSize: 13, lineHeight: 20, color: '#5E3A35', marginBottom: 4 },
  link: { fontSize: 14, lineHeight: 21, color: RED, paddingVertical: 4 },
});
