import { useEffect, useRef, useState } from 'react';
import { FlatList, TouchableOpacity, View, Text, Image, StyleSheet } from 'react-native';
import { getDoc, doc } from 'firebase/firestore';
import { useRouter, useSegments } from 'expo-router';
import { Users } from 'lucide-react-native';
import { useTheme } from '@core/hooks/useTheme';
import { useAuthStore } from '@core/stores/authStore';
import { auth, db } from '@core/firebase/config';
import { listenToUserChats } from '../services/chatService';
import type { Chat } from '../types';
import type { ProjectRequest } from '@core/types/project';

type ProjectStatus = ProjectRequest['status'];

const STATUS_CONFIG: Record<ProjectStatus, { label: string; color: string }> = {
  open:        { label: 'Open',        color: '#004aad' },
  in_progress: { label: 'In Progress', color: '#f59e0b' },
  completed:   { label: 'Completed',   color: '#22c55e' },
  cancelled:   { label: 'Cancelled',   color: '#ef4444' },
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
  return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
}

type DmInfo = { name: string; photoURL: string | null };

export function ChatsScreen() {
  const router = useRouter();
  const segments = useSegments();
  const modeSegment = segments[0];
  const colors = useTheme();
  const user = useAuthStore((s) => s.user);
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
    Promise.all(
      toFetch.map(async (c) => {
        const otherId = c.members.find((id) => id !== currentUserId)!;
        const snap = await getDoc(doc(db, 'users', otherId));
        const data = snap.exists() ? (snap.data() as { displayName: string; photoURL?: string }) : null;
        return [c.id, { name: data?.displayName ?? 'Unknown', photoURL: data?.photoURL ?? null }] as const;
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
        <Text style={styles.avatarInitial}>{initial}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={chats}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, chats.length === 0 && styles.empty]}
        ListEmptyComponent={
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>No conversations yet</Text>
        }
        renderItem={({ item }) => {
          const chatName = item.type === 'group' ? (item.name ?? 'Group Chat') : (dmInfo[item.id]?.name ?? 'Loading...');
          const status = item.type === 'group' ? projectStatuses[item.id] : undefined;
          const timestamp = formatTimestamp(item.lastMessage?.timestamp);
          return (
            <TouchableOpacity
              style={[styles.card, { backgroundColor: '#ffffff' }]}
              onPress={() => router.push(`/${modeSegment}/(tabs)/chats/${item.id}`)}
              activeOpacity={0.75}
            >
              {renderAvatar(item)}
              <View style={styles.content}>
                <View style={styles.topRow}>
                  <Text style={[styles.name, { color: item.type === 'group' ? '#cb6ce6' : '#004aad' }]} numberOfLines={1}>{chatName}</Text>
                  {status != null && (
                    <View style={[styles.statusBadge, { backgroundColor: STATUS_CONFIG[status].color }]}>
                      <Text style={styles.statusBadgeText}>{STATUS_CONFIG[status].label}</Text>
                    </View>
                  )}
                  {timestamp ? (
                    <Text style={[styles.timestamp, { color: colors.textMuted }]}>{timestamp}</Text>
                  ) : null}
                </View>
                <Text style={[styles.preview, { color: colors.textMuted }]} numberOfLines={1}>
                  {item.lastMessage?.text ?? 'No messages yet'}
                </Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { paddingTop: 8, paddingBottom: 100 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 15 },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 12,
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

  content: { flex: 1, gap: 3 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  statusBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 },
  statusBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  timestamp: { fontSize: 11, marginLeft: 'auto' },
  preview: { fontSize: 13 },
});
