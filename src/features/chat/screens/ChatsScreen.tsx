import { useEffect, useRef, useState } from 'react';
import { TouchableOpacity, View, Text, StyleSheet, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { getDoc, doc } from 'firebase/firestore';
import { useRouter, useSegments } from 'expo-router';
import { Users, Package, Trash2 } from 'lucide-react-native';
import { AppText } from '@components/ui/AppText';
import { useTheme } from '@core/hooks/useTheme';
import { useAuthStore } from '@core/stores/authStore';
import { auth, db } from '@core/firebase/config';
import { listenToUserChats, removeMemberFromGroup } from '../services/chatService';
import { confirmDialog } from '@utils/confirmDialog';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import type { Chat } from '../types';
import type { ProjectRequest } from '@core/types/project';

type ProjectStatus = ProjectRequest['status'];
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

const STATUS_CONFIG: Record<ProjectStatus, { bg: string; text: string }> = {
  open:        { bg: '#c1ecf9', text: '#004aad' },
  in_progress: { bg: '#f59e0b', text: '#fff' },
  completed:   { bg: '#ecf9c1', text: '#2d6a2d' },
  cancelled:   { bg: '#ef4444', text: '#fff' },
};

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

export function ChatsScreen({ scrollable = true, searchQuery = '' }: { scrollable?: boolean; searchQuery?: string }) {
  const router = useRouter();
  const segments = useSegments();
  const modeSegment = segments[0];
  const colors = useTheme();
  const font = useAppFont();
  const user = useAuthStore((s) => s.user);
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const rowDir = rtl ? 'row-reverse' : 'row' as const;
  const [chats, setChats] = useState<Chat[]>([]);
  const [dmInfo, setDmInfo] = useState<Record<string, DmInfo>>({});
  const [projectStatuses, setProjectStatuses] = useState<Record<string, ProjectStatus>>({});
  const [purchaseNames, setPurchaseNames] = useState<Record<string, string>>({});
  const [purchaseImages, setPurchaseImages] = useState<Record<string, string>>({});
  const fetchedUserIdsRef = useRef<Set<string>>(new Set());
  const fetchedChatProjectIdsRef = useRef<Set<string>>(new Set());
  const fetchedPurchaseChatIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) { setChats([]); return; }
    setChats([]);
    const unsubscribe = listenToUserChats(user.id, setChats);
    return unsubscribe;
  }, [user?.id]);

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

  useEffect(() => {
    const toFetch = chats.filter(
      (c) => c.type === 'group' && c.projectId != null && !fetchedChatProjectIdsRef.current.has(c.id),
    );
    if (toFetch.length === 0) return;
    toFetch.forEach((c) => fetchedChatProjectIdsRef.current.add(c.id));
    Promise.all(
      toFetch.map(async (c) => {
        const snap = await getDoc(doc(db, 'projects', c.projectId!));
        if (!snap.exists()) return null;
        const status = (snap.data() as Pick<ProjectRequest, 'status'>).status;
        return [c.id, status] as const;
      }),
    ).then((entries) => {
      const valid = entries.filter((e): e is [string, ProjectStatus] => e !== null);
      if (valid.length > 0) setProjectStatuses((prev) => ({ ...prev, ...Object.fromEntries(valid) }));
    });
  }, [chats]);

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
          const data = snap.data() as { productName?: string; imageUrl?: string | null };
          return [c.id, data.productName ?? null, data.imageUrl ?? null] as const;
        } catch {
          return null;
        }
      }),
    ).then((entries) => {
      const valid = entries.filter((e): e is readonly [string, string | null, string | null] => e !== null);
      const names = valid.filter((e) => e[1]).map((e) => [e[0], e[1] as string] as const);
      const images = valid.filter((e) => e[2]).map((e) => [e[0], e[2] as string] as const);
      if (names.length > 0) setPurchaseNames((prev) => ({ ...prev, ...Object.fromEntries(names) }));
      if (images.length > 0) setPurchaseImages((prev) => ({ ...prev, ...Object.fromEntries(images) }));
    });
  }, [chats]);

  const statusLabel = (status: ProjectStatus): string => {
    const map: Record<ProjectStatus, string> = {
      open:        t('chats.status_open'),
      in_progress: t('chats.status_in_progress'),
      completed:   t('chats.status_completed'),
      cancelled:   t('chats.status_cancelled'),
    };
    return map[status];
  };

  async function handleLeaveChat(chatId: string) {
    const confirmed = await confirmDialog(
      rtl ? 'הסרת צ׳אט' : 'Remove chat',
      rtl ? 'האם להסיר צ׳אט זה מהרשימה שלך?' : 'Remove this chat from your list?',
    );
    if (!confirmed || !user) return;
    await removeMemberFromGroup(chatId, user.id);
  }

  const avatarMargin = { marginRight: rtl ? 0 : 12, marginLeft: rtl ? 12 : 0 };

  function renderAvatar(item: Chat) {
    if (item.type === 'purchase') {
      const productImage = purchaseImages[item.id];
      if (productImage) {
        return <Image source={{ uri: productImage }} style={styles.avatar} contentFit="cover" cachePolicy="memory-disk" />;
      }
      return (
        <View style={[styles.avatar, { backgroundColor: item.archived ? '#e5e7eb' : '#fff7ed' }]}>
          <Package size={24} color={item.archived ? '#9ca3af' : '#f59e0b'} strokeWidth={1.8} />
        </View>
      );
    }
    if (item.type === 'community') {
      return (
        <View style={[styles.avatar, { backgroundColor: '#0d9488' }]}>
          <Users size={24} color="#fff" strokeWidth={1.8} />
        </View>
      );
    }
    if (item.type === 'group') {
      return (
        <View style={[styles.avatar, { backgroundColor: '#e7c8f2' }]}>
          <Users size={24} color="#7c3aed" strokeWidth={1.8} />
        </View>
      );
    }
    const info = dmInfo[item.id];
    if (info?.photoURL) {
      return <Image source={{ uri: info.photoURL }} style={styles.avatar} contentFit="cover" cachePolicy="memory-disk" />;
    }
    const initial = info?.name?.charAt(0).toUpperCase() ?? '?';
    return (
      <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
        <AppText weight="bold" style={styles.avatarInitial}>{initial}</AppText>
      </View>
    );
  }

  if (chats.length === 0) {
    return (
      <View style={styles.flex}>
        <View style={styles.empty}>
          <AppText weight="regular" style={[styles.emptyText, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
            {t('chats.no_conversations')}
          </AppText>
        </View>
      </View>
    );
  }

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

  const visibleChats = searchQuery.trim()
    ? sortedChats.filter((item) => {
        const name =
          item.type === 'community' ? (item.name ?? 'Community')
          : item.type === 'group' ? (item.name ?? t('chats.group_chat'))
          : item.type === 'purchase' ? (item.name || purchaseNames[item.id] || t('chats.purchase_chat'))
          : (dmInfo[item.id]?.name ?? '');
        return name.toLowerCase().includes(searchQuery.toLowerCase());
      })
    : sortedChats;

  const cards = visibleChats.map((item) => {
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
    const status = item.type === 'group' ? projectStatuses[item.id] : undefined;
    const timestamp = formatTimestamp(item.lastMessage?.timestamp, language);
    const unread = item.unreadCount?.[currentUserId] ?? 0;
    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.card, { backgroundColor: '#ffffff', flexDirection: rowDir }]}
        onPress={() => router.push(`/${modeSegment}/(tabs)/chats/${item.id}` as never)}
        activeOpacity={0.75}
      >
        <View style={[styles.avatarWrap, avatarMargin]}>
          {renderAvatar(item)}
          {timestamp ? (
            <View style={styles.avatarTimestampOverlay}>
              <Text style={[styles.avatarTimestampText, { color: colors.textMuted, ...font.regular }]}>
                {timestamp}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.content}>
          <View style={[styles.headerRow, { flexDirection: rowDir }]}>
            <AppText weight="bold" style={[styles.name, { color: '#004aad', textAlign: rtl ? 'right' : 'left', flex: 1 }]} numberOfLines={1}>
              {chatName}
            </AppText>
            {status != null && (
              <View style={[styles.statusBadge, { backgroundColor: STATUS_CONFIG[status].bg }]}>
                <AppText weight="bold" style={[styles.statusBadgeText, { color: STATUS_CONFIG[status].text }]}>{statusLabel(status)}</AppText>
              </View>
            )}
            {item.type === 'purchase' && item.archived && (
              <View style={[styles.statusBadge, { backgroundColor: item.archiveReason === 'cancelled' ? '#fee2e2' : '#ecf9c1' }]}>
                <AppText weight="bold" style={[styles.statusBadgeText, { color: item.archiveReason === 'cancelled' ? '#dc2626' : '#2d6a2d' }]}>
                  {item.archiveReason === 'cancelled' ? t('chats.badge_cancelled') : t('chats.badge_completed')}
                </AppText>
              </View>
            )}
          </View>
          <View style={[styles.bottomRow, { flexDirection: rowDir }]}>
            <AppText
              weight="regular"
              style={[styles.preview, {
                color: colors.textMuted,
                textAlign: rtl ? 'right' : 'left',
                paddingRight: rtl ? 0 : 4,
                paddingLeft: rtl ? 4 : 0,
              }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {item.lastMessage?.text ?? ''}
            </AppText>
            {(item.type === 'group' && (status === 'completed' || status === 'cancelled')) || (item.type === 'purchase' && !!item.archived) ? (
              <TouchableOpacity
                onPress={(e) => { e.stopPropagation(); handleLeaveChat(item.id); }}
                hitSlop={8}
                activeOpacity={0.7}
                style={[styles.trashBtn, { marginLeft: rtl ? 0 : 20, marginRight: rtl ? 20 : 0 }]}
              >
                <Trash2 size={15} color="#ef4444" strokeWidth={2} />
              </TouchableOpacity>
            ) : unread > 0 ? (
              <View style={[styles.unreadBadge, { marginLeft: rtl ? 0 : 20, marginRight: rtl ? 20 : 0 }]}>
                <Text style={[styles.unreadBadgeText, { ...font.bold }]}>{unread > 99 ? '99+' : unread}</Text>
              </View>
            ) : (
              <View style={[styles.badgePlaceholder, { marginLeft: rtl ? 0 : 20, marginRight: rtl ? 20 : 0 }]} />
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  });

  if (scrollable) {
    return (
      <ScrollView style={styles.flex} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {cards}
      </ScrollView>
    );
  }
  return <View style={styles.listContent}>{cards}</View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  listContent: { paddingTop: 8, paddingBottom: 16 },
  empty: { paddingTop: 60, alignItems: 'center' },
  emptyText: { fontSize: 15 },

  card: {
    alignItems: 'center',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },

  avatarWrap: { position: 'relative' },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { color: '#fff', fontSize: 20, fontWeight: '700' },
  avatarTimestampOverlay: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: 'white',
    borderRadius: 6,
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  avatarTimestampText: { fontSize: 9 },

  content: { flex: 1, gap: 4 },
  headerRow: { alignItems: 'center', justifyContent: 'space-between' },
  name: { fontSize: 15, fontWeight: '700' },
  statusBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20, flexShrink: 0 },
  trashBtn: { padding: 4, marginLeft: 6 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  bottomRow: { alignItems: 'center', justifyContent: 'space-between' },
  preview: { fontSize: 13, flex: 1 },
  unreadBadge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#004aad', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, flexShrink: 0 },
  unreadBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  badgePlaceholder: { width: 20, height: 20, flexShrink: 0 },
});
