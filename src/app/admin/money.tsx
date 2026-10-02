import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Ban, Banknote, ChevronLeft, ChevronRight, Info } from 'lucide-react-native';
import { MoneyFlowChart } from '@components/charts/MoneyFlowChart';
import { useCancellationLog } from '@features/admin/useCancellationLog';
import { periodBuckets, type Period } from '@features/admin/periodBuckets';
import { useLargeEngagements, type LargeEngagement, type LargeFeeState } from '@features/admin/useLargeEngagements';
import {
  AdminPage,
  AdminText,
  Card,
  CardHead,
  ChartCard,
  Chip,
  CountBadge,
  EmptyState,
  IconTile,
  Legend,
  PillButton,
  RADIUS,
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

  const router = useRouter();
  const [period, setPeriod] = useState<Period>('daily');
  const { entries: cancellations } = useCancellationLog();
  const large = useLargeEngagements();

  const locale = rtl ? 'he-IL' : 'en-US';
  const Chevron = rtl ? ChevronLeft : ChevronRight;
  const fmtDate = (ts: number) =>
    ts ? new Date(ts * 1000).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' }) : '';

  // Buckets oldest → newest, the same scales as the dashboard's registrations
  // chart. No data source yet → all zeros (scaffold).
  const { labels } = periodBuckets(period, new Date(), locale);

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
              { value: 'monthly', label: t('monthly') },
              { value: 'yearly', label: t('yearly') },
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

      {/* Large projects: a professional's own amount above ₪5,000 — big fees to follow to payment */}
      <Card testID="large-card">
        <CardHead
          title={t('large_title')}
          sub={t('large_sub', { amount: shekels(large.above) })}
          side={large.rows.length > 0 ? <CountBadge n={large.rows.length} testID="large-count" /> : undefined}
        />
        {large.loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={p.accent} testID="large-loading" />
          </View>
        ) : large.failed ? (
          <View style={[styles.failed, { flexDirection: rowDir }]}>
            <AdminText style={[TYPE.rowMeta, styles.failedText, { color: p.text2, textAlign }]}>{t('large_failed')}</AdminText>
            <PillButton variant="primary" label={t('retry')} onPress={() => void large.reload()} testID="large-retry" />
          </View>
        ) : large.rows.length === 0 ? (
          <EmptyState text={t('no_large', { amount: shekels(large.above) })} testID="large-empty" />
        ) : (
          large.rows.map((r) => <LargeRow key={`${r.projectId}-${r.professionalId}`} row={r} />)
        )}
      </Card>

      {/* Cancellation log — projects (live) + purchases (audit) */}
      <Card testID="cancellations-card">
        <CardHead
          title={t('cancellations')}
          side={cancellations.length > 0 ? <Chip label={String(cancellations.length)} tabular /> : undefined}
        />
        {cancellations.length === 0 ? (
          <EmptyState text={t('no_cancellations')} testID="cancellations-empty" />
        ) : (
          cancellations.map((c) => {
            // A cancelled project opens its chat, to see why it was cancelled.
            const chatId = c.kind === 'project' ? c.chatId : null;
            return (
              <Row
                key={c.id}
                rowDir={rowDir}
                testID={`cancellation-${c.id}`}
                onPress={chatId ? () => router.push(`/admin/project-chat?chatId=${chatId}&projectId=${c.projectId}` as never) : undefined}
                accessibilityLabel={chatId ? `${t(`type_${c.kind}`)} · ${c.title || '—'}` : undefined}
              >
                <IconTile icon={Ban} tone="neutral" />
                <WhoBlock
                  name={`${t(`type_${c.kind}`)} · ${c.title || '—'}`}
                  meta={`${t('cancelled_by')} ${c.actorName || '—'}`}
                  textAlign={textAlign}
                />
                <AdminText tabular numberOfLines={1} style={[TYPE.rowMeta, { color: p.text3 }]}>
                  {fmtDate(c.ts)}
                </AdminText>
                {chatId ? <Chevron size={18} color={p.text3} strokeWidth={2} /> : null}
              </Row>
            );
          })
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

const STATE_TONE: Record<LargeFeeState, 'warn' | 'good' | 'bad' | 'neutral'> = {
  pending: 'warn',
  paid: 'good',
  disputed: 'bad',
  not_owed: 'neutral',
  exempt: 'neutral',
};

/** One large engagement: project · professional, the amount and the fee, where the fee stands. Opens the project chat. */
function LargeRow({ row }: { row: LargeEngagement }) {
  const p = useAdminPalette();
  const router = useRouter();
  const { t, rtl, rowDir, textAlign } = useScopedT('admin_money');
  const Chevron = rtl ? ChevronLeft : ChevronRight;
  const tone = STATE_TONE[row.feeState];
  const [bg, fg] = {
    warn: [p.warnBg, p.warn],
    good: [p.goodBg, p.good],
    bad: [p.badBg, p.bad],
    neutral: [p.surface3, p.text2],
  }[tone];
  const stateLabel =
    row.feeState === 'pending' ? t('state_pending', { amount: shekels(row.outstanding) }) : t(`state_${row.feeState}`);
  const meta = [
    row.proName || '—',
    shekels(row.baseAmount),
    row.fee > 0 ? t('fee_of', { amount: shekels(row.fee) }) : null,
    t(row.active ? 'in_progress' : 'finished'),
  ].filter(Boolean).join(' · ');
  const open = row.chatId
    ? () => router.push(`/admin/project-chat?chatId=${row.chatId}&projectId=${row.projectId}` as never)
    : undefined;
  return (
    <Row
      rowDir={rowDir}
      testID={`large-${row.projectId}-${row.professionalId}`}
      onPress={open}
      accessibilityLabel={open ? `${row.title || '—'} · ${meta}` : undefined}
    >
      <IconTile icon={Banknote} tone={tone} />
      <WhoBlock name={row.title || '—'} meta={meta} textAlign={textAlign} />
      <View style={[styles.stateChip, { backgroundColor: bg }]} testID={`large-state-${row.projectId}-${row.professionalId}`}>
        <AdminText weight="semiBold" tabular numberOfLines={1} style={[TYPE.chip, { color: fg }]}>
          {stateLabel}
        </AdminText>
      </View>
      {open ? <Chevron size={18} color={p.text3} strokeWidth={2} /> : null}
    </Row>
  );
}

const styles = StyleSheet.create({
  plot: { paddingHorizontal: SPACE.rowPadH, paddingTop: 10, paddingBottom: 16 },
  loading: { paddingVertical: 22, alignItems: 'center' },
  failed: { alignItems: 'center', gap: 10, paddingHorizontal: SPACE.rowPadH, paddingBottom: 16 },
  failedText: { flex: 1 },
  stateChip: { borderRadius: RADIUS.pill, paddingVertical: 3, paddingHorizontal: 9, flexShrink: 0 },
  note: { alignItems: 'flex-start', gap: 12, padding: SPACE.cardPad },
  noteText: { flex: 1, minWidth: 0, gap: 2 },
  noteBody: { fontSize: 13, lineHeight: 20 },
});
