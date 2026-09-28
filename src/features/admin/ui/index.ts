/** The admin pages' design kit: the community-owner dashboard's pieces plus the shared page frame. */
export { AdminPage, AdminHeaderBar, AdminTitle, AdminColumn, StatGrid, IconTile, NavRow, CardHead, useAdminPageInsets, type Tone } from './AdminPage';
export { useAdminPalette, useScopedT } from '@features/communityAdmin/i18n';
export { HEEBO, RADIUS, SPACE, TYPE, MOTION, TABULAR, cardShadow, liftShadow } from '@features/communityAdmin/theme';
export {
  AdminText,
  Card,
  Chip,
  CountBadge,
  EmptyState,
  InitialsAvatar,
  PillButton,
  Row,
  WhoBlock,
} from '@features/communityAdmin/components/primitives';
export { Segment } from '@features/communityAdmin/components/AdminHeader';
export { StatTile, Sparkline, CountUp } from '@features/communityAdmin/components/StatTiles';
export { ChartCard, Legend } from '@features/communityAdmin/components/ChartParts';
export { AdminToast, useAdminToast } from '@features/communityAdmin/components/AdminToast';
