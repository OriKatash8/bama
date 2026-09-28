import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Flag } from 'lucide-react-native';
import { useRegistrationStats } from '@features/admin/useRegistrationStats';
import { signed } from '@features/communityAdmin/stats';
import { AdminPage, Card, CardHead, CountBadge, NavRow, Segment, StatGrid, StatTile, useScopedT } from '../ui';
import { useAdminCounts, type AdminCounts } from './counts';
import { RegistrationsChart, type RegPeriod, type RegView } from './components/RegistrationsChart';

/**
 * The platform admin's dashboard, in the community-owner dashboard's design:
 * title with the period control, the reports that need attention, the
 * platform totals as stat tiles, then new registrations.
 */
export default function AdminDashboardScreen() {
  const { t, rtl } = useScopedT('admin_dashboard');
  const router = useRouter();
  const [period, setPeriod] = useState<RegPeriod>('daily');
  const [view, setView] = useState<RegView>('total');
  const counts = useAdminCounts();
  const reg = useRegistrationStats(period, rtl);
  const newInPeriod = reg.total.reduce((a, b) => a + b, 0);
  const open = counts?.openReports ?? null;
  const waiting = (open ?? 0) > 0;

  // Every tile carries a footer line under its number, like the community dashboard's.
  const tiles: { key: keyof AdminCounts; label: string; chip?: { text: string; kind: 'good' | 'neutral' }; caption: string }[] = [
    {
      key: 'users',
      label: t('total_users'),
      chip: reg.loading ? undefined : { text: signed(newInPeriod), kind: newInPeriod > 0 ? 'good' : 'neutral' },
      caption: t(`sub_${period}`),
    },
    { key: 'projects', label: t('total_projects'), caption: t('all_time') },
    { key: 'courses', label: t('total_courses'), caption: t('all_time') },
    { key: 'communities', label: t('total_communities'), caption: t('all_time') },
  ];

  return (
    <AdminPage
      title={t('title')}
      subtitle={t('subtitle')}
      side={
        <Segment<RegPeriod>
          options={[
            { value: 'daily', label: t('daily') },
            { value: 'weekly', label: t('weekly') },
          ]}
          value={period}
          onChange={setPeriod}
          label={t('period_a11y')}
          testIDPrefix="period"
        />
      }
    >
      {/* Lifted with the amber ring while reports wait, like the join-requests card. */}
      <Card priority={waiting} testID="attention-card">
        <CardHead title={t('attention')} side={waiting ? <CountBadge n={open ?? 0} testID="reports-count" /> : undefined} />
        <NavRow
          testID="open-reports"
          icon={Flag}
          tone="bad"
          label={t('reports')}
          meta={t('reports_meta')}
          accessibilityLabel={t('reports_a11y', { n: open ?? 0 })}
          onPress={() => router.push('/admin/reports')}
        />
      </Card>

      <StatGrid>
        {tiles.map(({ key, label, chip, caption }) => (
          <StatTile
            key={key}
            testID={`tile-${key}`}
            label={label}
            value={counts ? counts[key] : null}
            loading={counts === null}
            chip={chip}
            caption={caption}
          />
        ))}
      </StatGrid>

      <RegistrationsChart
        labels={reg.labels}
        total={reg.total}
        client={reg.client}
        pro={reg.pro}
        loading={reg.loading}
        view={view}
        onView={setView}
        period={period}
      />
    </AdminPage>
  );
}
