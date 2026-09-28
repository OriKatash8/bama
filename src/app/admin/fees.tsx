import { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { AlertTriangle, Receipt } from 'lucide-react-native';
import { callFunction } from '@core/firebase/functions';
import { useUiStore } from '@core/stores/uiStore';
import { confirmDialog } from '@utils/confirmDialog';
import {
  AdminPage, AdminText, Card, CardHead, EmptyState, IconTile, InitialsAvatar, PillButton, Segment,
  StatGrid, StatTile, WhoBlock, RADIUS, SPACE, TYPE, useAdminPalette, useScopedT,
} from '@features/admin/ui';

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
  const p = useAdminPalette();
  const router = useRouter();
  const showToast = useUiStore((s) => s.showToast);
  const { t, rtl, rowDir, textAlign } = useScopedT('admin_fees');
  const { t: tCommon } = useScopedT('common');
  const { t: tDash } = useScopedT('admin_dashboard');
  const { t: tCa } = useScopedT('community_admin');

  const [tab, setTab] = useState<Tab>('arrears');
  const [arrears, setArrears] = useState<ArrearsRow[]>([]);
  const [graceDays, setGraceDays] = useState(0);
  const [flagged, setFlagged] = useState<FlaggedRow[]>([]);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  /**
   * THREE states, not two, and the third is the point of this screen.
   *
   * 'error' must never render as an empty list. A failed query showing "nothing
   * outstanding" is indistinguishable from the truth, and it is the reading that
   * makes someone stop checking — the debt is still there, the screen just did
   * not fetch it. A toast cannot carry this: it is transient, and the wrong
   * conclusion outlives it.
   */
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');

  /** Both lists in one round; `state` starts as 'loading', so the first run needs no reset. */
  const fetchAll = useCallback(
    () => Promise.all([listArrears({}), listFlagged({})]).then(
      ([a, f]) => {
        setArrears(a.rows);
        setGraceDays(a.graceDays);
        setFlagged(f.rows);
        setState('ok');
      },
      (e: unknown) => {
        // The lists are NOT cleared to [] here. Doing that was the bug: it rendered
        // the empty-state copy, so a denied or failed call read as "no arrears".
        // The screen goes to 'error' instead and says so until a retry succeeds.
        console.error('[admin/fees] load failed:', e);
        setState('error');
      },
    ),
    [],
  );

  const load = useCallback(async () => {
    setState('loading');
    await fetchAll();
  }, [fetchAll]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/admin/operations');
  }

  /** `confirmDialog`, not Alert.alert — the latter no-ops on web, where admin runs. */
  async function act(
    key: string,
    prompt: string,
    run: () => Promise<unknown>,
    done: string,
  ) {
    if (busy[key]) return;
    const ok = await confirmDialog(t('title'), prompt, {
      confirm: tCommon('confirm'), cancel: tCommon('cancel'),
    });
    if (!ok) return;
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      await run();
      showToast(done, 'success');
      await load();
    } catch (e) {
      showToast((e as { message?: string })?.message ?? t('action_failed'), 'error');
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  }

  const TABS: Tab[] = ['arrears', 'flagged'];
  // '—' rather than '(0)' while the data is unknown: a zero here makes the same
  // false claim the empty list did.
  const countOf = (tb: Tab) =>
    state === 'ok' ? String(tb === 'arrears' ? arrears.length : flagged.length) : t('count_unknown');
  const totalOwed = arrears.reduce((sum, r) => sum + r.totalOwed, 0);
  const known = state === 'ok';

  return (
    <AdminPage
      testID="fees-page"
      title={t('title')}
      subtitle={t('subtitle')}
      onBack={goBack}
      side={
        <Segment<Tab>
          options={TABS.map((tb) => ({ value: tb, label: `${t(`tab_${tb}`)} (${countOf(tb)})` }))}
          value={tab}
          onChange={setTab}
          label={t('title')}
          testIDPrefix="tab"
        />
      }
    >
      <StatGrid>
        <StatTile
          testID="tile-arrears"
          label={t('tab_arrears')}
          value={known ? arrears.length : null}
          loading={state === 'loading'}
          caption={known ? t('total_owed', { amount: totalOwed.toLocaleString() }) : t('count_unknown')}
        />
        <StatTile
          testID="tile-flagged"
          label={t('tab_flagged')}
          value={known ? flagged.length : null}
          loading={state === 'loading'}
          ring={known && flagged.length > 0}
          caption={!known ? t('count_unknown') : flagged.length > 0 ? tDash('attention') : tCa('all_clear')}
        />
      </StatGrid>

      {state === 'loading' ? (
        <ActivityIndicator size="large" color={p.accent} style={styles.spinner} testID="fees-loading" />
      ) : state === 'error' ? (
        <Card priority testID="fees-error">
          <View style={[styles.errorBody, { alignItems: rtl ? 'flex-end' : 'flex-start' }]}>
            <View style={[styles.errorHead, { flexDirection: rowDir }]}>
              <IconTile icon={AlertTriangle} tone="bad" />
              <AdminText weight="bold" style={[TYPE.priorityTitle, styles.grow, { color: p.bad, textAlign }]}>
                {t('load_failed_title')}
              </AdminText>
            </View>
            <AdminText style={[styles.body, { color: p.text2, textAlign }]}>
              {t('load_failed_body')}
            </AdminText>
            <PillButton variant="primary" label={t('retry')} onPress={() => void load()} testID="fees-retry" />
          </View>
        </Card>
      ) : tab === 'arrears' ? (
        <Card testID="arrears-card">
          <CardHead
            title={t('tab_arrears')}
            sub={arrears.length > 0 ? t('grace_note', { days: graceDays }) : undefined}
          />
          {arrears.length === 0 ? (
            <EmptyState text={t('empty_arrears')} testID="arrears-empty" />
          ) : (
            arrears.map((row) => {
              const name = row.displayName || row.professionalId;
              return (
                <View
                  key={row.professionalId}
                  testID={`arrears-${row.professionalId}`}
                  style={[styles.section, { borderTopColor: p.border }]}
                >
                  <View style={[styles.sectionHead, { flexDirection: rowDir }]} testID={`arrears-head-${row.professionalId}`}>
                    <InitialsAvatar name={name} />
                    <WhoBlock
                      name={name}
                      meta={t('oldest', { date: formatDate(row.oldestUnpaidAt, rtl) })}
                      textAlign={textAlign}
                    />
                    <StatusChip
                      tone={row.blocked ? 'bad' : 'good'}
                      label={t(row.blocked ? 'blocked' : 'not_blocked')}
                    />
                  </View>

                  <View style={styles.facts}>
                    <AdminText weight="bold" tabular style={[styles.total, { textAlign }]}>
                      {t('total_owed', { amount: row.totalOwed.toLocaleString() })}
                    </AdminText>
                    <AdminText style={[TYPE.rowMeta, { color: p.text3, textAlign }]}>
                      {row.demandSentAt
                        ? t('demand_sent', { date: formatDate(row.demandSentAt, rtl) })
                        : t('demand_none')}
                    </AdminText>
                  </View>

                  {/* Per project, because a demand and a settlement are both
                      recorded against ONE fee record, never against a person. */}
                  {row.projects.map((pr) => {
                    const key = `${pr.projectId}:${row.professionalId}`;
                    const isBusy = busy[key] === true;
                    return (
                      <View
                        key={key}
                        testID={`project-${key}`}
                        style={[styles.projRow, { flexDirection: rowDir, backgroundColor: p.surface2 }]}
                      >
                        <IconTile icon={Receipt} tone="neutral" />
                        <AdminText
                          weight="semiBold"
                          tabular
                          numberOfLines={1}
                          style={[TYPE.rowName, styles.grow, { textAlign }]}
                        >
                          {pr.title || pr.projectId} · ₪{pr.owed.toLocaleString()}
                        </AdminText>
                        <View style={[styles.actions, { flexDirection: rowDir }]}>
                          {isBusy ? <ActivityIndicator size="small" color={p.accent} testID={`busy-${key}`} /> : null}
                          {!pr.demandSentAt && (
                            <PillButton
                              label={t('mark_demand')}
                              disabled={isBusy}
                              testID={`demand-${key}`}
                              onPress={() => act(
                                key,
                                t('confirm_demand'),
                                () => markDemandSent({
                                  projectId: pr.projectId, professionalId: row.professionalId,
                                }),
                                t('demand_done'),
                              )}
                            />
                          )}
                          <PillButton
                            variant="primary"
                            label={t('mark_paid')}
                            disabled={isBusy}
                            testID={`paid-${key}`}
                            onPress={() => act(
                              key,
                              t('confirm_paid'),
                              () => markFeePaid({
                                projectId: pr.projectId, professionalId: row.professionalId,
                              }),
                              t('paid_done'),
                            )}
                          />
                        </View>
                      </View>
                    );
                  })}
                </View>
              );
            })
          )}
        </Card>
      ) : (
        <Card testID="flagged-card">
          <CardHead title={t('tab_flagged')} />
          {flagged.length === 0 ? (
            <EmptyState text={t('empty_flagged')} testID="flagged-empty" />
          ) : (
            flagged.map((row) => (
              <View
                key={row.projectId}
                testID={`flagged-${row.projectId}`}
                style={[styles.flagRow, { flexDirection: rowDir, borderTopColor: p.border }]}
              >
                <IconTile icon={AlertTriangle} tone="warn" />
                <View style={styles.grow}>
                  <AdminText weight="semiBold" numberOfLines={1} style={[TYPE.rowName, { textAlign }]}>
                    {row.title || row.projectId}
                  </AdminText>
                  <AdminText weight="semiBold" style={[TYPE.rowMeta, styles.reason, { color: p.bad, textAlign }]}>
                    {row.reason ? t(`reason_${row.reason}`) : row.reason}
                  </AdminText>
                  <AdminText tabular style={[TYPE.rowMeta, { color: p.text3, textAlign }]}>
                    {t('flagged_at', { date: formatDate(row.flaggedAt, rtl) })}
                  </AdminText>
                  {!!row.proName && (
                    <AdminText style={[TYPE.rowMeta, { color: p.text3, textAlign }]}>
                      {t('pro_label', { name: row.proName })}
                    </AdminText>
                  )}
                  <AdminText style={[TYPE.rowMeta, { color: p.text3, textAlign }]}>
                    {t('client_label', { name: row.clientName })}
                  </AdminText>
                  {!!row.note && (
                    <View style={[styles.note, { backgroundColor: p.surface2 }]}>
                      <AdminText style={[styles.body, { color: p.text2, textAlign }]}>{row.note}</AdminText>
                    </View>
                  )}
                </View>
              </View>
            ))
          )}
        </Card>
      )}
    </AdminPage>
  );
}

/** Blocked / not blocked: the palette's red or green on its tint. */
function StatusChip({ tone, label }: { tone: 'bad' | 'good'; label: string }) {
  const p = useAdminPalette();
  const [bg, fg] = tone === 'bad' ? [p.badBg, p.bad] : [p.goodBg, p.good];
  return (
    <View style={[styles.status, { backgroundColor: bg }]}>
      <AdminText weight="semiBold" numberOfLines={1} style={[TYPE.chip, { color: fg }]}>
        {label}
      </AdminText>
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  spinner: { marginTop: 24 },
  errorBody: { padding: SPACE.cardPad, gap: 10 },
  errorHead: { alignItems: 'center', gap: 12, alignSelf: 'stretch' },
  body: { fontSize: 13, lineHeight: 19, alignSelf: 'stretch' },
  section: { borderTopWidth: 1, paddingVertical: 12, paddingHorizontal: SPACE.rowPadH, gap: 10 },
  sectionHead: { alignItems: 'center', gap: 12 },
  status: { borderRadius: RADIUS.pill, paddingVertical: 3, paddingHorizontal: 9, flexShrink: 1, maxWidth: '45%' },
  facts: { gap: 2 },
  total: { fontSize: 15, letterSpacing: -0.15 },
  projRow: { alignItems: 'center', gap: 10, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 10, flexWrap: 'wrap' },
  actions: { gap: 7, alignItems: 'center', flexShrink: 0 },
  flagRow: { alignItems: 'flex-start', gap: 12, paddingVertical: SPACE.rowPadV, paddingHorizontal: SPACE.rowPadH, borderTopWidth: 1 },
  reason: { marginTop: 1, marginBottom: 2 },
  note: { borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10, marginTop: 6 },
});
