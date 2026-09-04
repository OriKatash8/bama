import { useEffect, useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react-native';
import { Screen } from '@components/layout/Screen';
import { AppText } from '@components/ui/AppText';
import { useTheme } from '@core/hooks/useTheme';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAuthStore } from '@core/stores/authStore';
import { useUiStore } from '@core/stores/uiStore';
import {
  NON_SUBSCRIBER_SLOT_CAP,
  SUBSCRIBER_MONTHLY_LIMIT,
  SUB_PRICE_MONTHLY,
  SUB_PRICE_ANNUAL,
  PLATFORM_FEE_RATE,
} from '@core/constants/pricing';
import {
  listenToSubscription,
  type SubscriptionState,
  deriveSubscriptionState,
} from '@features/pricing/services/subscriptionService';
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

const FEE_PERCENT = Math.round(PLATFORM_FEE_RATE * 100);

/**
 * One route, two renders.
 *
 * A non-subscriber is shown what a subscription changes. A subscriber is shown
 * where they stand — the monthly counter exists so nobody discovers the limit by
 * hitting it. The counter renders ONLY for an active subscription; there is no
 * quota to show anyone else.
 *
 * Every number is read from the pricing config.
 */
export default function SubscriptionScreen() {
  const router = useRouter();
  const colors = useTheme();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const rowDir = rtl ? 'row-reverse' : ('row' as const);
  const align = rtl ? 'right' : 'left';
  const userId = useAuthStore((s) => s.user?.id);
  const showToast = useUiStore((s) => s.showToast);

  const [state, setState] = useState<SubscriptionState>(() => deriveSubscriptionState(null));

  useEffect(() => {
    if (!userId) return;
    return listenToSubscription(userId, setState);
  }, [userId]);

  const { isSubscriber, monthCount, monthlyLimit, resetsAt, subscription } = state;

  const dateFmt = (d: Date | null | undefined) =>
    d ? d.toLocaleDateString(rtl ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'long' }) : '';

  // The app's Timestamp type is a plain {seconds, nanoseconds}; converting from
  // seconds works for both that and the real Firestore Timestamp at runtime.
  const renewsAt = subscription?.renewsAt
    ? new Date(subscription.renewsAt.seconds * 1000)
    : null;

  // Payments are not live yet; selecting a plan is deliberately inert rather
  // than pretending to charge.
  const notYet = (key: string) => () => showToast(t(key), 'info');

  const header = (
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
        {t('settings.sub_title')}
      </AppText>
    </TouchableOpacity>
  );

  // ── Subscriber ─────────────────────────────────────────────────────────────
  if (isSubscriber) {
    const pips = Array.from({ length: monthlyLimit }, (_, i) => i < monthCount);
    return (
      <Screen style={styles.content} scrollable>
        {header}

        <View style={styles.card}>
          <AppText weight="semiBold" style={[styles.counterTitle, { color: colors.text, textAlign: align }]}>
            {t('settings.sub_counter_title')}
          </AppText>
          <AppText weight="bold" style={[styles.counterNumber, { color: colors.primary }]}>
            {monthCount}/{monthlyLimit}
          </AppText>
          {/* One pip per allowed project — the limit is visible before it bites. */}
          <View style={[styles.pipRow, { flexDirection: rowDir }]}>
            {pips.map((filled, i) => (
              <View
                key={i}
                style={[styles.pip, { backgroundColor: filled ? colors.primary : colors.border }]}
              />
            ))}
          </View>
          <AppText weight="regular" style={[styles.metaLine, { color: colors.textMuted }]}>
            {t('settings.sub_resets', { date: dateFmt(resetsAt) })}
          </AppText>
          {renewsAt && (
            <AppText weight="regular" style={[styles.metaLine, { color: colors.textMuted }]}>
              {t('settings.sub_renews', { date: dateFmt(renewsAt) })}
            </AppText>
          )}
        </View>

        <View style={[styles.card, { alignItems: 'stretch' }]}>
          <AppText weight="semiBold" style={[styles.planName, { color: colors.text, textAlign: align }]}>
            {subscription?.plan === 'annual'
              ? t('settings.sub_plan_annual')
              : t('settings.sub_plan_monthly')}
          </AppText>
          <TouchableOpacity
            style={[styles.manageBtn, { borderColor: colors.border }]}
            onPress={notYet('settings.sub_manage_soon')}
            activeOpacity={0.8}
          >
            <AppText weight="semiBold" style={{ color: colors.primary, fontSize: 14 }}>
              {t('settings.sub_manage')}
            </AppText>
          </TouchableOpacity>
        </View>
      </Screen>
    );
  }

  // ── Non-subscriber ─────────────────────────────────────────────────────────
  const planCard = (opts: {
    name: string;
    price: string;
    benefit: string;
    recommended?: boolean;
    current?: boolean;
  }) => (
    <View
      key={opts.name}
      style={[
        styles.plan,
        { borderColor: opts.recommended ? colors.primary : colors.border },
        opts.recommended && styles.planRecommended,
      ]}
    >
      <View style={[styles.planHeader, { flexDirection: rowDir }]}>
        <AppText weight="bold" style={[styles.planTitle, { color: colors.text }]}>{opts.name}</AppText>
        {opts.recommended && (
          <View style={[styles.tag, { backgroundColor: colors.primary }]}>
            <AppText weight="bold" style={styles.tagText}>{t('settings.sub_recommended')}</AppText>
          </View>
        )}
        {opts.current && (
          <View style={[styles.tag, { backgroundColor: colors.border }]}>
            <AppText weight="bold" style={[styles.tagText, { color: colors.textMuted }]}>
              {t('settings.sub_none_current')}
            </AppText>
          </View>
        )}
      </View>
      <AppText weight="bold" style={[styles.planPrice, { color: colors.primary, textAlign: align }]}>
        {opts.price}
      </AppText>
      {!opts.current && (
        <AppText weight="regular" style={[styles.launch, { color: colors.textMuted, textAlign: align }]}>
          {t('settings.sub_launch_price')}
        </AppText>
      )}
      <AppText weight="regular" style={[styles.planBenefit, { color: colors.textMuted, textAlign: align }]}>
        {opts.benefit}
      </AppText>
      {/* The baseline card is a statement of where they already are, so it is
          deliberately not selectable. */}
      {!opts.current && (
        <TouchableOpacity
          style={[styles.planCta, { backgroundColor: opts.recommended ? colors.primary : 'transparent', borderColor: colors.primary }]}
          onPress={notYet('settings.sub_select_soon')}
          activeOpacity={0.85}
        >
          <AppText weight="bold" style={[styles.planCtaText, { color: opts.recommended ? '#ffffff' : colors.primary }]}>
            {opts.name}
          </AppText>
        </TouchableOpacity>
      )}
    </View>
  );

  const faq: [string, string][] = [
    [t('settings.sub_faq_limit_q', { limit: SUBSCRIBER_MONTHLY_LIMIT }), t('settings.sub_faq_limit_a')],
    [
      t('settings.sub_faq_annual_q'),
      t('settings.sub_faq_annual_a', {
        limit: SUBSCRIBER_MONTHLY_LIMIT,
        yearly: SUBSCRIBER_MONTHLY_LIMIT * 12,
      }),
    ],
    [t('settings.sub_faq_fee_q'), t('settings.sub_faq_fee_a', { percent: FEE_PERCENT })],
  ];

  return (
    <Screen style={styles.content} scrollable>
      {header}

      {planCard({
        name: t('settings.sub_none_title'),
        price: '₪0',
        benefit: t('settings.sub_none_desc', { cap: NON_SUBSCRIBER_SLOT_CAP, percent: FEE_PERCENT }),
        current: true,
      })}
      {planCard({
        name: t('settings.sub_monthly_title'),
        price: t('settings.sub_price_month', { price: SUB_PRICE_MONTHLY }),
        benefit: t('settings.sub_benefit', { limit: SUBSCRIBER_MONTHLY_LIMIT }),
      })}
      {planCard({
        name: t('settings.sub_annual_title'),
        price: t('settings.sub_price_year', { price: SUB_PRICE_ANNUAL }),
        benefit: t('settings.sub_benefit', { limit: SUBSCRIBER_MONTHLY_LIMIT }),
        recommended: true,
      })}

      <AppText weight="bold" style={[styles.faqTitle, { textAlign: align }]}>
        {t('settings.sub_faq_title')}
      </AppText>
      {faq.map(([q, a]) => (
        <View key={q} style={styles.faqItem}>
          <View style={[styles.faqQRow, { flexDirection: rowDir }]}>
            <Check size={14} color={colors.primary} strokeWidth={2.5} />
            <AppText weight="semiBold" style={[styles.faqQ, { color: colors.text, textAlign: align }]}>{q}</AppText>
          </View>
          <AppText weight="regular" style={[styles.faqA, { color: colors.textMuted, textAlign: align }]}>{a}</AppText>
        </View>
      ))}
    </Screen>
  );
}

// The app's card convention, hardcoded per screen rather than themed — see the
// note on `card` in src/core/hooks/useTheme.tsx for why the token is not used.
const CARD_SHADOW = {
  shadowColor: '#1e4fa3',
  shadowOpacity: 0.06,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 3,
} as const;
const CARD_BORDER = 'rgba(30,79,163,0.07)';
const HEADING_BLUE = '#1e4fa3';

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 32 },
  backRow: { alignItems: 'center', gap: 6, paddingVertical: 12 },
  title: { fontSize: 18, color: HEADING_BLUE },

  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    ...CARD_SHADOW,
  },
  counterTitle: { fontSize: 14, alignSelf: 'stretch' },
  counterNumber: { fontSize: 34, lineHeight: 40 },
  pipRow: { gap: 6, marginVertical: 6, flexWrap: 'wrap', justifyContent: 'center' },
  pip: { width: 18, height: 6, borderRadius: 3 },
  metaLine: { fontSize: 12 },
  planName: { fontSize: 15, marginBottom: 10 },
  manageBtn: { borderWidth: 1.5, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },

  plan: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    gap: 3,
    ...CARD_SHADOW,
  },
  planRecommended: { borderWidth: 2 },
  planHeader: { alignItems: 'center', gap: 8, marginBottom: 2 },
  planTitle: { fontSize: 15, flex: 1 },
  tag: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 3 },
  tagText: { fontSize: 11, color: '#ffffff' },
  planPrice: { fontSize: 26, lineHeight: 32 },
  launch: { fontSize: 11 },
  planBenefit: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  planCta: { borderWidth: 1.5, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 10 },
  planCtaText: { fontSize: 14 },

  faqTitle: { fontSize: 16, marginTop: 8, marginBottom: 8, color: HEADING_BLUE },
  faqItem: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 8,
    gap: 5,
    ...CARD_SHADOW,
  },
  faqQRow: { alignItems: 'center', gap: 7 },
  faqQ: { fontSize: 13, flex: 1 },
  faqA: { fontSize: 12, lineHeight: 18 },
});
