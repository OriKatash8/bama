import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Redirect, Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@core/stores/authStore';
import { confirmDialog } from '@utils/confirmDialog';
import {
  approveAllJoinRequests,
  approveJoinRequest,
  rejectJoinRequest,
  removeCommunityMember,
} from '@features/chat/services/communityMembership';
import { flowSeries, latestJoinByUser, weeklyBuckets, type RangeDays } from './aggregate';
import { marketWeeks } from './chartGeometry';
import { tileStats } from './stats';
import { useAdminPalette, useAdminT } from './i18n';
import { useCommunity, useCommunityEvents, useJoinRequests, useMarketListings, useMemberStats, usePeople } from './hooks';
import { buildMemberRows, buildRequestRows, filterMembers } from './rows';
import { useVanishingList } from './useVanishingList';
import { SPACE, TWO_COL_MIN_WIDTH } from './theme';
import { AdminHeader, CONTENT_MAX, TitleBlock } from './components/AdminHeader';
import { AdminText } from './components/primitives';
import { RequestsCard, type RequestRowData } from './components/RequestsCard';
import { MembersCard, type MemberRowData } from './components/MembersCard';
import { AdminToast, useAdminToast } from './components/AdminToast';
import { StatTiles } from './components/StatTiles';
import { MemberFlowChart } from './components/MemberFlowChart';
import { MarketChart } from './components/MarketChart';

const detailsHref = (chatId: string) => `/(client)/chat/community-details?chatId=${chatId}`;

/**
 * The community owner's dashboard. Owner only: anyone else is sent back to
 * the community page, and no owner-only listener ever starts for them.
 */
export function CommunityAdminScreen({ chatId }: { chatId: string }) {
  const router = useRouter();
  const p = useAdminPalette();
  const { t, lang, rowDir } = useAdminT();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const uid = useAuthStore((s) => s.user?.id);
  const myName = useAuthStore((s) => s.user?.displayName) ?? '';
  const { community, loading } = useCommunity(chatId);
  const isOwner = !!community && !!uid && community.ownerId === uid;

  const [range, setRange] = useState<RangeDays>(30);
  const [query, setQuery] = useState('');
  const toast = useAdminToast();

  const requests = useJoinRequests(chatId, isOwner);
  const events = useCommunityEvents(chatId, isOwner);
  const counts = useMemberStats(chatId, isOwner);
  const listingDates = useMarketListings(chatId, isOwner);
  const members = useMemo(() => community?.members ?? [], [community?.members]);
  const people = usePeople(useMemo(() => [...members, ...requests.map((r) => r.userId)], [members, requests]));

  // One `now` per render so every "X ago" on screen agrees.
  const now = new Date();
  const requestRows = buildRequestRows(requests, people, t, lang, now);
  const memberRows = buildMemberRows(members, community?.ownerId ?? '', people, counts, latestJoinByUser(events), t, lang, now);
  const req = useVanishingList(requestRows, (r) => r.userId);
  const requestedAt = new Map(requests.map((r) => [r.userId, r.requestedAt]));
  const flow = flowSeries(events, range, now);
  const mem = useVanishingList(memberRows, (m) => m.userId);
  const shownMembers = filterMembers(
    mem.rows.map((r) => r.item),
    query,
  );
  const shownIds = new Set(shownMembers.map((m) => m.userId));

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: p.bg }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color={p.accent} />
      </View>
    );
  }
  if (!community) {
    return (
      <View style={[styles.center, { backgroundColor: p.bg }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <AdminText style={{ color: p.text2 }}>{t('not_found')}</AdminText>
      </View>
    );
  }
  if (!isOwner) return <Redirect href={detailsHref(chatId) as never} />;

  const pendingNotLeaving = req.rows.filter((r) => !r.leaving).length;

  // Every decision on a request asks first (confirmDialog: window.confirm on
  // web, where Alert.alert does nothing). The row only starts leaving once the
  // owner says yes; cancelling leaves everything as it was.
  async function approve(r: RequestRowData) {
    const sure = await confirmDialog(t('confirm_approve_title', { name: r.name }), t('confirm_approve_body', { name: r.name }), {
      confirm: t('approve'),
      cancel: t('cancel'),
      destructive: false,
    });
    if (!sure) return;
    req.start([r.userId]);
    try {
      const ok = await approveJoinRequest(chatId, r.userId);
      toast.show(t(ok ? 'toast_approved' : 'toast_already_handled', { name: r.name }));
    } catch (err) {
      console.error('[community-admin] approve failed:', err);
      req.revert([r.userId]);
      toast.show(t('toast_failed'));
    }
  }

  async function reject(r: RequestRowData) {
    const sure = await confirmDialog(t('confirm_reject_title', { name: r.name }), t('confirm_reject_body'), {
      confirm: t('reject'),
      cancel: t('cancel'),
      destructive: true,
    });
    if (!sure) return;
    req.start([r.userId]);
    try {
      await rejectJoinRequest(chatId, r.userId);
      toast.show(t('toast_rejected', { name: r.name }));
    } catch (err) {
      console.error('[community-admin] reject failed:', err);
      req.revert([r.userId]);
      toast.show(t('toast_failed'));
    }
  }

  async function approveAll() {
    const ids = req.rows.filter((r) => !r.leaving).map((r) => r.item.userId);
    if (ids.length === 0 || !community) return;
    const sure = await confirmDialog(t('confirm_all_title', { n: ids.length }), t('confirm_all_body', { n: ids.length }), {
      confirm: t('approve_all'),
      cancel: t('cancel'),
      destructive: false,
    });
    if (!sure) return;
    req.start(ids);
    try {
      await approveAllJoinRequests(chatId, ids, community.members);
      toast.show(t('toast_all_approved', { n: ids.length }));
    } catch (err) {
      console.error('[community-admin] approve all failed:', err);
      req.revert(ids);
      toast.show(t('toast_failed'));
    }
  }

  async function remove(m: MemberRowData) {
    if (!community) return;
    mem.start([m.userId]);
    try {
      await removeCommunityMember(chatId, m.userId, community.ownerId);
      toast.show(t('toast_removed', { name: m.name }));
    } catch (err) {
      console.error('[community-admin] remove failed:', err);
      mem.revert([m.userId]);
      toast.show(t('toast_failed'));
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: p.bg }]}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: true, fullScreenGestureEnabled: true }} />
      {/* The header is the top of the page and scrolls away with it — not pinned. */}
      <ScrollView contentContainerStyle={{ paddingBottom: 56 + insets.bottom }}>
        <View style={{ paddingTop: insets.top }}>
          <AdminHeader
            communityName={community.name}
            ownerName={myName}
            onBack={() => (router.canGoBack() ? router.back() : router.replace(detailsHref(chatId) as never))}
          />
        </View>
        <View style={styles.content}>
          <TitleBlock range={range} onRange={setRange} />
          <RequestsCard
            rows={req.rows}
            pendingCount={pendingNotLeaving}
            twoColumns={width >= TWO_COL_MIN_WIDTH}
            onApprove={approve}
            onReject={reject}
            onApproveAll={approveAll}
            onGone={req.finish}
          />
          <StatTiles
            width={width}
            range={range}
            now={now}
            stats={tileStats({
              memberCount: members.length,
              events,
              // Pending as the owner sees it: rows already collapsing away don't count.
              pendingSince: req.rows.filter((r) => !r.leaving).map((r) => requestedAt.get(r.item.userId) ?? null),
              listingDates,
              range,
              now,
            })}
          />
          <View style={[styles.charts, width >= TWO_COL_MIN_WIDTH && { flexDirection: rowDir }]}>
            <MemberFlowChart
              {...flow}
              range={range}
              style={width >= TWO_COL_MIN_WIDTH ? styles.flowWide : undefined}
            />
            <MarketChart
              weeks={weeklyBuckets(listingDates, marketWeeks(range), now)}
              range={range}
              style={width >= TWO_COL_MIN_WIDTH ? styles.marketWide : undefined}
            />
          </View>
          <MembersCard
            rows={mem.rows.filter((r) => shownIds.has(r.item.userId))}
            memberCount={members.length}
            query={query}
            onQuery={setQuery}
            onRemove={remove}
            onGone={mem.finish}
          />
        </View>
      </ScrollView>
      <AdminToast message={toast.message} nonce={toast.nonce} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: {
    width: '100%',
    maxWidth: CONTENT_MAX,
    alignSelf: 'center',
    paddingHorizontal: SPACE.gutter,
    gap: SPACE.cardGap,
  },
  charts: { gap: SPACE.cardGap },
  // Member flow ~1.55fr, market ~1fr, side by side from 900px.
  flowWide: { flex: 1.55, minWidth: 0 },
  marketWide: { flex: 1, minWidth: 0 },
});
