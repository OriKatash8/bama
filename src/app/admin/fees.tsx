import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { callFunction } from '@core/firebase/functions';
import { useTheme } from '@core/hooks/useTheme';
import { useAppFont } from '@core/hooks/useAppFont';
import { useUiStore } from '@core/stores/uiStore';
import { useSettingsStore } from '@core/stores/settingsStore';
import { confirmDialog } from '@utils/confirmDialog';
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

const HEADER_PURPLE = '#cb6ce6';
const BLOCKED_RED = '#d32f2f';
const OK_GREEN = '#4caf50';

type ArrearsProject = {
  projectId: string; title: string; owed: number; demandSentAt: number | null;
};
type ArrearsRow = {
  professionalId: string; displayName: string; totalOwed: number;
  oldestUnpaidAt: number | null; demandSentAt: number | null; blocked: boolean;
  projects: ArrearsProject[];
};
type FlaggedRow = {
  projectId: string; title: string; status: string; reason: string;
  proId: string | null; proName: string; clientName: string;
  flaggedAt: number | null; note: string;
};

const listArrears = callFunction<
  Record<string, never>, { rows: ArrearsRow[]; graceDays: number }
>('adminListArrears');
const listFlagged = callFunction<Record<string, never>, { rows: FlaggedRow[] }>(
  'adminListFlaggedProjects',
);
const markDemandSent = callFunction<
  { projectId: string; professionalId: string }, { ok: boolean }
>('markDemandSent');
const markFeePaid = callFunction<
  { projectId: string; professionalId: string }, { ok: boolean; paid: number }
>('markFeePaid');

type Tab = 'arrears' | 'flagged';

function formatDate(ms: number | null, rtl: boolean): string {
  if (!ms) return '—';
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return rtl
    ? `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
    : `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * The two things the lifecycle writes and nothing read.
 *
 * `adminReviewPending` has been set by `disputeFeeByPro` and by the cron's
 * unanswered-completion branch since the completion rewrite, with no surface —
 * a dispute was a database side effect nobody saw. And outstanding fees were
 * visible only to the professional who owed them, because `firestore.rules`
 * grants read on a fee record to its owner and to nobody else.
 *
 * Both lists come from ADMIN-ONLY CALLABLES rather than a client query, so the
 * rules stay as tight as they are and no collection-group index is needed. One
 * consequence to know: these are one-shot reads, not `onSnapshot` listeners like
 * the other admin screens — an action refreshes the list rather than the list
 * updating itself.
 *
 * `blocked` on a row is computed server-side with the SAME predicate
 * `hireProfessional` enforces with, so this screen cannot show one rule while
 * the server applies another.
 */
export default function AdminFeesScreen() {
  const colors = useTheme();
  const font = useAppFont();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const showToast = useUiStore((s) => s.showToast);
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const rowDir = rtl ? 'row-reverse' : ('row' as const);
  const textAlign = rtl ? ('right' as const) : ('left' as const);

  const [tab, setTab] = useState<Tab>('arrears');
  const [arrears, setArrears] = useState<ArrearsRow[] | null>(null);
  const [graceDays, setGraceDays] = useState(0);
  const [flagged, setFlagged] = useState<FlaggedRow[] | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try {
      const [a, f] = await Promise.all([listArrears({}), listFlagged({})]);
      setArrears(a.rows);
      setGraceDays(a.graceDays);
      setFlagged(f.rows);
    } catch (e) {
      // Surfaced, never swallowed: an empty list and a failed call look identical
      // on screen, and "no arrears" is the more dangerous of the two to believe.
      console.error('[admin/fees] load failed:', e);
      showToast((e as { message?: string })?.message ?? t('admin_fees.action_failed'), 'error');
      setArrears([]);
      setFlagged([]);
    }
  }, [showToast]);

  useEffect(() => { void load(); }, [load]);

  /** `confirmDialog`, not Alert.alert — the latter no-ops on web, where admin runs. */
  async function act(
    key: string,
    prompt: string,
    run: () => Promise<unknown>,
    done: string,
  ) {
    if (busy[key]) return;
    const ok = await confirmDialog(t('admin_fees.title'), prompt, {
      confirm: t('common.confirm'), cancel: t('common.cancel'),
    });
    if (!ok) return;
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      await run();
      showToast(done, 'success');
      await load();
    } catch (e) {
      showToast((e as { message?: string })?.message ?? t('admin_fees.action_failed'), 'error');
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  }

  const loading = arrears === null || flagged === null;
  const TABS: Tab[] = ['arrears', 'flagged'];

  return (
    <View style={[styles.flex, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, {
        backgroundColor: HEADER_PURPLE,
        paddingTop: insets.top + 14,
        alignItems: rtl ? 'flex-end' : 'flex-start',
      }]}>
        <TouchableOpacity
          style={[styles.back, { flexDirection: rowDir }]}
          onPress={() => router.push('/admin/operations')}
          activeOpacity={0.7}
          hitSlop={10}
        >
          {rtl
            ? <ChevronRight size={18} color="#ffffff" strokeWidth={2} />
            : <ChevronLeft size={18} color="#ffffff" strokeWidth={2} />}
          <Text style={[styles.greeting, { ...font.regular }]}>{t('admin_fees.greeting')}</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { ...font.medium, textAlign }]}>
          {t('admin_fees.title')}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.filters, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          {TABS.map((tb) => {
            const count = tb === 'arrears' ? arrears?.length ?? 0 : flagged?.length ?? 0;
            const active = tab === tb;
            return (
              <TouchableOpacity
                key={tb}
                style={[styles.pill, { backgroundColor: active ? colors.primary : colors.inputBg }]}
                onPress={() => setTab(tb)}
                activeOpacity={0.8}
              >
                <Text style={[styles.pillText, {
                  ...font.medium, color: active ? '#ffffff' : colors.textSec,
                }]}>
                  {t(`admin_fees.tab_${tb}`)} ({count})
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : tab === 'arrears' ? (
          arrears.length === 0 ? (
            <Text style={[styles.empty, { ...font.regular, color: colors.textMuted }]}>
              {t('admin_fees.empty_arrears')}
            </Text>
          ) : (
            <>
              <Text style={[styles.note, { ...font.regular, color: colors.textMuted, textAlign }]}>
                {t('admin_fees.grace_note', { days: graceDays })}
              </Text>
              {arrears.map((row) => (
                <View
                  key={row.professionalId}
                  style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}
                >
                  <View style={[styles.cardHead, { flexDirection: rowDir }]}>
                    <Text
                      style={[styles.name, { ...font.bold, color: colors.text, textAlign }]}
                      numberOfLines={1}
                    >
                      {row.displayName || row.professionalId}
                    </Text>
                    <View style={[styles.badge, {
                      backgroundColor: (row.blocked ? BLOCKED_RED : OK_GREEN) + '22',
                    }]}>
                      <Text style={[styles.badgeText, {
                        ...font.semiBold, color: row.blocked ? BLOCKED_RED : OK_GREEN,
                      }]}>
                        {t(row.blocked ? 'admin_fees.blocked' : 'admin_fees.not_blocked')}
                      </Text>
                    </View>
                  </View>

                  <Text style={[styles.total, { ...font.bold, color: colors.text, textAlign }]}>
                    {t('admin_fees.total_owed', { amount: row.totalOwed.toLocaleString() })}
                  </Text>
                  <Text style={[styles.meta, { ...font.regular, color: colors.textMuted, textAlign }]}>
                    {t('admin_fees.oldest', { date: formatDate(row.oldestUnpaidAt, rtl) })}
                  </Text>
                  <Text style={[styles.meta, { ...font.regular, color: colors.textMuted, textAlign }]}>
                    {row.demandSentAt
                      ? t('admin_fees.demand_sent', { date: formatDate(row.demandSentAt, rtl) })
                      : t('admin_fees.demand_none')}
                  </Text>

                  {/* Per project, because a demand and a settlement are both
                      recorded against ONE fee record, never against a person. */}
                  {row.projects.map((p) => {
                    const key = `${p.projectId}:${row.professionalId}`;
                    const isBusy = busy[key] === true;
                    return (
                      <View key={key} style={[styles.projRow, { borderColor: colors.border }]}>
                        <Text
                          style={[styles.projTitle, { ...font.semiBold, color: colors.text, textAlign }]}
                          numberOfLines={1}
                        >
                          {p.title || p.projectId} · ₪{p.owed.toLocaleString()}
                        </Text>
                        <View style={[styles.actions, { flexDirection: rowDir }]}>
                          {!p.demandSentAt && (
                            <TouchableOpacity
                              style={[styles.actionBtn, { backgroundColor: colors.inputBg }]}
                              disabled={isBusy}
                              activeOpacity={0.8}
                              onPress={() => act(
                                key,
                                t('admin_fees.confirm_demand'),
                                () => markDemandSent({
                                  projectId: p.projectId, professionalId: row.professionalId,
                                }),
                                t('admin_fees.demand_done'),
                              )}
                            >
                              {isBusy
                                ? <ActivityIndicator size="small" color={colors.primary} />
                                : <Text style={[styles.actionText, { ...font.medium, color: colors.text }]}>
                                    {t('admin_fees.mark_demand')}
                                  </Text>}
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                            disabled={isBusy}
                            activeOpacity={0.8}
                            onPress={() => act(
                              key,
                              t('admin_fees.confirm_paid'),
                              () => markFeePaid({
                                projectId: p.projectId, professionalId: row.professionalId,
                              }),
                              t('admin_fees.paid_done'),
                            )}
                          >
                            {isBusy
                              ? <ActivityIndicator size="small" color="#ffffff" />
                              : <Text style={[styles.actionText, { ...font.medium, color: '#ffffff' }]}>
                                  {t('admin_fees.mark_paid')}
                                </Text>}
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ))}
            </>
          )
        ) : flagged.length === 0 ? (
          <Text style={[styles.empty, { ...font.regular, color: colors.textMuted }]}>
            {t('admin_fees.empty_flagged')}
          </Text>
        ) : (
          flagged.map((row) => (
            <View
              key={row.projectId}
              style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}
            >
              <Text
                style={[styles.name, { ...font.bold, color: colors.text, textAlign }]}
                numberOfLines={1}
              >
                {row.title || row.projectId}
              </Text>
              <Text style={[styles.reason, { ...font.semiBold, color: BLOCKED_RED, textAlign }]}>
                {row.reason
                  ? t(`admin_fees.reason_${row.reason}`)
                  : row.reason}
              </Text>
              <Text style={[styles.meta, { ...font.regular, color: colors.textMuted, textAlign }]}>
                {t('admin_fees.flagged_at', { date: formatDate(row.flaggedAt, rtl) })}
              </Text>
              {!!row.proName && (
                <Text style={[styles.meta, { ...font.regular, color: colors.textMuted, textAlign }]}>
                  {t('admin_fees.pro_label', { name: row.proName })}
                </Text>
              )}
              <Text style={[styles.meta, { ...font.regular, color: colors.textMuted, textAlign }]}>
                {t('admin_fees.client_label', { name: row.clientName })}
              </Text>
              {!!row.note && (
                <Text style={[styles.note, { ...font.regular, color: colors.text, textAlign }]}>
                  {row.note}
                </Text>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { paddingBottom: 14, paddingHorizontal: 16, gap: 2 },
  back: { alignItems: 'center', gap: 4 },
  greeting: { fontSize: 11, color: 'rgba(255,255,255,0.7)' },
  headerTitle: { fontSize: 17, color: '#ffffff', width: '100%' },

  content: { padding: 16, paddingBottom: 100 },

  filters: { flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  pill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  pillText: { fontSize: 13 },

  empty: { fontSize: 15, marginTop: 40, width: '100%', textAlign: 'center' },
  note: { fontSize: 12, lineHeight: 18, marginBottom: 12, width: '100%' },

  card: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 12, gap: 6 },
  cardHead: { justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontSize: 15 },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  badgeText: { fontSize: 12 },
  total: { fontSize: 15, width: '100%' },
  meta: { fontSize: 12, width: '100%' },
  reason: { fontSize: 13, width: '100%' },

  projRow: { borderTopWidth: 1, paddingTop: 10, marginTop: 4, gap: 8 },
  projTitle: { fontSize: 13, width: '100%' },
  actions: { gap: 8 },
  actionBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 9, borderRadius: 10,
  },
  actionText: { fontSize: 13 },
});
