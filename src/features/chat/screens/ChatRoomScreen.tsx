import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { getDoc, updateDoc, doc } from 'firebase/firestore';
import { useRouter } from 'expo-router';
import { useTheme } from '@core/hooks/useTheme';
import { useAppFont } from '@core/hooks/useAppFont';
import { auth, db } from '@core/firebase/config';
import { listenToMessages, sendMessage } from '../services/chatService';
import { PurchaseBanner } from '@features/marketplace/components/PurchaseBanner';
import type { Chat, Message } from '../types';

const USER_COLORS = [
  '#e53935', '#d81b60', '#8e24aa', '#5e35b1', '#3949ab', '#1e88e5',
  '#039be5', '#00acc1', '#00897b', '#43a047', '#c0ca33', '#fb8c00',
  '#f4511e', '#6d4c41', '#546e7a', '#00838f', '#2e7d32', '#c62828',
];

function colorForUser(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return USER_COLORS[hash % USER_COLORS.length];
}

interface Props {
  chatId: string;
}

export function ChatRoomScreen({ chatId }: Props) {
  const colors = useTheme();
  const font = useAppFont();
  const router = useRouter();
  const currentUserId = auth.currentUser?.uid ?? '';
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const fetchedIdsRef = useRef<Set<string>>(new Set());
  const [chatName, setChatName] = useState<string>('');
  const [chatType, setChatType] = useState<Chat['type'] | null>(null);
  const [chatProjectId, setChatProjectId] = useState<string | undefined>(undefined);

  const gradientText = Platform.OS === 'web' ? ({
    background: 'linear-gradient(to right, #004aad, #cb6ce6)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  } as object) : {};

  useEffect(() => {
    async function fetchChat() {
      const snap = await getDoc(doc(db, 'chats', chatId));
      if (!snap.exists()) return;

      const data = snap.data() as Omit<Chat, 'id'>;
      setChatType(data.type);
      setChatProjectId(data.projectId);

      if (data.type === 'dm') {
        const otherId = data.members.find((id) => id !== currentUserId);
        if (otherId) {
          const userSnap = await getDoc(doc(db, 'users', otherId));
          const displayName = userSnap.exists()
            ? (userSnap.data() as { displayName: string }).displayName
            : 'Unknown';
          setChatName(displayName);
        } else {
          setChatName('Direct message');
        }
      } else {
        setChatName(data.name ?? 'Group Chat');
      }
    }
    fetchChat();
  }, [chatId]);

  useEffect(() => {
    if (!currentUserId) return;
    updateDoc(doc(db, 'chats', chatId), {
      [`unreadCount.${currentUserId}`]: 0,
    }).catch(() => {});
  }, [chatId, currentUserId]);

  useEffect(() => {
    return listenToMessages(chatId, setMessages);
  }, [chatId]);

  useEffect(() => {
    const senderIds = [...new Set(messages.map((m) => m.senderId))];
    const missing = senderIds.filter(
      (id) => id !== currentUserId && !fetchedIdsRef.current.has(id)
    );
    if (missing.length === 0) return;
    missing.forEach((id) => fetchedIdsRef.current.add(id));
    Promise.all(
      missing.map(async (id) => {
        const snap = await getDoc(doc(db, 'users', id));
        const name = snap.exists()
          ? (snap.data() as { displayName: string }).displayName
          : id;
        return [id, name] as const;
      })
    ).then((entries) => {
      setUserNames((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    });
  }, [messages]);

  async function handleSend() {
    const text = inputText.trim();
    if (!text || !currentUserId) return;
    setInputText('');
    await sendMessage(chatId, currentUserId, text);
  }

  return (
    <LinearGradient colors={colors.bgGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.container}>
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
    >
      <View style={[styles.header, { backgroundColor: 'transparent', borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBack} activeOpacity={0.7}>
          <Text style={[styles.headerBackText, { color: colors.accent, fontFamily: font.regular }]}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          {chatType === 'group' && chatProjectId ? (
            <TouchableOpacity
              onPress={() => router.push(`/(client)/(tabs)/chat/project-details?projectId=${chatProjectId}`)}
              activeOpacity={0.8}
            >
              <Text style={[styles.headerName, { color: colors.text, fontFamily: font.bold }, gradientText]} numberOfLines={1}>
                {chatName}
              </Text>
            </TouchableOpacity>
          ) : (
            <Text style={[styles.headerName, { color: colors.text, fontFamily: font.bold }, gradientText]} numberOfLines={1}>
              {chatName}
            </Text>
          )}
        </View>
        <View style={styles.headerRight} />
      </View>

      <PurchaseBanner chatId={chatId} />

      <FlatList
        data={[...messages].reverse()}
        keyExtractor={(item) => item.id}
        inverted
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const isOwn = item.senderId === currentUserId;
          return (
            <View style={[styles.bubbleWrapper, isOwn ? styles.wrapperOwn : styles.wrapperPeer]}>
              <View
                style={[
                  styles.bubble,
                  isOwn ? { backgroundColor: colors.accent } : { backgroundColor: '#ffffff' },
                ]}
              >
                {!isOwn && (
                  <Text style={[styles.senderName, { color: colorForUser(item.senderId), fontFamily: font.regular }]}>
                    {userNames[item.senderId] ?? 'Loading...'}
                  </Text>
                )}
                <Text style={[styles.messageText, { color: isOwn ? '#fff' : colors.text, fontFamily: font.regular }]}>
                  {item.text}
                </Text>
              </View>
            </View>
          );
        }}
      />
      <View style={[styles.inputRow, { borderTopColor: colors.border, backgroundColor: 'transparent' }]}>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text, fontFamily: font.regular },
          ]}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Message..."
          placeholderTextColor={colors.placeholder}
          multiline
          returnKeyType="default"
        />
        <TouchableOpacity
          style={[styles.sendButton, { backgroundColor: colors.accent }]}
          onPress={handleSend}
          disabled={!inputText.trim()}
          activeOpacity={0.7}
        >
          <Text style={[styles.sendLabel, { fontFamily: font.semiBold }]}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1, backgroundColor: 'transparent' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 110,
    borderBottomWidth: 1,
    paddingHorizontal: 8,
  },
  headerBack: {
    width: 48,
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBackText: {
    fontSize: 48,
    lineHeight: 58,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  headerName: {
    fontSize: 42,
    fontWeight: '800',
    textAlign: 'center',
  },
  headerRight: {
    width: 48,
  },
  list: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  bubbleWrapper: {
    flexDirection: 'row',
  },
  wrapperOwn: {
    justifyContent: 'flex-end',
  },
  wrapperPeer: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '75%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  senderName: {
    fontSize: 12,
    color: '#888',
    marginBottom: 2,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 90,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 120,
  },
  sendButton: {
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendLabel: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
});
