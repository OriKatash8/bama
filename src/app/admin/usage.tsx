import { useEffect, useState } from 'react';
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

function StatRow({ label, value, testID }: { label: string; value: string; testID: string }) {
  const p = useAdminPalette();
  const { rowDir, textAlign } = useScopedT('admin_usage');
  return (
    <View style={[styles.statRow, { flexDirection: rowDir }]} testID={testID}>
      <AdminText style={[styles.grow, { color: p.text2, textAlign }]} numberOfLines={1}>{label}</AdminText>
      <AdminText weight="semiBold" tabular testID={`${testID}-value`}>{value}</AdminText>
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
        <View style={[styles.statusRow, { flexDirection: rowDir }]}>
          <View style={styles.grow}>
            <AdminText style={{ color: stale ? p.warn : p.text2, textAlign }} testID="usage-updated">
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
          {METRICS.map((m) => {
            const used = today.firestore![m];
            const quota = FIRESTORE_FREE_DAILY[m];
            const frac = quotaFraction(used, quota);
            const level = quotaLevel(frac);
            return (
              <View key={m} style={styles.quotaRow} testID={`quota-${m}`}>
                <View style={[styles.quotaHead, { flexDirection: rowDir }]}>
                  <AdminText weight="semiBold" style={{ textAlign }}>{t(m)}</AdminText>
                  <View style={[styles.quotaVals, { flexDirection: rowDir }]}>
                    <AdminText tabular style={{ color: levelColor[level] }} testID={`quota-${m}-value`}>{formatCount(used)}</AdminText>
                    <AdminText tabular style={{ color: p.text3 }} testID={`quota-${m}-of`}>{t('quota_of', { quota: formatCount(quota) })}</AdminText>
                  </View>
                </View>
                {/* row-reverse in RTL so the bar fills from the right */}
                <View testID={`quota-${m}-track`} style={[styles.track, { flexDirection: rowDir, backgroundColor: p.accentSoft }]}>
                  <View
                    testID={`quota-${m}-fill`}
                    style={[styles.fill, { width: `${Math.min(100, Math.round(frac * 100))}%`, backgroundColor: levelColor[level] }]}
                  />
                </View>
              </View>
            );
          })}
        </Card>
      ) : null}

      {month ? (
        <Card testID="usage-month">
          <CardHead title={t('month')} />
          {month.firestore ? METRICS.map((m) => (
            <StatRow key={m} testID={`month-${m}`} label={t(m)} value={formatCount(month.firestore![m])} />
          )) : null}
          {month.egressBytes != null ? <StatRow testID="month-egress" label={t('egress')} value={formatBytes(month.egressBytes)} /> : null}
          {month.functions ? <StatRow testID="month-invocations" label={t('invocations_month')} value={formatCount(month.functions.invocations)} /> : null}
        </Card>
      ) : null}

      {storage || today?.egressBytes != null ? (
        <Card testID="usage-storage">
          <CardHead title={t('storage')} />
          {storage?.appBucketBytes != null ? <StatRow testID="storage-app" label={t('storage_app')} value={formatBytes(storage.appBucketBytes)} /> : null}
          {storage ? <StatRow testID="storage-total" label={t('storage_total')} value={formatBytes(storage.totalBytes)} /> : null}
          {today?.egressBytes != null ? <StatRow testID="storage-egress" label={t('egress_today')} value={formatBytes(today.egressBytes)} /> : null}
          {storage && storage.buckets.length > 1 ? (
            <View style={styles.buckets}>
              <AdminText style={[TYPE.rowMeta, { color: p.text3, textAlign }]}>{t('other_buckets')}</AdminText>
              {storage.buckets.map((b) => (
                <StatRow key={b.name} testID={`bucket-${b.name}`} label={b.name} value={formatBytes(b.bytes)} />
              ))}
            </View>
          ) : null}
        </Card>
      ) : null}

      {today?.functions ? (
        <Card testID="usage-functions">
          <CardHead title={t('functions')} />
          <StatRow testID="fn-today" label={t('invocations_today')} value={formatCount(today.functions.invocations)} />
          {today.functions.top.length > 0 ? (
            <View style={styles.buckets}>
              <AdminText style={[TYPE.rowMeta, { color: p.text3, textAlign }]}>{t('top_functions')}</AdminText>
              {today.functions.top.map((f) => (
                <StatRow key={f.name} testID={`fn-${f.name}`} label={f.name} value={formatCount(f.count)} />
              ))}
            </View>
          ) : null}
        </Card>
      ) : null}
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  errorBody: { gap: 10 },
  errorHead: { alignItems: 'center', gap: 10 },
  statusRow: { alignItems: 'center', gap: 12 },
  quotaRow: { paddingVertical: 8, gap: 6 },
  quotaVals: { alignItems: 'center', gap: 6 },
  quotaHead: { justifyContent: 'space-between', alignItems: 'center' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  buckets: { marginTop: 8, gap: 2 },
  statRow: { alignItems: 'center', gap: 12, paddingVertical: 6 },
});
