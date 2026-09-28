import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ban, Info } from 'lucide-react-native';
import { MoneyFlowChart } from '@components/charts/MoneyFlowChart';
import { useCancellationLog } from '@features/admin/useCancellationLog';
import {
  AdminPage,
  AdminText,
  Card,
  CardHead,
  ChartCard,
  Chip,
  EmptyState,
  IconTile,
  Legend,
  Row,
  SPACE,
  Segment,
  StatGrid,
  StatTile,
  TYPE,
  WhoBlock,
  useAdminPalette,
  useScopedT,
} from '@features/admin/ui';

type Period = 'daily' | 'weekly';

const shekels = (n: number) => `₪${n.toLocaleString('en-US')}`;

/**
 * Money — scaffold for future financial reporting. There is no payments data
 * source yet, so every figure is a hardcoded 0 placeholder. When payments are
 * wired up, replace the `value` fields with real queries.
 */
export default function MoneyAdmin() {
  const p = useAdminPalette();
  const { t, rtl, rowDir, textAlign } = useScopedT('admin_money');
  const { t: tDash } = useScopedT('admin_dashboard');

  const [period, setPeriod] = useState<Period>('daily');
  const { entries: cancellations } = useCancellationLog();

  const locale = rtl ? 'he-IL' : 'en-US';
  const fmtDate = (ts: number) =>
    ts ? new Date(ts * 1000).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' }) : '';

  // Buckets oldest → newest. No data source yet → all zeros (scaffold).
  // Daily = last 7 days (weekday labels); Weekly = last 6 weeks (week-start dates).
  const labels = period === 'daily'
    ? Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return d.toLocaleDateString(locale, { weekday: 'short' });
      })
    : Array.from({ length: 6 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (5 - i) * 7);
        return d.toLocaleDateString(locale, { day: 'numeric', month: 'numeric' });
      });

  // Every tile carries a footer line, like the dashboard's.
  const metrics: { key: string; label: string; value: number; format?: (n: number) => string; caption?: string }[] = [
    { key: 'revenue', label: t('total_revenue'), value: 0, format: shekels },
    { key: 'fees', label: t('platform_fees'), value: 0, format: shekels },
    { key: 'payouts', label: t('pending_payouts'), value: 0, format: shekels, caption: t('pending_now') },
    { key: 'transactions', label: t('transactions'), value: 0 },
  ];

  // Revenue sources. Marketplace/projects have fee backing today;
  // courses/subscriptions are future streams → all ₪0 for now.
  const sources = [
    { key: 'src_marketplace', color: p.series1 },
    { key: 'src_projects', color: p.series2 },
    { key: 'src_courses', color: p.series3 },
    { key: 'src_subscriptions', color: p.warn },
    { key: 'src_other', color: p.text3 },
  ];
  const series = sources.map((s) => ({ color: s.color, data: labels.map(() => 0) }));

  return (
    <AdminPage title={t('title')} subtitle={t('greeting')} testID="money-page">
      <StatGrid>
        {metrics.map(({ key, label, value, format, caption }) => (
          <StatTile key={key} testID={`tile-${key}`} label={label} value={value} format={format} caption={caption ?? tDash('all_time')} />
        ))}
      </StatGrid>

      {/* Money-flow graph — scaffold, currently flat at zero */}
      <ChartCard
        testID="money-flow"
        title={t('flow_heading')}
        sub={t('by_source')}
        side={
          <Segment<Period>
            options={[
              { value: 'daily', label: t('daily') },
              { value: 'weekly', label: t('weekly') },
            ]}
            value={period}
            onChange={setPeriod}
            label={tDash('period_a11y')}
            testIDPrefix="period"
          />
        }
      >
        <Legend items={sources.map((s) => ({ color: s.color, label: `${t(s.key)} ${shekels(0)}` }))} />
        <View style={styles.plot}>
          <MoneyFlowChart series={series} labels={labels} gridColor={p.gridLine} labelColor={p.text3} />
        </View>
      </ChartCard>

      {/* Cancellation log — projects (live) + purchases (audit) */}
      <Card testID="cancellations-card">
        <CardHead
          title={t('cancellations')}
          side={cancellations.length > 0 ? <Chip label={String(cancellations.length)} tabular /> : undefined}
        />
        {cancellations.length === 0 ? (
          <EmptyState text={t('no_cancellations')} testID="cancellations-empty" />
        ) : (
          cancellations.map((c) => (
            <Row key={c.id} rowDir={rowDir} testID={`cancellation-${c.id}`}>
              <IconTile icon={Ban} tone="neutral" />
              <WhoBlock
                name={`${t(`type_${c.kind}`)} · ${c.title || '—'}`}
                meta={`${t('cancelled_by')} ${c.actorName || '—'}`}
                textAlign={textAlign}
              />
              <AdminText tabular numberOfLines={1} style={[TYPE.rowMeta, { color: p.text3 }]}>
                {fmtDate(c.ts)}
              </AdminText>
            </Row>
          ))
        )}
      </Card>

      {/* Placeholder note — no payments data source yet */}
      <Card testID="coming-soon">
        <View style={[styles.note, { flexDirection: rowDir }]}>
          <IconTile icon={Info} tone="neutral" />
          <View style={styles.noteText}>
            <AdminText weight="semiBold" style={[TYPE.cardTitle, { textAlign }]}>
              {t('coming_soon_title')}
            </AdminText>
            <AdminText style={[styles.noteBody, { color: p.text2, textAlign }]}>{t('coming_soon_body')}</AdminText>
          </View>
        </View>
      </Card>
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  plot: { paddingHorizontal: SPACE.rowPadH, paddingTop: 10, paddingBottom: 16 },
  note: { alignItems: 'flex-start', gap: 12, padding: SPACE.cardPad },
  noteText: { flex: 1, minWidth: 0, gap: 2 },
  noteBody: { fontSize: 13, lineHeight: 20 },
});
