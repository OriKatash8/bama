import { useRouter } from 'expo-router';
import { BookOpen, MessagesSquare, ShoppingBag, Percent, type LucideIcon } from 'lucide-react-native';
import { AdminPage, Card, CardHead, NavRow, useScopedT, type Tone } from '@features/admin/ui';

type OpsRoute = '/admin/courses' | '/admin/communities' | '/admin/marketplace' | '/admin/fees';

/**
 * Operations: the hub for content and marketplace pages, in the admin
 * dashboard's design — one card of tappable rows, each opening its page.
 */
export default function OperationsAdmin() {
  const router = useRouter();
  const { t } = useScopedT('admin_operations');
  const { t: tDash } = useScopedT('admin_dashboard');

  const items: { key: string; label: string; route: OpsRoute; icon: LucideIcon; tone: Tone }[] = [
    { key: 'courses', label: t('courses'), route: '/admin/courses', icon: BookOpen, tone: 'accent' },
    { key: 'communities', label: t('communities'), route: '/admin/communities', icon: MessagesSquare, tone: 'good' },
    { key: 'marketplace', label: t('marketplace'), route: '/admin/marketplace', icon: ShoppingBag, tone: 'warn' },
    // Outstanding platform fees and anything flagged for a human. The only route
    // in — fee records are readable by nobody but the pro who owes them, so there
    // is no other surface this could hang off.
    { key: 'fees', label: t('fees'), route: '/admin/fees', icon: Percent, tone: 'bad' },
  ];

  return (
    <AdminPage title={t('title')} subtitle={t('greeting')} testID="ops-page">
      <Card testID="ops-card">
        <CardHead title={tDash('manage')} />
        {items.map(({ key, label, route, icon, tone }) => (
          <NavRow key={key} testID={`ops-${key}`} icon={icon} tone={tone} label={label} onPress={() => router.push(route)} />
        ))}
      </Card>
    </AdminPage>
  );
}
