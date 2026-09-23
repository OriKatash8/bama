import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { TouchableOpacity, Pressable, View, Text, StyleSheet, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { getDoc, doc } from 'firebase/firestore';
import { useRouter, useSegments, useFocusEffect } from 'expo-router';
import { CLIENT_TAB_ACTIVE, PRO_TAB_ACTIVE } from '@core/navigation/floatingTabBar';
import { Users, Package, Trash2 } from 'lucide-react-native';
import { AppText } from '@components/ui/AppText';
import { useAuthStore } from '@core/stores/authStore';
import { auth, db } from '@core/firebase/config';
import { removeMemberFromGroup } from '../services/chatService';
import { confirmDialog } from '@utils/confirmDialog';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import type { Chat } from '../types';
import type { ProjectRequest, ProjectFee } from '@core/types/project';
import type { MarketplaceListingType } from '@features/marketplace/types';
import { listenToMyFees } from '@features/pricing/services/feesService';
import { owesFee } from '@features/pricing/utils/fee';
import { engagementStanding, feePaidEarly } from '@features/pricing/utils/balance';
import { useNotifPermissionPrompt } from '@features/notifications/hooks/useNotifPermissionPrompt';
import { NotifPermissionBanner } from '@features/notifications/components/NotifPermissionBanner';

type ProjectStatus = ProjectRequest['status'];
type ProjectRoleInfo = {
  status: ProjectStatus;
  clientId: string;
  professionalIds: string[];
  /**
   * Whether the client has finished reviewing this project.
   *
   * `undefined` means NOTHING OUTSTANDING, not "not yet done": projects completed
   * before the field existed never had it written. ReviewFlowGate makes the same
   * call with a strict `=== false`, and the two must agree or the chat list would
   * ask for a review the gate refuses to open.
   */
  reviewsCompleted?: boolean;
};
type Translations = typeof en;

function makeT(translations: Translations) {
  return (key: string, vars?: Record<string, string>): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    let str = typeof result === 'string' ? result : key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replace(`{{${k}}}`, v);
      }
    }
    return str;
  };
}

// ── Colour rule for this screen ───────────────────────────────────────────────
// GREEN means project state. The mode accent (purple client / blue pro) means an action, or something the user did.
// They are not two ends of one scale and must not be swapped for each other:
// green here belongs to the same family as the cancelled and in_progress badges,
// so flattening it to the accent would make a completed project read like an open one.
// The paid pill is violet, and is outlined rather than filled so it cannot be
// mistaken for another status badge. See `paidPill` in the stylesheet.

/** Completed-line text: black, like the rest of the row's text. */
const COMPLETED_LINE_COLOR = '#000000';

// Row palette: black text, blue buttons; tags keep their own colours. Local on purpose: useTheme reaches the whole app.
const VIOLET = '#6D28D9';
/** Buttons (and their outlines and icons). */

/** Text. */
const INK = '#000000';
/** The fallback avatar's tile: a light wash of the mode colour, so the tile
 *  matches the accent-coloured icon it holds. */
const AVATAR_TINT = { client: '#EDE4FB', pro: '#E3EBFB' } as const;

/** The viewer's role on a project row. Deliberately neither green (project
 *  state) nor red (cancelled) — a role is not a point on the status scale.
 *  Text colours are the mode colours from AppHeader's mode badge; each
 *  background is a light tint of the same colour. */
type ProjectRole = 'client' | 'creator';
const ROLE_CONFIG: Record<ProjectRole, { bg: string; text: string }> = {
  client:  { bg: '#F3EEFE', text: CLIENT_TAB_ACTIVE }, // purple, like client mode
  creator: { bg: '#E6EDFC', text: PRO_TAB_ACTIVE },    // blue, like pro mode
};
/** A completed project's badge replaces the role — green, because it is state.
 *  The shop's completed badge uses the same pair. */
const COMPLETED_BADGE = { bg: '#E9F5EC', text: '#2F7A45' };
const CANCELLED_BADGE = { bg: '#FDECEC', text: '#B4232A' };

function formatTimestamp(ts: { toDate(): Date } | null | undefined, language: string): string {
  if (!ts) return '';
  const date = ts.toDate();
  const now = new Date();
  const locale = language === 'he' ? 'he-IL' : 'en-US';
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  if (isToday) {
    return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  }
  const daysDiff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (daysDiff < 7) {
    return date.toLocaleDateString(locale, { weekday: 'short' });
  }
  return date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
}

type DmInfo = { name: string; photoURL: string | null };

/**
 * Chat-list filters.
 *
 * 'marketplace' is every purchase chat. Rental and sale are NOT separable at the
 * chat level — `Chat.type` is just 'purchase' — so splitting them would need
 * `purchaseTypes`, which this screen now carries. One chip until that is asked for.
 */
type ChatFilter = 'all' | 'open' | 'completed' | 'marketplace';
const CHAT_FILTERS: ChatFilter[] = ['all', 'open', 'completed', 'marketplace'];
/** Row padding 20 + avatar 44: separators start where the avatar ends. */
const SEPARATOR_INSET = 64;
/** The row's own padding, so the line stops level with the badge column's edge. */
const SEPARATOR_END_INSET = 20;

export function ChatsScreen({
  scrollable = true,
  searchQuery = '',
  chats = [],
  onClearSearch,
}: {
  scrollable?: boolean;
  searchQuery?: string;
  chats?: Chat[];
  onClearSearch?: () => void;
}) {
  const router = useRouter();
  const segments = useSegments();
  const modeSegment = segments[0];
  // Buttons, the unread badge and avatar icons follow the mode, like the tab
  // bar: purple in client mode, blue in pro mode.
  const accent = modeSegment === '(client)' ? CLIENT_TAB_ACTIVE : PRO_TAB_ACTIVE;
  const avatarTint = modeSegment === '(client)' ? AVATAR_TINT.client : AVATAR_TINT.pro;
  const font = useAppFont();
  const user = useAuthStore((s) => s.user);
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const rowDir = rtl ? 'row-reverse' : 'row' as const;
  const [dmInfo, setDmInfo] = useState<Record<string, DmInfo>>({});
  // Status AND the viewer's role on each project. The role must come from the
  // PROJECT, not from activeMode: mode picks which tab you are in, it does not
  // decide who you are on a given project. A client who switches to
  // professional mode is still the client of their own project.
  const [projectInfo, setProjectInfo] = useState<Record<string, ProjectRoleInfo>>({});
  const [feesByProject, setFeesByProject] = useState<Map<string, ProjectFee>>(new Map());
  const [purchaseNames, setPurchaseNames] = useState<Record<string, string>>({});
  const [purchaseImages, setPurchaseImages] = useState<Record<string, string>>({});
  /** Purchase chat id -> whether its listing was a sale or a rental. */
  const [purchaseTypes, setPurchaseTypes] = useState<Record<string, MarketplaceListingType>>({});
  const fetchedUserIdsRef = useRef<Set<string>>(new Set());
  const fetchedChatProjectIdsRef = useRef<Set<string>>(new Set());
  const fetchedPurchaseChatIdsRef = useRef<Set<string>>(new Set());
  const [chatFilter, setChatFilter] = useState<ChatFilter>('all');
  const notifPrompt = useNotifPermissionPrompt();
  /** Bumped on focus to re-run the project fetch after its cache is invalidated. */
  const [refreshTick, setRefreshTick] = useState(0);
  /** Latest projectInfo, readable from a stable-identity focus callback. */
  const projectInfoRef = useRef<Record<string, ProjectRoleInfo>>({});
  useEffect(() => { projectInfoRef.current = projectInfo; }, [projectInfo]);

  useEffect(() => {
    if (!user) return;
    const currentUserId = user.id;
    const toFetch = chats.filter((c) => {
      if (c.type !== 'dm') return false;
      const otherId = c.members.find((id) => id !== currentUserId);
      return otherId !== undefined && !fetchedUserIdsRef.current.has(otherId);
    });
    if (toFetch.length === 0) return;
    toFetch.forEach((c) => {
      const otherId = c.members.find((id) => id !== currentUserId)!;
      fetchedUserIdsRef.current.add(otherId);
    });
    const tEffect = makeT(useSettingsStore.getState().language === 'he' ? he : en);
    Promise.all(
      toFetch.map(async (c) => {
        const otherId = c.members.find((id) => id !== currentUserId)!;
        const snap = await getDoc(doc(db, 'users', otherId));
        const data = snap.exists() ? (snap.data() as { displayName: string; photoURL?: string }) : null;
        return [c.id, { name: data?.displayName ?? tEffect('chats.unknown'), photoURL: data?.photoURL ?? null }] as const;
      })
    ).then((entries) => {
      setDmInfo((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    });
  }, [chats, user]);

  // This user's own fees across every project, keyed by projectId.
  //
  // A LISTENER, not a fetch: this screen is a mounted tab, so pushing the payment
  // screen and popping back never remounts it — a fetch-on-mount would leave the
  // row reading "unpaid" immediately after they paid.
  //
  // NOT gated on mode. A project where you are the professional still appears in
  // your list while you browse as a client, and without the fee its row would
  // tell somebody who owes that they are settled. The query is scoped to this
  // user's own fee documents either way.
  useEffect(() => {
    if (!user?.id) { setFeesByProject(new Map()); return; }
    return listenToMyFees(user.id, setFeesByProject);
  }, [user?.id]);

  useEffect(() => {
    const toFetch = chats.filter(
      (c) => c.type === 'group' && c.projectId != null && !fetchedChatProjectIdsRef.current.has(c.id),
    );
    if (toFetch.length === 0) return;
    toFetch.forEach((c) => fetchedChatProjectIdsRef.current.add(c.id));
    Promise.all(
      toFetch.map(async (c): Promise<readonly [string, ProjectRoleInfo] | null> => {
        const snap = await getDoc(doc(db, 'projects', c.projectId!));
        if (!snap.exists()) return null;
        // The whole document is already read — Pick<> narrowed the type, it did
        // not project fields — so carrying clientId and professionalIds costs
        // nothing extra.
        const d = snap.data() as Pick<ProjectRequest, 'status' | 'clientId' | 'professionalIds' | 'reviewsCompleted'>;
        return [c.id, {
          status: d.status,
          clientId: d.clientId,
          professionalIds: d.professionalIds ?? [],
          reviewsCompleted: d.reviewsCompleted,
        }] as const;
      }),
    ).then((entries) => {
      const valid = entries.filter((e): e is readonly [string, ProjectRoleInfo] => e !== null);
      if (valid.length > 0) setProjectInfo((prev) => ({ ...prev, ...Object.fromEntries(valid) }));
    });
  }, [chats, refreshTick]);

  // The fetch above caches per chat id and never refetches, and this is a mounted
  // tab — so leaving to write a review and coming back would not update the row.
  // On focus, forget the completed projects so the effect re-reads them; the tick
  // is what actually re-triggers it, since `chats` is unchanged.
  // Deps MUST stay empty: useFocusEffect re-runs whenever the callback identity
  // changes, and the refetch this schedules sets projectInfo — depending on it
  // would re-arm the effect and spin. The snapshot comes through a ref instead.
  useFocusEffect(
    useCallback(() => {
      let dropped = false;
      for (const [chatId, info] of Object.entries(projectInfoRef.current)) {
        if (info.status === 'completed') {
          fetchedChatProjectIdsRef.current.delete(chatId);
          dropped = true;
        }
      }
      if (dropped) setRefreshTick((n) => n + 1);
    }, []),
  );

  useEffect(() => {
    // Fetch each purchase chat's listing once to get its product name (fallback)
    // and product image (shown as the chat avatar when available).
    const toFetch = chats.filter(
      (c) => c.type === 'purchase' && c.purchaseListingId != null && !fetchedPurchaseChatIdsRef.current.has(c.id),
    );
    if (toFetch.length === 0) return;
    toFetch.forEach((c) => fetchedPurchaseChatIdsRef.current.add(c.id));
    Promise.all(
      toFetch.map(async (c) => {
        try {
          const snap = await getDoc(doc(db, 'marketplace_listings', c.purchaseListingId!));
          if (!snap.exists()) return null;
          // The whole document is already read, so carrying `type` costs nothing.
          // Rental vs sale is NOT on the chat — `purchase` is one chat type — so
          // the listing is the only place that distinction exists.
          const data = snap.data() as {
            productName?: string;
            imageUrl?: string | null;
            type?: MarketplaceListingType;
          };
          return [c.id, data.productName ?? null, data.imageUrl ?? null, data.type ?? null] as const;
        } catch (err) {
          // A denial here renders as a nameless, imageless purchase row — a
          // legitimate-looking state. Log the cause rather than lose it.
          console.error('[chats] failed to read listing for purchase chat', c.id, err);
          return null;
        }
      }),
    ).then((entries) => {
      const valid = entries.filter(
        (e): e is readonly [string, string | null, string | null, MarketplaceListingType | null] => e !== null,
      );
      const names = valid.filter((e) => e[1]).map((e) => [e[0], e[1] as string] as const);
      const images = valid.filter((e) => e[2]).map((e) => [e[0], e[2] as string] as const);
      const types = valid.filter((e) => e[3]).map((e) => [e[0], e[3] as MarketplaceListingType] as const);
      if (names.length > 0) setPurchaseNames((prev) => ({ ...prev, ...Object.fromEntries(names) }));
      if (images.length > 0) setPurchaseImages((prev) => ({ ...prev, ...Object.fromEntries(images) }));
      if (types.length > 0) setPurchaseTypes((prev) => ({ ...prev, ...Object.fromEntries(types) }));
    });
  }, [chats]);

  async function handleLeaveChat(chatId: string) {
    const confirmed = await confirmDialog(
      rtl ? 'הסרת צ׳אט' : 'Remove chat',
      rtl ? 'האם להסיר צ׳אט זה מהרשימה שלך?' : 'Remove this chat from your list?',
    );
    if (!confirmed || !user) return;
    await removeMemberFromGroup(chatId, user.id);
  }

  function renderAvatar(item: Chat) {
    if (item.type === 'purchase') {
      const productImage = purchaseImages[item.id];
      if (productImage) {
        return <Image source={{ uri: productImage }} style={styles.avatar} contentFit="cover" cachePolicy="memory-disk" />;
      }
      return (
        <View style={[styles.avatar, { backgroundColor: item.archived ? '#e5e7eb' : '#fff7ed' }]}>
          <Package size={21} color={item.archived ? '#9ca3af' : '#f59e0b'} strokeWidth={1.8} />
        </View>
      );
    }
    if (item.type === 'community') {
      return (
        <View style={[styles.avatar, { backgroundColor: avatarTint }]}>
          <Users size={21} color={accent} strokeWidth={1.8} />
        </View>
      );
    }
    if (item.type === 'group') {
      if (item.photoURL) {
        return <Image source={{ uri: item.photoURL }} style={styles.avatar} contentFit="cover" cachePolicy="memory-disk" />;
      }
      return (
        <View style={[styles.avatar, { backgroundColor: avatarTint }]}>
          <Users size={21} color={accent} strokeWidth={1.8} />
        </View>
      );
    }
    const info = dmInfo[item.id];
    if (info?.photoURL) {
      return <Image source={{ uri: info.photoURL }} style={styles.avatar} contentFit="cover" cachePolicy="memory-disk" />;
    }
    const initial = info?.name?.charAt(0).toUpperCase() ?? '?';
    return (
      <View style={[styles.avatar, { backgroundColor: avatarTint }]}>
        <AppText weight="bold" style={[styles.avatarInitial, { color: accent }]}>{initial}</AppText>
      </View>
    );
  }

  // The parent owns the loading + "no chats at all" states; this component only
  // renders once there is at least one chat.
  if (chats.length === 0) return null;

  const sortedChats = [...chats]
    // Communities live in their own tab — keep them out of the chats list.
    .filter((c) => c.type !== 'community')
    .sort((a, b) => {
      const aDown = a.type === 'purchase' && !!a.archived;
      const bDown = b.type === 'purchase' && !!b.archived;
      if (aDown && !bDown) return 1;
      if (!aDown && bDown) return -1;
      return 0;
    });

  /**
   * Completion comes from the same two signals the row uses: the live chat doc's
   * readOnlyReason, and the cached project status as a fallback.
   */
  function isChatCompleted(c: Chat): boolean {
    const info = projectInfo[c.id];
    return c.type === 'group'
      && ((c.readOnly === true && c.readOnlyReason === 'completed') || info?.status === 'completed');
  }

  const filteredChats = sortedChats.filter((c) => {
    switch (chatFilter) {
      case 'open':
        // Live project work: a project chat that is neither finished nor called off.
        return c.type === 'group'
          && !isChatCompleted(c)
          && projectInfo[c.id]?.status !== 'cancelled';
      case 'completed':
        return isChatCompleted(c);
      case 'marketplace':
        return c.type === 'purchase';
      default:
        return true;
    }
  });

  const visibleChats = searchQuery.trim()
    ? filteredChats.filter((item) => {
        const name =
          item.type === 'community' ? (item.name ?? 'Community')
          : item.type === 'group' ? (item.name ?? t('chats.group_chat'))
          : item.type === 'purchase' ? (item.name || purchaseNames[item.id] || t('chats.purchase_chat'))
          : (dmInfo[item.id]?.name ?? '');
        return name.toLowerCase().includes(searchQuery.toLowerCase());
      })
    : filteredChats;

  const cards = visibleChats.map((item, index) => {
    const currentUserId = user?.id ?? '';
    const chatName = item.type === 'community'
      ? (item.name ?? 'Community')
      : item.type === 'group'
      ? (item.name ?? t('chats.group_chat'))
      : item.type === 'purchase'
      ? (() => {
          const pName = item.name || purchaseNames[item.id];
          if (!pName) return t('chats.purchase_chat');
          // Title distinguishes buyers: "Product - BuyerName". Legacy chats
          // without buyerName fall back to the old "Purchase" suffix.
          return item.buyerName
            ? `${pName} - ${item.buyerName}`
            : (rtl ? `קנייה - ${pName}` : `${pName} - ${t('chats.purchase_suffix')}`);
        })()
      : (dmInfo[item.id]?.name ?? t('chats.loading'));
    const info = item.type === 'group' ? projectInfo[item.id] : undefined;
    const status = info?.status;
    const timestamp = formatTimestamp(item.lastMessage?.timestamp, language);
    const unread = item.unreadCount?.[currentUserId] ?? 0;

    // Completion comes from the CHAT document, which is live-subscribed, rather
    // than the project fetch above — that is cached per chat id and never
    // refetched, so a project completing while this list is mounted would never
    // show. `status` is the fallback for chats completed before the server
    // started stamping readOnlyReason.
    const isCompletedProject =
      item.type === 'group' &&
      ((item.readOnly === true && item.readOnlyReason === 'completed') || status === 'completed');

    // ── Role on THIS project, not the current mode ──────────────────────────
    // Mode picks which tab you are in; it must not decide who you are on a given
    // project. Rendering the professional variant to a client — telling them to
    // pay a fee on their own project — is what mode-based branching produced.
    //
    // Self-hire (clientId also in professionalIds) is reachable and exists in
    // production: the CLIENT variant wins. No money moved between parties in
    // that case, so there is no fee to charge and nothing to settle.
    const viewerIsClient = !!info && info.clientId === currentUserId;
    const viewerIsPro = !!info && !viewerIsClient && info.professionalIds.includes(currentUserId);

    // This user's own fee on this project. Absent = exempt = nothing owed.
    const myFee = viewerIsPro && item.projectId ? feesByProject.get(item.projectId) : undefined;
    // Where MY part stands — asked of my own engagement, not of the project.
    // `isCompletedProject` is a roll-up over everyone, and a contest reopens the
    // project, so keying the professional's copy on it made the row change
    // character the moment they raised an issue.
    //
    // The project is consulted ONLY when there is no engagement record at all
    // ('unknown' — exempt, or a row predating engagements), because then it is
    // the only signal there is.
    const standing = engagementStanding(myFee ?? null);
    const myPartFinished = standing === 'unknown' ? isCompletedProject : standing === 'finished';

    // DISPLAY ONLY. This picks which sentence the row shows; it must never decide
    // what the row can DO. See the branch further down that used to drop the
    // trash button when this was true.
    const iOweOnThisProject = viewerIsPro && myPartFinished && owesFee(myFee ?? null);

    // The client is asked for a review only while one is actually outstanding.
    // `=== false` is deliberate and matches ReviewFlowGate: undefined means the
    // field was never written (legacy completed project), which is nothing to do,
    // not something pending. Otherwise the row kept asking forever, because it
    // never consulted review state at all.
    const clientOwesReview = viewerIsClient && info?.reviewsCompleted === false;

    // Early payment (§5): money actually recorded, on work still running.
    //
    // This used to ask `outstandingFee(myFee) === 0` on `!isCompletedProject`,
    // and both halves were the wrong question. A didnt_happen contest zeroes the
    // fee AND reopens the project, so every clause passed and the row stamped
    // "Paid" on a voided fee nobody had paid. feePaidEarly asks whether money was
    // recorded, of an engagement that is still open.
    const feeSettledEarly = viewerIsPro && feePaidEarly(myFee ?? null);

    // Role-aware completed line. No amount appears anywhere in this list.
    // Three states, not two: a professional who owes is told to settle, but a
    // SUBSCRIBER (feeStatus 'included') or an exempt legacy project has nothing
    // to settle, so "tap to close" would be a lie — they just get the fact.
    const completedLine = viewerIsPro
      // A contest is its own state and gets its own sentence. Falling through to
      // "Project complete" would tell a professional their part is settled while
      // an admin is still looking at it; falling through to null would drop the
      // row's line the moment they raised the issue, which is what it did.
      ? (standing === 'under_review'
        ? t('chats.completed_pro_review')
        : myPartFinished
        ? (iOweOnThisProject ? t('chats.completed_pro') : t('chats.completed_pro_settled'))
        : null)
      : isCompletedProject && clientOwesReview
      ? t('chats.completed_client')
      : null;

    // The badge says who I am on this project. Same derivation as the copy
    // above, so self-hire reads as client in both. No project info yet (or not a
    // member) means no badge rather than a guess.
    const role: ProjectRole | null = viewerIsClient ? 'client' : viewerIsPro ? 'creator' : null;
    // Once the project is complete the badge says so instead; the row itself
    // stays white.
    const badge = isCompletedProject
      ? { label: t('chats.status_completed'), ...COMPLETED_BADGE }
      : role != null
      ? { label: role === 'client' ? t('chats.role_client') : t('chats.role_creator'), ...ROLE_CONFIG[role] }
      : null;
    const isUnread = unread > 0;
    const showTrash =
      (item.type === 'group' && (status === 'completed' || status === 'cancelled' || isCompletedProject))
      || (item.type === 'purchase' && !!item.archived);
    return (
      <Fragment key={item.id}>
        {/* Line between rows, from the avatar's far edge to the badge column's
            edge — row padding 20 + avatar 44 in, the row's padding out. None
            above the first row. */}
        {index > 0 && (
          <View
            style={[
              styles.separator,
              rtl
                ? { marginRight: SEPARATOR_INSET, marginLeft: SEPARATOR_END_INSET }
                : { marginLeft: SEPARATOR_INSET, marginRight: SEPARATOR_END_INSET },
            ]}
          />
        )}
        <Pressable
          style={({ pressed }) => [
            styles.row,
            { flexDirection: rowDir },
            isUnread && styles.rowUnread,
            pressed && styles.rowPressed,
          ]}
          testID={`chat-row-${item.id}`}
          onPress={() => router.push(`/${modeSegment}/chat/${item.id}` as never)}
        >
          {renderAvatar(item)}
          <View style={styles.content}>
            {/* Line 1: name and tag(s), then the time */}
            <View style={[styles.line, { flexDirection: rowDir }]}>
              {/* The name, then the tag(s) right after it (left of it in
                  Hebrew, right of it in English). */}
              <View style={[styles.nameWrap, { flexDirection: rowDir }]}>
                <AppText
                  weight={isUnread ? 'bold' : 'semiBold'}
                  style={[styles.name, isUnread && styles.nameUnread, { textAlign: rtl ? 'right' : 'left' }]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {chatName}
                </AppText>
                {badge != null && (
                  <View testID={`project-badge-${item.id}`} style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                    <AppText weight="semiBold" style={[styles.statusBadgeText, { color: badge.text }]}>
                      {badge.label}
                    </AppText>
                  </View>
                )}
                {item.type === 'purchase' && item.archived && (
                  <View style={[styles.statusBadge, { backgroundColor: item.archiveReason === 'cancelled' ? CANCELLED_BADGE.bg : COMPLETED_BADGE.bg }]}>
                    <AppText weight="semiBold" style={[styles.statusBadgeText, { color: item.archiveReason === 'cancelled' ? CANCELLED_BADGE.text : COMPLETED_BADGE.text }]}>
                      {item.archiveReason === 'cancelled' ? t('chats.badge_cancelled') : t('chats.badge_completed')}
                    </AppText>
                  </View>
                )}
              </View>
              {timestamp ? (
                <AppText
                  weight={isUnread ? 'semiBold' : 'regular'}
                  style={[styles.timestamp, isUnread && styles.timestampUnread]}
                  numberOfLines={1}
                >
                  {timestamp}
                </AppText>
              ) : null}
            </View>

            {/* Line 2: preview (or the completed sentence), paid pill, then the
                unread count or the trash button in the trailing slot. */}
            <View style={[styles.line, { flexDirection: rowDir }]}>
              <AppText
                weight={completedLine ? 'semiBold' : isUnread ? 'medium' : 'regular'}
                style={[
                  styles.preview,
                  completedLine ? { color: COMPLETED_LINE_COLOR } : isUnread ? styles.previewUnread : null,
                  { textAlign: rtl ? 'right' : 'left' },
                ]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {completedLine ?? item.lastMessage?.text ?? ''}
              </AppText>
              {feeSettledEarly && (
                <View style={styles.paidPill}>
                  <AppText weight="semiBold" style={styles.paidPillText}>{t('chats.fee_paid_pill')}</AppText>
                </View>
              )}
              {/* Owing money changes NOTHING about what this row can do. A
                  professional who owes used to lose the trash button here — an
                  inert chevron replaced it, so they could not dismiss the row that
                  was asking them to settle, and it came back the moment they paid.
                  That made leaving a conversation something a payment bought.
                  It also swallowed the unread badge on the same branch. */}
              {showTrash ? (
                <TouchableOpacity
                  onPress={(e) => { e.stopPropagation(); handleLeaveChat(item.id); }}
                  hitSlop={12}
                  activeOpacity={0.7}
                  style={styles.trashBtn}
                >
                  <Trash2 size={15} color="#ef4444" strokeWidth={2} />
                </TouchableOpacity>
              ) : isUnread ? (
                <View style={[styles.unreadBadge, { backgroundColor: accent }]}>
                  <Text style={[styles.unreadBadgeText, { ...font.bold }]}>{unread > 99 ? '99+' : unread}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </Pressable>
      </Fragment>
    );
  });

  // Nothing matched — compact treatment (no icon circle, no primary button),
  // distinct from the illustrated "no chats at all" empty state.
  //
  // Rendered INSIDE the normal return, not as an early one, so the filter chips
  // stay on screen: a filter that matches nothing must still be clearable.
  const searching = searchQuery.trim().length > 0;
  const emptyBody = visibleChats.length > 0 ? null : (
    <View style={styles.noResults}>
      <AppText weight="medium" style={[styles.noResultsTitle, { color: INK }]}>
        {searching ? t('chats.empty_search_title') : t('chats.empty_filter_title')}
      </AppText>
      {searching ? (
        <TouchableOpacity
          style={styles.noResultsClear}
          onPress={() => onClearSearch?.()}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <AppText weight="regular" style={[styles.noResultsClearText, { color: accent }]}>
            {t('chats.empty_search_clear')}
          </AppText>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.noResultsClear}
          onPress={() => setChatFilter('all')}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <AppText weight="regular" style={[styles.noResultsClearText, { color: accent }]}>
            {t('chats.filter_all')}
          </AppText>
        </TouchableOpacity>
      )}
    </View>
  );

  // Sits directly beneath the search bar, which lives in the two tab pages —
  // rendering it here gives both tabs the same row from one implementation.
  const filterRow = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.filterScroll}
      contentContainerStyle={[styles.filterRow, { flexDirection: rowDir }]}
    >
      {CHAT_FILTERS.map((f) => {
        const active = chatFilter === f;
        return (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, active && { backgroundColor: accent, borderColor: accent }]}
            onPress={() => setChatFilter(f)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <AppText weight="semiBold" style={[styles.filterChipText, active && styles.filterChipTextActive]}>
              {t(`chats.filter_${f}`)}
            </AppText>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  // Only where the loss is concrete: something is unread and nobody was told.
  const hasUnread = visibleChats.some((c) => (c.unreadCount?.[user?.id ?? ''] ?? 0) > 0);
  const notifBanner = notifPrompt.visible && hasUnread
    ? <NotifPermissionBanner context="chats" onDismiss={notifPrompt.dismiss} />
    : null;

  if (scrollable) {
    return (
      <ScrollView style={styles.flex} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {notifBanner}
        {filterRow}
        {emptyBody ?? <View style={styles.listCard}>{cards}</View>}
      </ScrollView>
    );
  }
  return <View style={styles.listContent}>{notifBanner}{filterRow}{emptyBody ?? <View style={styles.listCard}>{cards}</View>}</View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // No top padding: the search bar sits right above and carries the gap.
  listContent: { paddingTop: 0, paddingBottom: 16 },
  // One row that scrolls, never a wrapping block: in English the four labels
  // exceed a phone's width and used to spill onto a second line, pushing the
  // list down. flexGrow keeps a short row aligned to the reading edge, since
  // under row-reverse the default flex-start IS the right edge.
  filterScroll: { flexGrow: 0, marginBottom: 10 },
  filterRow: { gap: 7, paddingHorizontal: 20, alignItems: 'center', flexGrow: 1 },
  filterChip: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 999,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#EAE8F0',
    backgroundColor: '#FFFFFF',
  },
  filterChipText: { fontSize: 12.5, fontWeight: '600', color: INK },
  filterChipTextActive: { color: '#FFFFFF' },
  noResults: { paddingTop: 40, alignItems: 'center', gap: 6 },
  noResultsTitle: { fontSize: 15 },
  noResultsClear: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  noResultsClearText: { fontSize: 13 },

  // One white strip for every row, edge to edge (both pages that render this
  // list bleed it to the screen's sides) — no card, border or shadow.
  listCard: {
    backgroundColor: '#FFFFFF',
  },
  separator: { height: 1, backgroundColor: '#D6D2E2' },
  // 64 tall: padding 10 × 2 + the 44 avatar.
  row: {
    minHeight: 64,
    alignItems: 'center',
    gap: 11,
    // 14, not 10: at 10 the message line sat almost on the separator below it
    // and the rows read as one block. The padding is symmetric, so what a row
    // gains under its message it also gains above its name — between two rows
    // that is 28 of clear space, and each chat reads as its own thing.
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  rowUnread: { backgroundColor: '#FBFAFE' },
  rowPressed: { backgroundColor: '#F8F6FC' },

  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontSize: 18, fontWeight: '700' },

  content: { flex: 1, minWidth: 0, gap: 3 },
  line: { alignItems: 'center', gap: 6 },
  nameWrap: { flex: 1, minWidth: 0, alignItems: 'center', gap: 6 },
  name: { flexShrink: 1, fontSize: 14.5, fontWeight: '600', color: INK },
  nameUnread: { fontWeight: '700' },
  statusBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, flexShrink: 0 },
  statusBadgeText: { fontSize: 10, fontWeight: '600' },
  timestamp: { fontSize: 11, color: INK, flexShrink: 0 },
  timestampUnread: { color: INK, fontWeight: '700' },
  preview: { flex: 1, fontSize: 12.5, color: INK },
  previewUnread: { color: INK, fontWeight: '600' },
  // OUTLINED, not filled: a payment state, not a role or a project status, so
  // it must not read as another point on the status-badge scale. The 1pt border
  // replaces a point of padding, so it measures the same as the filled tags.
  paidPill: {
    borderWidth: 1,
    borderColor: '#C4B5FD',
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1,
    flexShrink: 0,
  },
  paidPillText: { fontSize: 10, fontWeight: '600', color: VIOLET },
  trashBtn: { padding: 4, flexShrink: 0 },
  unreadBadge: {
    minWidth: 19,
    height: 19,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    flexShrink: 0,
  },
  unreadBadgeText: { fontSize: 10.5, fontWeight: '700', color: '#FFFFFF' },
});
