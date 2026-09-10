import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Screen } from '@components/layout/Screen';
import { AppText } from '@components/ui/AppText';
import { useTheme } from '@core/hooks/useTheme';
import { useSettingsStore } from '@core/stores/settingsStore';
import { usePricingConfig } from '@features/pricing/hooks/usePricingConfig';
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
 * What BAMA charges a professional, stated before it ever applies.
 *
 * This screen exists because of the MINIMUM. A pro who is told only "3%" and is
 * then billed ₪6 on a ₪100 job reads it as a bait or a bug — and roughly a fifth
 * of the offers on the platform are small enough for the floor to bind. The
 * minimum has to be visible in advance, not explained afterwards.
 *
 * READ-ONLY, and reachable with nothing owed. The balance screen next door is a
 * statement of account and only opens from a project that already owes; this one
 * is the standing explanation, so it hangs off the settings menu and the
 * professional dashboard instead.
 *
 * Every number comes from `usePricingConfig()` — the live `config/pricing`
 * document — and goes into the copy as an interpolated var. Nothing here is
 * hardcoded, so an edit in the Firestore console changes what this screen says
 * with no rebuild. Note that the values shown are today's: the values that price
 * a given fee are `feeRate` and `minFeeApplied`, snapshotted on that fee record
 * at hire.
 */
export default function PricingScreen() {
  const router = useRouter();
  const colors = useTheme();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const rowDir = rtl ? 'row-reverse' : ('row' as const);
  const align = rtl ? ('right' as const) : ('left' as const);

  const pricing = usePricingConfig();
  const vars = { rate: pricing.feePercent, min: pricing.minFeeAmount };

  return (
    <Screen style={styles.content} scrollable>
      <TouchableOpacity
        style={[styles.backRow, { flexDirection: rowDir }]}
        onPress={() => router.back()}
        activeOpacity={0.7}
        accessibilityRole="button"
        hitSlop={10}
      >
        {rtl
          ? <ChevronRight size={22} color={colors.primary} strokeWidth={2} />
          : <ChevronLeft size={22} color={colors.primary} strokeWidth={2} />}
        <AppText weight="bold" style={styles.title}>
          {t('pricing.title')}
        </AppText>
      </TouchableOpacity>

      {/* The rate, then the floor. In that order, because the floor only makes
          sense once the percentage has been stated. */}
      <View style={styles.card}>
        <AppText
          weight="bold"
          style={[styles.headline, { color: colors.primary, textAlign: align }]}
        >
          {t('pricing.fee_headline', vars)}
        </AppText>
        <AppText
          weight="regular"
          style={[styles.body, { color: colors.textMuted, textAlign: align }]}
        >
          {t('pricing.fee_base_note')}
        </AppText>
      </View>

      <View style={styles.card}>
        <AppText
          weight="semiBold"
          style={[styles.subhead, { color: colors.text, textAlign: align }]}
        >
          {t('pricing.fee_minimum', vars)}
        </AppText>
        <AppText
          weight="regular"
          style={[styles.body, { color: colors.text, textAlign: align }]}
        >
          {t('pricing.fee_minimum_explain', vars)}
        </AppText>
      </View>

      {/* When a fee comes into existence at all. A cancelled project carries
          none, and saying so here is the other half of the promise. */}
      <View style={styles.card}>
        <AppText
          weight="regular"
          style={[styles.body, { color: colors.text, textAlign: align }]}
        >
          {t('pricing.fee_when')}
        </AppText>
      </View>

      {/* Reuses the balance screen's own wording for settlement rather than
          restating it — two descriptions of how money moves would drift. */}
      <View style={[styles.card, styles.howCard]}>
        <AppText
          weight="semiBold"
          style={[styles.subhead, { color: colors.text, textAlign: align }]}
        >
          {t('balance.how_title')}
        </AppText>
        <AppText
          weight="regular"
          style={[styles.body, { color: colors.text, textAlign: align }]}
        >
          {t('balance.how_body')}
        </AppText>
        <AppText
          weight="regular"
          style={[styles.note, { color: colors.textMuted, textAlign: align }]}
        >
          {t('balance.no_charge_note')}
        </AppText>
      </View>
    </Screen>
  );
}

// The app's card convention, hardcoded per screen rather than themed — matching
// src/app/settings/payment.tsx, which this screen sits beside.
const CARD_SHADOW = {
  shadowColor: '#1e4fa3',
  shadowOpacity: 0.06,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 8 },
  backRow: { alignItems: 'center', gap: 6, paddingVertical: 12 },
  title: { fontSize: 20 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    ...CARD_SHADOW,
  },
  howCard: { backgroundColor: 'rgba(255,255,255,0.75)' },
  headline: { fontSize: 18, marginBottom: 6 },
  subhead: { fontSize: 15, marginBottom: 6 },
  body: { fontSize: 14, lineHeight: 21 },
  note: { fontSize: 12, lineHeight: 18, marginTop: 10 },
});
