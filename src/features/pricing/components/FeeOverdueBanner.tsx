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

/** dd/mm/yyyy — the format the push notices and the Terms use. */
function formatDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

type Props = {
  amount: number;
  /** 'blocked' (default): the block is in force. 'warning': a fee exists and the
   *  block starts at `blockAt` — the in-app half of the warning Terms 12.8.5 promises.
   *  'unpaid': a fee is owed and there is no block date or restriction to mention
   *  (the block switch is off) — just what is owed and a pay-now button. */
  mode?: 'blocked' | 'warning' | 'unpaid';
  /** When the block starts, in ms. Required for `warning`. */
  blockAt?: number;
};

/**
 * Persistent notice for a professional with an unpaid fee. Two states of one
 * banner: a calm amber WARNING from the moment the fee exists until the block
 * starts (what is owed, by when, what will pause), then a red BLOCKED notice —
 * the state in which hireProfessional and the offer rule refuse new work.
 *
 * Account standing, not a product: what is owed, what is paused, what is NOT
 * (existing projects), and a "pay now" button to the balance screen, where the
 * fee row opens the payment provider's secure page. The app takes no card
 * details itself.
 *
 * Rendered only while `useFeeArrears()` says so, behind the feeOverdueBlockEnabled
 * kill switch.
 */
export function FeeOverdueBanner({ amount, mode = 'blocked', blockAt }: Props) {
  const router = useRouter();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const align = rtl ? 'right' : 'left';
  const warning = mode === 'warning';
  const unpaid = mode === 'unpaid';
  const tone = unpaid ? BLUE : warning ? AMBER : RED;
  const prefix = unpaid ? 'noticeboard.overdue_unpaid'
    : warning ? 'noticeboard.overdue_warning' : 'noticeboard.overdue_banner';

  return (
    <View
      style={[styles.box, unpaid ? styles.boxUnpaid : warning ? styles.boxWarning : styles.boxBlocked]}
      accessibilityRole={unpaid ? undefined : 'alert'}
      testID={unpaid ? 'fee-unpaid-banner' : warning ? 'fee-warning-banner' : 'fee-overdue-banner'}
    >
      <View style={[styles.header, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
        <AlertCircle size={18} color={tone} strokeWidth={2} />
        <AppText weight="bold" style={[styles.title, { color: tone, textAlign: align }]}>
          {t(`${prefix}_title`)}
        </AppText>
      </View>
      <AppText weight="regular" style={[styles.body, { textAlign: align }]}>
        {t(`${prefix}_body`, {
          amount: amount.toLocaleString(),
          date: blockAt ? formatDate(blockAt) : '',
        })}
      </AppText>
      <AppText weight="regular" style={[styles.how, { textAlign: align }]}>
        {t(`${prefix}_how`)}
      </AppText>
      <TouchableOpacity
        onPress={() => router.push('/settings/payment')}
        activeOpacity={0.8}
        accessibilityRole="button"
        style={[styles.payBtn, { backgroundColor: tone }]}
        testID="fee-banner-pay"
      >
        <AppText weight="semiBold" style={styles.payText}>
          {t('noticeboard.overdue_banner_pay')}
        </AppText>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.push('/settings/pricing')} activeOpacity={0.7}>
        <AppText weight="semiBold" style={[styles.link, { color: tone, textAlign: align }]}>
          {t('noticeboard.overdue_banner_terms')}
        </AppText>
      </TouchableOpacity>
    </View>
  );
}

const RED = '#C4321F';
const AMBER = '#9A5B00';
const BLUE = '#3730A3';

// lineHeight ≥ 1.47 × fontSize throughout: Heebo clips glyph tops below that on iOS.
const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 14 },
  boxBlocked: { backgroundColor: '#FDECEA', borderColor: '#F3C1BA' },
  boxWarning: { backgroundColor: '#FFF6E5', borderColor: '#F0D9A8' },
  boxUnpaid: { backgroundColor: '#EEF2FF', borderColor: '#C7D2FE' },
  header: { alignItems: 'center', gap: 8, marginBottom: 6 },
  title: { fontSize: 15, lineHeight: 23, flexShrink: 1 },
  body: { fontSize: 14, lineHeight: 21, color: '#3B1712', marginBottom: 6 },
  how: { fontSize: 13, lineHeight: 20, color: '#5E3A35', marginBottom: 10 },
  payBtn: { borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginBottom: 4 },
  payText: { fontSize: 14, lineHeight: 21, color: '#FFFFFF' },
  link: { fontSize: 14, lineHeight: 21, paddingVertical: 4 },
});
