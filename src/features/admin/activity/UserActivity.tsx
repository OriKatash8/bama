import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AdminText, Card, EmptyState, PillButton } from '@features/communityAdmin/components/primitives';
import { Segment } from '@features/communityAdmin/components/AdminHeader';
import { CardHead } from '../ui/AdminPage';
import { useAdminPalette, useScopedT } from '@features/communityAdmin/i18n';
import { SPACE, TYPE } from '@features/communityAdmin/theme';
import {
  SECTION_ORDER, useActivitySection, useActivitySummary,
  type ActivitySection, type ActivitySummary, type ItemOf,
} from './activityApi';
import { CommunityRow, DisputeRow, FeeRow, ModerationRow, ProjectRow, ReviewRow, fmt } from './sections';

/** The number on each tab, from the one summary call. A dash while it loads or if it failed. */
function countOf(section: ActivitySection, s: ActivitySummary | null | 'error'): string {
  if (!s || s === 'error') return '–';
  switch (section) {
    case 'moderation': return String(s.moderation.actions + s.moderation.reportsReceived + s.moderation.reportsFiled);
    case 'projects': return String(s.projects.asClient + s.projects.asProfessional);
    case 'fees': return String(s.fees.records);
    case 'disputes': return String(s.disputes.open + s.disputes.resolved);
    case 'reviews': return String(s.reviews.received + s.reviews.given);
    case 'communities': return String(s.communities.member);
  }
}

const ROWS: { [K in ActivitySection]: (item: ItemOf[K]) => ReactNode } = {
  moderation: (i) => <ModerationRow key={i.id} item={i} />,
  projects: (i) => <ProjectRow key={i.projectId} item={i} />,
  fees: (i) => <FeeRow key={`${i.projectId}:${i.at}`} item={i} />,
  disputes: (i) => <DisputeRow key={`${i.projectId}:${i.pro.uid}`} item={i} />,
  reviews: (i) => <ReviewRow key={i.id} item={i} />,
  communities: (i) => <CommunityRow key={i.id} item={i} />,
};

/**
 * A person's activity, one lazily loaded section at a time (the admin's "history"): moderation actions
 * and reports, projects, fees and payments, disputes (with held reviews), reviews, communities. The tab
 * bar scrolls on a phone; every section has its own loading, error-with-retry and empty states, and a
 * "Load more" for the next 20. `refreshKey` reloads everything (after a warn/suspend from this screen).
 */
export function UserActivity({
  uid, initialSection = 'moderation', refreshKey = 0,
}: { uid: string; initialSection?: ActivitySection; refreshKey?: number }) {
  const { t } = useScopedT('admin_activity');
  const [section, setSection] = useState<ActivitySection>(initialSection);
  const summary = useActivitySummary(uid, true, refreshKey);
  const options = useMemo(
    () => SECTION_ORDER.map((s) => ({ value: s, label: `${t(`tab_${s}`)} (${countOf(s, summary)})` })),
    [t, summary],
  );
  return (
    <View style={styles.wrap} testID="user-activity">
      <Segment<ActivitySection> options={options} value={section} onChange={setSection} label={t('tabs_label')} testIDPrefix="activity-tab" scroll />
      <SectionCard key={`${uid}:${section}:${refreshKey}`} uid={uid} section={section} />
    </View>
  );
}

function SectionCard<K extends ActivitySection>({ uid, section }: { uid: string; section: K }) {
  const p = useAdminPalette();
  const { t, rtl, textAlign } = useScopedT('admin_activity');
  const s = useActivitySection(uid, section);
  const renderRow = ROWS[section] as (item: ItemOf[K]) => ReactNode;
  return (
    <Card testID={`activity-card-${section}`}>
      <CardHead title={t(`tab_${section}`)} />
      {section === 'fees' && s.summary ? <FeesSummary summary={s.summary} /> : null}
      {s.status === 'loading' ? (
        <View style={styles.busy}><ActivityIndicator size="small" color={p.accent} testID={`activity-loading-${section}`} /></View>
      ) : s.status === 'error' ? (
        <View style={[styles.error, { alignItems: rtl ? 'flex-end' : 'flex-start' }]} testID={`activity-error-${section}`}>
          <AdminText style={[TYPE.rowMeta, { color: p.bad, textAlign }]}>{t('load_failed')}</AdminText>
          <PillButton variant="primary" label={t('retry')} onPress={s.retry} testID={`activity-retry-${section}`} />
        </View>
      ) : s.items.length === 0 ? (
        <EmptyState text={section === 'fees' ? `${t('empty_fees')} ${t('fees_clients_note')}` : t(`empty_${section}`)} testID={`activity-empty-${section}`} />
      ) : (
        <>
          {s.items.map(renderRow)}
          {s.truncated && !s.nextCursor ? <AdminText style={[TYPE.rowMeta, styles.note, { color: p.text3, textAlign }]}>{t('truncated', { n: s.total })}</AdminText> : null}
          {s.nextCursor ? (
            <View style={styles.more}>
              {s.moreStatus === 'error' ? <AdminText style={[TYPE.rowMeta, { color: p.bad, textAlign }]}>{t('more_failed')}</AdminText> : null}
              <PillButton block label={s.moreStatus === 'loading' ? '…' : t('load_more')} onPress={s.loadMore} disabled={s.moreStatus === 'loading'} testID={`activity-more-${section}`} />
            </View>
          ) : null}
        </>
      )}
    </Card>
  );
}

function FeesSummary({ summary }: { summary: NonNullable<ReturnType<typeof useActivitySection>['summary']> }) {
  const p = useAdminPalette();
  const { t, textAlign } = useScopedT('admin_activity');
  const parts = [
    t('summary_owed', { n: summary.owed.toLocaleString() }), t('summary_open', { n: summary.open }), t('summary_paid', { n: summary.paid }),
    summary.blockedFrom ? t('summary_blocked', { date: fmt(summary.blockedFrom) }) : null,
  ].filter(Boolean).join(' · ');
  return <AdminText weight="semiBold" tabular testID="activity-fees-summary" style={[TYPE.rowMeta, styles.summary, { color: summary.blockedFrom ? p.bad : p.text2, textAlign }]}>{parts}</AdminText>;
}

const styles = StyleSheet.create({
  wrap: { gap: SPACE.cardGap },
  busy: { paddingVertical: 20, alignItems: 'center' },
  error: { padding: SPACE.cardPad, gap: 10 },
  more: { padding: SPACE.rowPadH, gap: 8 },
  note: { paddingHorizontal: SPACE.rowPadH, paddingVertical: 8 },
  summary: { paddingHorizontal: SPACE.rowPadH, paddingBottom: 10 },
});
