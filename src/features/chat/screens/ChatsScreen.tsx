import { useEffect, useRef, useState } from 'react';
import { FlatList, TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { getDoc, doc } from 'firebase/firestore';
import { useRouter, useSegments } from 'expo-router';
import { useTheme } from '@core/hooks/useTheme';
import { useAuthStore } from '@core/stores/authStore';
import { auth, db } from '@core/firebase/config';
import { listenToUserChats } from '../services/chatService';
import type { Chat } from '../types';

export function ChatsScreen() {
  const router = useRouter();
  const segments = useSegments();
  const modeSegment = segments[0]; // '(client)' or '(professional)'
  const colors = useTheme();
  const user = useAuthStore((s) => s.user);
  const [chats, setChats] = useState<Chat[]>([]);
  const [dmNames, setDmNames] = useState<Record<string, string>>({});
  const fetchedUserIdsRef = useRef<Set<string>>(new Set());

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
              <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                {item.type === 'group' ? item.name : (dmNames[item.id] ?? 'Loading...')}
              </Text>
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
  name: {
    fontSize: 16,
    fontWeight: '600',
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
