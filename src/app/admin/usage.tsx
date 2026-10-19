import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { AlertTriangle } from 'lucide-react-native';
import { confirmDialog } from '@utils/confirmDialog';
import {
  FIRESTORE_FREE_DAILY,
  USAGE_STALE_AFTER_MS,
} from '@core/constants/usageQuotas';
import {
  AdminPage, AdminText, Card, CardHead, EmptyState, IconTile, PillButton,
  useAdminPalette, useScopedT, TYPE,
} from '@features/admin/ui';
import { useUsageStats } from '@features/admin/usage/useUsageStats';
import {
  formatBytes, formatCount, formatResetHour, quotaFraction, quotaLevel,
} from '@features/admin/usage/format';

type Metric = 'reads' | 'writes' | 'deletes';
const METRICS: Metric[] = ['reads', 'writes', 'deletes'];

/** dd/mm HH:MM, local. */
function formatStamp(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** A small tile inside a card: big value on top, quiet label under it, both at the reading edge. */
function MiniStat({ label, value, testID }: { label: string; value: string; testID: string }) {
  const p = useAdminPalette();
  const { textAlign } = useScopedT('admin_usage');
  return (
    <View style={[styles.mini, { backgroundColor: p.surface2, borderColor: p.border }]} testID={testID}>
      <AdminText weight="bold" tabular numberOfLines={1} adjustsFontSizeToFit style={[styles.miniValue, { textAlign }]} testID={`${testID}-value`}>
        {value}
      </AdminText>
      <AdminText numberOfLines={2} style={[TYPE.rowMeta, { color: p.text3, textAlign }]}>{label}</AdminText>
    </View>
  );
}

/** Two tiles per line (one if the card has a single tile); rows mirror in Hebrew. */
function MiniGrid({ children }: { children: React.ReactNode }) {
  const { rowDir } = useScopedT('admin_usage');
  return <View style={[styles.miniGrid, { flexDirection: rowDir }]}>{children}</View>;
}

/** name … value, with a hairline above every row but the first. `bar` (0..1) draws a thin proportion line. */
function ListRow({
  label, value, testID, first, bar, rank,
}: { label: string; value: string; testID: string; first?: boolean; bar?: number; rank?: number }) {
  const p = useAdminPalette();
  const { rowDir, textAlign } = useScopedT('admin_usage');
  return (
    <View style={[styles.listRow, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.border }]} testID={testID}>
      <View style={[styles.listLine, { flexDirection: rowDir }]}>
        {rank != null ? <AdminText tabular style={[styles.rank, { color: p.text3 }]}>{rank}</AdminText> : null}
        <AdminText style={[styles.grow, { color: p.text, textAlign }]} numberOfLines={1} ellipsizeMode="middle">{label}</AdminText>
        <AdminText weight="semiBold" tabular style={styles.listValue} testID={`${testID}-value`}>{value}</AdminText>
      </View>
      {bar != null ? (
        <View style={[styles.listTrack, { flexDirection: rowDir, backgroundColor: p.accentSoft }]}>
          <View style={[styles.listFill, { width: `${Math.max(3, Math.round(bar * 100))}%`, backgroundColor: p.accent }]} />
        </View>
      ) : null}
    </View>
  );
}

/**
 * Admin "Usage": today's Firestore reads/writes/deletes against the free daily quotas
 * (config: usageQuotas.ts), month-to-date totals, Storage, and function invocations. The
 * numbers are a snapshot (`adminStats/usage`) refreshed hourly by collectUsageStats; the
 * button runs it now. Reachable from the Operations hub.
 */
export default function AdminUsageScreen() {
  const p = useAdminPalette();
  const router = useRouter();
  const { t, rtl, rowDir, textAlign } = useScopedT('admin_usage');
  const { data, state, refreshing, refresh } = useUsageStats();
  // Re-evaluated on each snapshot/refresh; only used for the staleness note.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { setNow(Date.now()); }, [data]);

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/admin/operations');
  }

  /** `confirmDialog`, not Alert.alert: the latter no-ops on web, where admin runs. */
  async function onRefresh() {
    try {
      await refresh();
    } catch (e) {
      console.error('[admin/usage] refresh failed:', e);
      await confirmDialog(t('refresh_failed_title'), t('refresh_failed_body'), {
        confirm: t('refresh_ok'),
        cancel: t('retry'),
        destructive: false,
      });
    }
  }

  const updatedMs = data?.updatedAt?.toMillis?.() ?? null;
  const stale = updatedMs != null && now - updatedMs > USAGE_STALE_AFTER_MS;
  const today = data?.today;
  const month = data?.month;
  const storage = data?.storage;
  const resetTime = data?.quota ? formatResetHour(data.quota.israelHour, data.quota.israelMinute) : null;
  const levelColor = { ok: p.accent, warn: p.warn, bad: p.bad } as const;

  return (
    <AdminPage testID="usage-page" title={t('title')} subtitle={t('greeting')} onBack={goBack}>
      {state === 'error' ? (
        <Card priority testID="usage-error">
          <View style={[styles.errorBody, { alignItems: rtl ? 'flex-end' : 'flex-start' }]}>
            <View style={[styles.errorHead, { flexDirection: rowDir }]}>
              <IconTile icon={AlertTriangle} tone="bad" />
              <AdminText weight="bold" style={[TYPE.priorityTitle, styles.grow, { color: p.bad, textAlign }]}>
                {t('load_failed_title')}
              </AdminText>
            </View>
            <AdminText style={{ color: p.text2, textAlign }}>{t('load_failed_body')}</AdminText>
          </View>
        </Card>
      ) : null}

      <Card testID="usage-status">
        <View style={[styles.statusRow, { flexDirection: rowDir }]} testID="usage-status-row">
          <View style={styles.grow}>
            <AdminText weight="semiBold" style={{ color: stale ? p.warn : p.text, textAlign }} numberOfLines={1} testID="usage-updated">
              {updatedMs != null ? t('updated', { time: formatStamp(updatedMs) }) : t('never_updated')}
            </AdminText>
            {stale ? (
              <AdminText style={[TYPE.rowMeta, { color: p.warn, textAlign }]} testID="usage-stale">{t('stale')}</AdminText>
            ) : null}
            {data?.errors && data.errors.length > 0 ? (
              <AdminText style={[TYPE.rowMeta, { color: p.text3, textAlign }]} testID="usage-partial">{t('partial')}</AdminText>
            ) : null}
          </View>
          <PillButton
            variant="primary"
            label={refreshing ? t('refreshing') : t('refresh')}
            onPress={() => void onRefresh()}
            disabled={refreshing}
            testID="usage-refresh"
          />
        </View>
      </Card>

      {state === 'empty' ? (
        <Card testID="usage-empty"><EmptyState text={t('empty')} /></Card>
      ) : null}

      {today?.firestore ? (
        <Card testID="usage-today">
          <CardHead title={t('firestore_today')} sub={resetTime ? t('quota_reset', { time: resetTime }) : undefined} />
          <View style={styles.body} testID="usage-today-body">
            {METRICS.map((m) => {
              const used = today.firestore![m];
              const quota = FIRESTORE_FREE_DAILY[m];
              const frac = quotaFraction(used, quota);
              const level = quotaLevel(frac);
              const color = levelColor[level];
              return (
                <View key={m} style={styles.quotaRow} testID={`quota-${m}`}>
                  <View style={[styles.quotaHead, { flexDirection: rowDir }]}>
                    <AdminText weight="semiBold" style={[styles.grow, { textAlign }]}>{t(m)}</AdminText>
                    <AdminText weight="semiBold" tabular style={{ color }} testID={`quota-${m}-pct`}>
                      {Math.round(frac * 100)}%
                    </AdminText>
                  </View>
                  {/* row-reverse in RTL so the bar fills from the right */}
                  <View testID={`quota-${m}-track`} style={[styles.track, { flexDirection: rowDir, backgroundColor: p.accentSoft }]}>
                    <View
                      testID={`quota-${m}-fill`}
                      style={[styles.fill, { width: `${Math.min(100, Math.round(frac * 100))}%`, backgroundColor: color }]}
                    />
                  </View>
                  <View style={[styles.quotaVals, { flexDirection: rowDir }]}>
                    <AdminText weight="bold" tabular style={[styles.quotaUsed, { color }]} testID={`quota-${m}-value`}>{formatCount(used)}</AdminText>
                    <AdminText tabular style={{ color: p.text3 }} testID={`quota-${m}-of`}>{t('quota_of', { quota: formatCount(quota) })}</AdminText>
                  </View>
                </View>
              );
            })}
          </View>
        </Card>
      ) : null}

      {month ? (
        <Card testID="usage-month">
          <CardHead title={t('month')} />
          <View style={styles.body} testID="usage-month-body">
            <MiniGrid>
              {month.firestore ? METRICS.map((m) => (
                <MiniStat key={m} testID={`month-${m}`} label={t(m)} value={formatCount(month.firestore![m])} />
              )) : null}
              {month.functions ? <MiniStat testID="month-invocations" label={t('invocations_month')} value={formatCount(month.functions.invocations)} /> : null}
              {month.egressBytes != null ? <MiniStat testID="month-egress" label={t('egress')} value={formatBytes(month.egressBytes)} /> : null}
            </MiniGrid>
          </View>
        </Card>
      ) : null}

      {storage || today?.egressBytes != null ? (
        <Card testID="usage-storage">
          <CardHead title={t('storage')} />
          <View style={styles.body}>
            <MiniGrid>
              {storage?.appBucketBytes != null ? <MiniStat testID="storage-app" label={t('storage_app')} value={formatBytes(storage.appBucketBytes)} /> : null}
              {storage ? <MiniStat testID="storage-total" label={t('storage_total')} value={formatBytes(storage.totalBytes)} /> : null}
              {today?.egressBytes != null ? <MiniStat testID="storage-egress" label={t('egress_today')} value={formatBytes(today.egressBytes)} /> : null}
            </MiniGrid>
            {storage && storage.buckets.length > 1 ? (
              <View style={styles.listBlock}>
                <AdminText style={[TYPE.rowMeta, { color: p.text3, textAlign }]}>{t('other_buckets')}</AdminText>
                {storage.buckets.map((b, i) => (
                  <ListRow key={b.name} testID={`bucket-${b.name}`} first={i === 0} label={b.name} value={formatBytes(b.bytes)} />
                ))}
              </View>
            ) : null}
          </View>
        </Card>
      ) : null}

      {today?.functions ? (
        <Card testID="usage-functions">
          <CardHead title={t('functions')} />
          <View style={styles.body}>
            <MiniGrid>
              <MiniStat testID="fn-today" label={t('invocations_today')} value={formatCount(today.functions.invocations)} />
            </MiniGrid>
            {today.functions.top.length > 0 ? (
              <View style={styles.listBlock}>
                <AdminText style={[TYPE.rowMeta, { color: p.text3, textAlign }]}>{t('top_functions')}</AdminText>
                {today.functions.top.map((f, i) => (
                  <ListRow
                    key={f.name}
                    testID={`fn-${f.name}`}
                    first={i === 0}
                    rank={i + 1}
                    label={f.name}
                    value={formatCount(f.count)}
                    bar={today.functions!.top[0].count > 0 ? f.count / today.functions!.top[0].count : 0}
                  />
                ))}
              </View>
            ) : null}
          </View>
        </Card>
      ) : null}
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  errorBody: { gap: 10, padding: 18 },
  errorHead: { alignItems: 'center', gap: 10 },
  // Cards have no inner padding of their own: CardHead pads itself, so every body block must too.
  body: { paddingHorizontal: 18, paddingBottom: 18, gap: 16 },
  statusRow: { alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14 },
  quotaRow: { gap: 8 },
  quotaHead: { alignItems: 'center', gap: 8 },
  quotaVals: { alignItems: 'baseline', gap: 6 },
  quotaUsed: { fontSize: 20 },
  track: { height: 10, borderRadius: 5, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5 },
  miniGrid: { flexWrap: 'wrap', gap: 10 },
  mini: { flexBasis: '47%', flexGrow: 1, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 12, gap: 2, minWidth: 130 },
  miniValue: { fontSize: 22, letterSpacing: -0.4 },
  listBlock: { gap: 0 },
  listRow: { paddingVertical: 10, gap: 6 },
  listLine: { alignItems: 'center', gap: 10 },
  listValue: { flexShrink: 0 },
  rank: { width: 16, textAlign: 'center', fontSize: 12 },
  listTrack: { height: 3, borderRadius: 2, overflow: 'hidden' },
  listFill: { height: 3, borderRadius: 2 },
});
