import { useEffect, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Screen } from '@components/layout/Screen';
import { AppText } from '@components/ui/AppText';
import { useTheme } from '@core/hooks/useTheme';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAuthStore } from '@core/stores/authStore';
import { getDocument } from '@core/firebase/firestore';
import { listenToMyFees } from '@features/pricing/services/feesService';
import { outstandingFee, feePercent } from '@features/pricing/utils/fee';
import type { ProjectFee, ProjectRequest } from '@core/types/project';
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

type Row = {
  projectId: string;
  title: string;
  fee: ProjectFee;
  owed: number;
};

/**
 * A professional's BAMA balance: what they owe in platform commission, per
 * completed project, and how to settle it.
 *
 * READ-ONLY. There is no charge button and no payment rail here — settlement
 * happens outside the app, by bank transfer or Bit, and an admin records it.
 * The screen must never claim a payment occurred, because nothing on it can
 * make one occur.
 *
 * It also unlocks nothing. This used to be a pay screen that listed what the
 * money bought — a free slot and the publication of the client's review. Both of
 * those are now released by completing the project, for everyone, whatever is
 * owed. What is left is a statement of account.
 *
 * `projectId` is optional and only decides which row is shown first; the screen
 * always lists the full balance, because a professional who owes on three
 * projects needs one number, not three visits.
 */
export default function BalanceScreen() {
  const router = useRouter();
  const colors = useTheme();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const rowDir = rtl ? 'row-reverse' : ('row' as const);
  const align = rtl ? 'right' : ('left' as const);
  const userId = useAuthStore((s) => s.user?.id);

  const { projectId } = useLocalSearchParams<{ projectId?: string }>();

  const [rows, setRows] = useState<Row[] | null>(null);

  // A listener, not a fetch: this screen is reached from the chat list and the
  // project detail, and an admin recording a payment while it is open should
  // settle the row rather than leave a stale amount on screen.
  useEffect(() => {
    if (!userId) { setRows([]); return; }
    let active = true;

    return listenToMyFees(userId, (byProjectId) => {
      const owing = [...byProjectId.entries()]
        .map(([id, fee]) => ({ projectId: id, fee, owed: outstandingFee(fee) }))
        .filter((r) => r.owed > 0);

      // Titles come from the project documents, which are world-readable to any
      // signed-in user. A failed title read must not drop the row — the amount
      // is the point, so it falls back to a generic label.
      Promise.all(
        owing.map(async (r) => {
          let title = t('balance.project_fallback');
          try {
            const p = await getDocument<ProjectRequest>(`projects/${r.projectId}`);
            if (p?.title) title = p.title;
          } catch (err) {
            console.error('[balance] project title load failed:', r.projectId, err);
          }
          return { ...r, title };
        }),
      ).then((withTitles) => {
        if (!active) return;
        // The project they arrived from goes first; the rest keep their order.
        withTitles.sort((a, b) => {
          if (a.projectId === projectId) return -1;
          if (b.projectId === projectId) return 1;
          return 0;
        });
        setRows(withTitles);
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, projectId, language]);

  const total = (rows ?? []).reduce((sum, r) => sum + r.owed, 0);

  const back = (
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
        {t('balance.title')}
      </AppText>
    </TouchableOpacity>
  );

  if (rows === null) {
    return (
      <Screen style={styles.content}>
        {back}
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      </Screen>
    );
  }

  return (
    <Screen style={styles.content} scrollable>
      {back}

      {total <= 0 ? (
        <View style={styles.card}>
          <AppText weight="semiBold" style={[styles.settled, { color: SETTLED_GREEN }]}>
            {t('balance.nothing_owed')}
          </AppText>
        </View>
      ) : (
        <>
          {/* One number first. A professional owing on three projects should not
              have to add them up themselves. */}
          <View style={styles.card}>
            <AppText weight="regular" style={[styles.amountLabel, { color: colors.textMuted }]}>
              {t('balance.total_label')}
            </AppText>
            <AppText weight="bold" style={[styles.amount, { color: colors.primary }]}>
              ₪{total.toLocaleString()}
            </AppText>
          </View>

          {rows.map((r) => (
            <View key={r.projectId} style={[styles.card, styles.lineCard]}>
              <View style={[styles.lineTop, { flexDirection: rowDir }]}>
                <AppText
                  weight="semiBold"
                  style={[styles.lineTitle, { color: colors.text, textAlign: align }]}
                  numberOfLines={1}
                >
                  {r.title}
                </AppText>
                <AppText weight="bold" style={[styles.lineAmount, { color: colors.text }]}>
                  ₪{r.owed.toLocaleString()}
                </AppText>
              </View>
              {/* The amount is never shown without saying what it is a percentage
                  of, and the percent comes from the rate stored on the fee record
                  at hire — not from today's config. */}
              <AppText weight="regular" style={[styles.lineBreakdown, { color: colors.textMuted, textAlign: align }]}>
                {t('balance.line_breakdown', {
                  percent: feePercent(r.fee),
                  base: (r.fee.baseAmount ?? 0).toLocaleString(),
                })}
              </AppText>
              {r.fee.status === 'disputed' && (
                <AppText weight="semiBold" style={[styles.lineDisputed, { textAlign: align }]}>
                  {t('balance.status_disputed')}
                </AppText>
              )}
            </View>
          ))}

          {/* How the money actually moves. Stated plainly, and stated as being
              outside the app, because it is. */}
          <View style={[styles.card, styles.howCard]}>
            <AppText weight="semiBold" style={[styles.howTitle, { color: colors.text, textAlign: align }]}>
              {t('balance.how_title')}
            </AppText>
            <AppText weight="regular" style={[styles.howBody, { color: colors.text, textAlign: align }]}>
              {t('balance.how_body')}
            </AppText>
            <AppText weight="regular" style={[styles.howNote, { color: colors.textMuted, textAlign: align }]}>
              {t('balance.no_charge_note')}
            </AppText>
          </View>
        </>
      )}
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
/** Green marks affirmative STATE on this screen. There is no action to colour. */
const SETTLED_GREEN = '#2d6a2d';
const DISPUTED_AMBER = '#8a6100';

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16 },
  backRow: { alignItems: 'center', gap: 6, paddingVertical: 12 },
  title: { fontSize: 18, color: HEADING_BLUE },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    ...CARD_SHADOW,
  },
  lineCard: { alignItems: 'stretch', gap: 4 },
  lineTop: { alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  lineTitle: { fontSize: 15, flex: 1 },
  lineAmount: { fontSize: 16 },
  lineBreakdown: { fontSize: 13 },
  lineDisputed: { fontSize: 12, color: DISPUTED_AMBER, marginTop: 2 },
  amountLabel: { fontSize: 13 },
  amount: { fontSize: 40, lineHeight: 48 },
  howCard: { alignItems: 'stretch', gap: 8 },
  howTitle: { fontSize: 14 },
  howBody: { fontSize: 13, lineHeight: 20 },
  howNote: { fontSize: 12, lineHeight: 18 },
  settled: { fontSize: 15 },
});
