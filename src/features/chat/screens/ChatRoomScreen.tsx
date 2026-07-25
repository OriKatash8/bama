import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import {
  getDoc, updateDoc, doc, Timestamp,
  collection, onSnapshot, query, where,
  arrayUnion, arrayRemove,
} from 'firebase/firestore';
import { useRouter } from 'expo-router';
import { Paperclip } from 'lucide-react-native';
import { useTheme } from '@core/hooks/useTheme';
import { useAppFont } from '@core/hooks/useAppFont';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAuthStore } from '@core/stores/authStore';
import { useVideoUpload } from '@core/hooks/useVideoUpload';
import { VideoPlayer } from '@components/ui/VideoPlayer';
import { uploadFile } from '@core/firebase/storage';
import { auth, db } from '@core/firebase/config';
import { listenToMessages, sendMessage } from '../services/chatService';
import { PurchaseBanner } from '@features/marketplace/components/PurchaseBanner';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import type { Chat, Message } from '../types';

type Translations = typeof en;
function makeT(translations: Translations) {
  return (key: string): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
}

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

function formatMessageTime(timestamp: Timestamp | number | string | null | undefined): string {
  if (!timestamp) return '';
  const date = typeof timestamp === 'object' && 'seconds' in timestamp
    ? new Date(timestamp.seconds * 1000)
    : new Date(timestamp);
  return date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false });
}

interface Props {
  chatId: string;
}

export function ChatRoomScreen({ chatId }: Props) {
  const colors = useTheme();
  const font = useAppFont();
  const router = useRouter();
  const language = useSettingsStore((s) => s.language);
  const activeMode = useAuthStore((s) => s.activeMode);
  const t = makeT(language === 'he' ? he : en);
  const currentUserId = auth.currentUser?.uid ?? '';
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const fetchedIdsRef = useRef<Set<string>>(new Set());
  const [chatName, setChatName] = useState<string>('');
  const [chatType, setChatType] = useState<Chat['type'] | null>(null);
  const [chatProjectId, setChatProjectId] = useState<string | undefined>(undefined);
  const [chatOwnerId, setChatOwnerId] = useState<string>('');
  const [manageVisible, setManageVisible] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<{ userId: string; displayName: string }[]>([]);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [chatMembers, setChatMembers] = useState<string[]>([]);
  const { uploading: videoUploading, processing: videoProcessing, uploadVideo } = useVideoUpload();
  const [imageUploading, setImageUploading] = useState(false);
  const mediaActive = videoUploading || videoProcessing || imageUploading;

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
      if (data.ownerId) setChatOwnerId(data.ownerId);
      if (data.members) setChatMembers(data.members as string[]);

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
    if (chatType !== 'community' || currentUserId !== chatOwnerId || !chatOwnerId) return;
    const q = query(
      collection(db, 'chats', chatId, 'joinRequests'),
      where('status', '==', 'pending'),
    );
    return onSnapshot(q, (snap) => {
      setPendingRequests(snap.docs.map((d) => ({
        userId: d.data().userId as string,
        displayName: d.data().displayName as string,
      })));
    });
  }, [chatId, chatType, chatOwnerId, currentUserId]);

  useEffect(() => {
    if (chatType !== 'community' || chatMembers.length === 0) return;
    const missing = chatMembers.filter((uid) => !memberNames[uid]);
    if (missing.length === 0) return;
    Promise.all(
      missing.map(async (uid) => {
        const snap = await getDoc(doc(db, 'users', uid));
        const name = snap.exists() ? (snap.data() as { displayName: string }).displayName : uid;
        return [uid, name] as const;
      }),
    ).then((entries) => setMemberNames((prev) => ({ ...prev, ...Object.fromEntries(entries) })));
  }, [chatMembers, chatType]);

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

  async function handleApproveRequest(userId: string) {
    await updateDoc(doc(db, 'chats', chatId, 'joinRequests', userId), { status: 'approved' });
    await updateDoc(doc(db, 'chats', chatId), { members: arrayUnion(userId) });
  }

  async function handleRejectRequest(userId: string) {
    await updateDoc(doc(db, 'chats', chatId, 'joinRequests', userId), { status: 'rejected' });
  }

  async function handleRemoveMember(userId: string) {
    if (userId === chatOwnerId) return;
    await updateDoc(doc(db, 'chats', chatId), { members: arrayRemove(userId) });
    setChatMembers((prev) => prev.filter((id) => id !== userId));
  }

  async function handleSend() {
    const text = inputText.trim();
    if (!text || !currentUserId) return;
    setInputText('');
    await sendMessage(chatId, currentUserId, text);
  }

  async function handleAttachMedia() {
    if (!currentUserId) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'] as const,
      allowsEditing: false,
      quality: 1,
    });
    if (result.canceled) return;

    const asset = result.assets[0];

    if (asset.type === 'video') {
      const url = await uploadVideo('chat-videos', currentUserId, asset);
      if (url) await sendMessage(chatId, currentUserId, '', { videoUrl: url });
    } else {
      setImageUploading(true);
      try {
        const blob = await fetch(asset.uri).then((r) => r.blob());
        const path = `chat-images/${chatId}/${Date.now()}.jpg`;
        const imageURL = await uploadFile(path, blob);
        await sendMessage(chatId, currentUserId, '', { imageURL });
      } finally {
        setImageUploading(false);
      }
    }
  }

  return (
    <LinearGradient colors={colors.bgGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.container}>
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
    >
      <View style={[styles.header, { backgroundColor: 'transparent', borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.push(`/${activeMode === 'client' ? '(client)' : '(professional)'}/(tabs)/chats`)} style={styles.headerBack} activeOpacity={0.7}>
          <Text style={[styles.headerBackText, { color: colors.accent, fontFamily: font.regular }]}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          {chatType === 'group' && chatProjectId ? (
            <TouchableOpacity
              style={styles.headerNameTouchable}
              onPress={() => router.push(`/(client)/(tabs)/chat/project-details?projectId=${chatProjectId}`)}
              activeOpacity={0.8}
            >
              <Text style={[styles.headerName, { color: '#ffffff', fontFamily: font.bold }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.4}>
                {chatName}
              </Text>
            </TouchableOpacity>
          ) : (
            <Text style={[styles.headerName, { color: '#ffffff', fontFamily: font.bold }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.4}>
              {chatName}
            </Text>
          )}
        </View>
        <View style={[styles.headerRight, { alignItems: 'center', justifyContent: 'center' }]}>
          {chatType === 'community' && currentUserId === chatOwnerId && (
            <TouchableOpacity onPress={() => setManageVisible(true)} style={{ padding: 8 }}>
              <Text style={{ color: colors.accent, fontFamily: font.semiBold, fontSize: 13 }}>
                {t('communities.manage')}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={{ zIndex: 2 }}>
        <PurchaseBanner chatId={chatId} />
      </View>

      <View style={{ flex: 1, zIndex: 0 }}>
      <FlatList
        data={[...messages].reverse()}
        keyExtractor={(item) => item.id}
        inverted
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const isOwn = item.senderId === currentUserId;
          return (
            <View style={[styles.bubbleWrapper, isOwn ? styles.wrapperOwn : styles.wrapperPeer]}>
              {item.videoUrl ? (
                <View style={styles.mediaBubble}>
                  {!isOwn && (
                    <Text style={[styles.senderName, { color: colorForUser(item.senderId), fontFamily: font.regular }]}>
                      {userNames[item.senderId] ?? 'Loading...'}
                    </Text>
                  )}
                  <VideoPlayer uri={item.videoUrl} style={styles.mediaMessage} />
                  <Text style={[styles.messageTime, { color: isOwn ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.4)' }]}>
                    {formatMessageTime(item.timestamp)}
                  </Text>
                </View>
              ) : item.imageURL ? (
                <View style={styles.mediaBubble}>
                  {!isOwn && (
                    <Text style={[styles.senderName, { color: colorForUser(item.senderId), fontFamily: font.regular }]}>
                      {userNames[item.senderId] ?? 'Loading...'}
                    </Text>
                  )}
                  <Image source={{ uri: item.imageURL }} style={styles.mediaMessage} resizeMode="cover" />
                  <Text style={[styles.messageTime, { color: isOwn ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.4)' }]}>
                    {formatMessageTime(item.timestamp)}
                  </Text>
                </View>
              ) : (
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
                  <Text style={[styles.messageTime, { color: isOwn ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.4)' }]}>
                    {formatMessageTime(item.timestamp)}
                  </Text>
                </View>
              )}
            </View>
          );
        }}
      />
      </View>
      <View style={[styles.inputRow, { borderTopColor: colors.border, backgroundColor: 'transparent' }]}>
        {mediaActive ? (
          <View style={styles.mediaSendingRow}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={[styles.mediaSendingText, { color: colors.textMuted, fontFamily: font.regular }]}>
              {videoUploading || videoProcessing ? t('media.send_video') : t('chats.sending_image')}
            </Text>
          </View>
        ) : (
          <>
            <TouchableOpacity
              style={styles.attachBtn}
              onPress={handleAttachMedia}
              activeOpacity={0.7}
            >
              <Paperclip size={22} color={colors.accent} strokeWidth={1.5} />
            </TouchableOpacity>
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
          </>
        )}
      </View>
    </KeyboardAvoidingView>
      <Modal visible={manageVisible} transparent animationType="fade" onRequestClose={() => setManageVisible(false)}>
        <TouchableOpacity style={manageStyles.overlay} activeOpacity={1} onPress={() => setManageVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={{ width: '90%', maxHeight: '80%' }}>
            <LinearGradient colors={['#1a237e', '#004aad']} style={manageStyles.modal}>
              <View style={manageStyles.modalHeader}>
                <Text style={[manageStyles.modalTitle, { fontFamily: font.bold }]}>
                  {t('communities.manage')}
                </Text>
                <TouchableOpacity onPress={() => setManageVisible(false)}>
                  <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 22 }}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Pending Requests */}
                <Text style={[manageStyles.sectionTitle, { fontFamily: font.semiBold }]}>
                  {t('communities.pending_requests')} ({pendingRequests.length})
                </Text>
                {pendingRequests.length === 0 ? (
                  <Text style={[manageStyles.emptyText, { fontFamily: font.regular }]}>—</Text>
                ) : (
                  pendingRequests.map((req) => (
                    <View key={req.userId} style={manageStyles.requestRow}>
                      <Text style={[manageStyles.requestName, { fontFamily: font.regular }]} numberOfLines={1}>
                        {req.displayName}
                      </Text>
                      <TouchableOpacity
                        style={[manageStyles.actionBtn, { backgroundColor: '#16a34a' }]}
                        onPress={() => handleApproveRequest(req.userId)}
                      >
                        <Text style={[manageStyles.actionBtnText, { fontFamily: font.semiBold }]}>
                          {t('communities.approve')}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[manageStyles.actionBtn, { backgroundColor: '#dc2626' }]}
                        onPress={() => handleRejectRequest(req.userId)}
                      >
                        <Text style={[manageStyles.actionBtnText, { fontFamily: font.semiBold }]}>
                          {t('communities.reject')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))
                )}

                {/* Members */}
                <Text style={[manageStyles.sectionTitle, { fontFamily: font.semiBold, marginTop: 20 }]}>
                  {t('communities.members')} ({chatMembers.length})
                </Text>
                {chatMembers.map((uid) => (
                  <View key={uid} style={manageStyles.memberRow}>
                    <View style={manageStyles.memberAvatar}>
                      <Text style={[manageStyles.memberInitial, { fontFamily: font.bold }]}>
                        {(memberNames[uid] ?? uid).charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={[manageStyles.memberName, { fontFamily: font.regular }]} numberOfLines={1}>
                      {memberNames[uid] ?? uid}
                      {uid === chatOwnerId ? ' ★' : ''}
                    </Text>
                    {uid !== chatOwnerId && (
                      <TouchableOpacity onPress={() => handleRemoveMember(uid)} style={{ padding: 4 }}>
                        <Text style={{ color: '#dc2626', fontSize: 18 }}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                <View style={{ height: 16 }} />
              </ScrollView>
            </LinearGradient>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
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
  headerNameTouchable: {
    width: '100%',
  },
  headerName: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    width: '100%',
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
  messageTime: {
    fontSize: 10,
    textAlign: 'left',
    marginTop: 2,
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
  attachBtn: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaBubble: {
    maxWidth: '75%',
  },
  mediaMessage: {
    width: 240,
    height: 135,
    borderRadius: 12,
    overflow: 'hidden',
  },
  mediaSendingRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  mediaSendingText: {
    fontSize: 14,
  },
});

const manageStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center',
  },
  modal: { borderRadius: 24, padding: 24 },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  sectionTitle: {
    color: 'rgba(255,255,255,0.7)', fontSize: 12,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10,
  },
  emptyText: { color: 'rgba(255,255,255,0.4)', fontSize: 13, marginBottom: 8 },
  requestRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  requestName: { flex: 1, color: '#fff', fontSize: 14 },
  actionBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  actionBtnText: { color: '#fff', fontSize: 12 },
  memberRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 10, marginBottom: 10,
  },
  memberAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  memberInitial: { color: '#fff', fontSize: 14 },
  memberName: { flex: 1, color: '#fff', fontSize: 14 },
});
