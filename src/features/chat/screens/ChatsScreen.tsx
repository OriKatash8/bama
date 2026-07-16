import { useEffect, useRef, useState } from 'react';
import { TouchableOpacity, View, Text, Image, StyleSheet } from 'react-native';
import { getDoc, doc } from 'firebase/firestore';
import { useRouter, useSegments } from 'expo-router';
import { Users } from 'lucide-react-native';
import { useTheme } from '@core/hooks/useTheme';
import { useAuthStore } from '@core/stores/authStore';
import { auth, db } from '@core/firebase/config';
import { listenToUserChats } from '../services/chatService';
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

const STATUS_CONFIG: Record<ProjectStatus, { color: string }> = {
  open:        { color: '#004aad' },
  in_progress: { color: '#f59e0b' },
  completed:   { color: '#22c55e' },
  cancelled:   { color: '#ef4444' },
};

function formatTimestamp(ts: { toDate(): Date } | null | undefined): string {
  if (!ts) return '';
  const date = ts.toDate();
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  const daysDiff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (daysDiff < 7) {
    return date.toLocaleDateString([], { weekday: 'short' });
  }
  return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
}

type DmInfo = { name: string; photoURL: string | null };

export function ChatsScreen() {
  const router = useRouter();
  const segments = useSegments();
  const modeSegment = segments[0];
  const colors = useTheme();
  const font = useAppFont();
  const user = useAuthStore((s) => s.user);
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const [chats, setChats] = useState<Chat[]>([]);
  const [dmInfo, setDmInfo] = useState<Record<string, DmInfo>>({});
  const [projectStatuses, setProjectStatuses] = useState<Record<string, ProjectStatus>>({});
  const fetchedUserIdsRef = useRef<Set<string>>(new Set());
  const fetchedChatProjectIdsRef = useRef<Set<string>>(new Set());

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

  const statusLabel = (status: ProjectStatus): string => {
    const map: Record<ProjectStatus, string> = {
      open:        t('chats.status_open'),
      in_progress: t('chats.status_in_progress'),
      completed:   t('chats.status_completed'),
      cancelled:   t('chats.status_cancelled'),
    };
    return map[status];
  };

  function renderAvatar(item: Chat) {
    if (item.type === 'group') {
      return (
        <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
          <Users size={24} color="#fff" strokeWidth={1.8} />
        </View>
      );
    }
    const info = dmInfo[item.id];
    if (info?.photoURL) {
      return <Image source={{ uri: info.photoURL }} style={styles.avatar} />;
    }
    const initial = info?.name?.charAt(0).toUpperCase() ?? '?';
    return (
      <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
        <Text style={[styles.avatarInitial, { fontFamily: font.bold }]}>{initial}</Text>
      </View>
    );
  }

  if (chats.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyText, { color: colors.textMuted, fontFamily: font.regular, textAlign: rtl ? 'right' : 'left' }]}>
          {t('chats.no_conversations')}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.listContent}>
      {chats.map((item) => {
        const currentUserId = user?.id ?? '';
        console.log('[ChatsScreen] chat id:', item.id, '| unreadCount:', item.unreadCount, '| my unread:', item.unreadCount?.[currentUserId]);
        const chatName = item.type === 'group'
          ? (item.name ?? t('chats.group_chat'))
          : (dmInfo[item.id]?.name ?? t('chats.loading'));
        const status = item.type === 'group' ? projectStatuses[item.id] : undefined;
        const timestamp = formatTimestamp(item.lastMessage?.timestamp);
        const unread = item.unreadCount?.[currentUserId] ?? 0;
        return (
          <TouchableOpacity
            key={item.id}
            style={[styles.card, { backgroundColor: '#ffffff' }]}
            onPress={() => router.push(`/${modeSegment}/(tabs)/chats/${item.id}`)}
            activeOpacity={0.75}
          >
            {renderAvatar(item)}
            <View style={styles.content}>
              <View style={styles.headerRow}>
                <View style={styles.nameRow}>
                  <Text style={[styles.name, { color: '#004aad', fontFamily: font.bold }]} numberOfLines={1}>
                    {chatName}
                  </Text>
                  {status != null && (
                    <View style={[styles.statusBadge, { backgroundColor: STATUS_CONFIG[status].color }]}>
                      <Text style={[styles.statusBadgeText, { fontFamily: font.bold }]}>{statusLabel(status)}</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.timestamp, { color: colors.textMuted, fontFamily: font.regular }]}>{timestamp}</Text>
              </View>
              <View style={styles.bottomRow}>
                <Text
                  style={[styles.preview, { color: colors.textMuted, fontFamily: font.regular }]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {item.lastMessage?.text ?? ''}
                </Text>
                {unread > 0 ? (
                  <View style={styles.unreadBadge}>
                    <Text style={[styles.unreadBadgeText, { fontFamily: font.bold }]}>{unread > 99 ? '99+' : unread}</Text>
                  </View>
                ) : (
                  <View style={styles.badgePlaceholder} />
                )}
              </View>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  listContent: { paddingTop: 8 },
  empty: { paddingTop: 60, alignItems: 'center' },
  emptyText: { fontSize: 15 },

  card: {
    flexDirection: 'row',
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

  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarInitial: { color: '#fff', fontSize: 20, fontWeight: '700' },

  content: { flex: 1, gap: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nameRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8, overflow: 'hidden' },
  name: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  statusBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20, marginLeft: 6, flexShrink: 0 },
  statusBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  timestamp: { fontSize: 11, flexShrink: 0 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  preview: { fontSize: 13, flex: 1, paddingRight: 4 },
  unreadBadge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#004aad', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, marginLeft: 20, flexShrink: 0 },
  unreadBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  badgePlaceholder: { width: 20, height: 20, marginLeft: 20, flexShrink: 0 },
});
