import { useEffect, useRef, useState } from 'react';
import { FlatList, TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { getDoc, doc } from 'firebase/firestore';
import { useRouter, useSegments } from 'expo-router';
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

export function ChatsScreen() {
  const router = useRouter();
  const segments = useSegments();
  const modeSegment = segments[0]; // '(client)' or '(professional)'
  const colors = useTheme();
  const user = useAuthStore((s) => s.user);
  const [chats, setChats] = useState<Chat[]>([]);
  const [dmNames, setDmNames] = useState<Record<string, string>>({});
  const [projectStatuses, setProjectStatuses] = useState<Record<string, ProjectStatus>>({});
  const fetchedUserIdsRef = useRef<Set<string>>(new Set());
  const fetchedChatProjectIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) {
      setChats([]);
      return;
    }
    console.log('[ChatsScreen] user.id (from authStore):', user.id);
    console.log('[ChatsScreen] auth.currentUser?.uid:', auth.currentUser?.uid);
    setChats([]);
    const unsubscribe = listenToUserChats(user.id, (chats) => {
      console.log('[ChatsScreen] listenToUserChats update — chats:', JSON.stringify(chats, null, 2));
      setChats(chats);
    });
    return unsubscribe;
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    const currentUserId = user.id;

    const dmChats = chats.filter((c) => c.type === 'dm');
    const toFetch = dmChats.filter((c) => {
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
        const displayName = snap.exists()
          ? (snap.data() as { displayName: string }).displayName
          : 'Unknown';
        return [c.id, displayName] as const;
      })
    ).then((entries) => {
      setDmNames((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    });
  }, [chats, user]);

  useEffect(() => {
    const toFetch = chats.filter(
      (c) =>
        c.type === 'group' &&
        c.projectId != null &&
        !fetchedChatProjectIdsRef.current.has(c.id),
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
      const valid = entries.filter(
        (e): e is [string, ProjectStatus] => e !== null,
      );
      if (valid.length > 0) {
        setProjectStatuses((prev) => ({ ...prev, ...Object.fromEntries(valid) }));
      }
    });
  }, [chats]);

  return (
    <View style={styles.container}>
      <FlatList
        data={chats}
        keyExtractor={(item) => item.id}
        contentContainerStyle={chats.length === 0 && styles.empty}
        ListEmptyComponent={
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            No conversations yet
          </Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.row, { borderBottomColor: colors.border }]}
            onPress={() => router.push(`/${modeSegment}/(tabs)/chats/${item.id}`)}
            activeOpacity={0.7}
          >
            <View style={styles.rowContent}>
              <View style={styles.nameRow}>
                <Text style={[styles.name, { color: '#004aad' }]} numberOfLines={1}>
                  {item.type === 'group' ? item.name : (dmNames[item.id] ?? 'Loading...')}
                </Text>
                {item.type === 'group' && projectStatuses[item.id] != null && (
                  <View style={[styles.statusBadge, { backgroundColor: STATUS_CONFIG[projectStatuses[item.id]].color }]}>
                    <Text style={styles.statusBadgeText}>
                      {STATUS_CONFIG[projectStatuses[item.id]].label}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={[styles.preview, { color: colors.textMuted }]} numberOfLines={1}>
                {item.lastMessage?.text ?? 'No messages yet'}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  row: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowContent: {
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    flexShrink: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  preview: {
    fontSize: 14,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
  },
});
