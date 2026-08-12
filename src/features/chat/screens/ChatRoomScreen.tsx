import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import { initialWindowMetrics } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

const TOP_INSET = initialWindowMetrics?.insets.top ?? 0;
import {
  getDoc, updateDoc, doc, Timestamp,
  collection, onSnapshot, query, where,
  arrayUnion, arrayRemove, addDoc, serverTimestamp,
  orderBy, deleteDoc,
} from 'firebase/firestore';
import { useRouter } from 'expo-router';
import { Plus, Camera, CheckSquare, Calendar, Paperclip, Mic, Play, Pause } from 'lucide-react-native';
import { AppText } from '@components/ui/AppText';
import { useTheme } from '@core/hooks/useTheme';
import { useAppFont } from '@core/hooks/useAppFont';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAuthStore } from '@core/stores/authStore';
import { useVideoUpload } from '@core/hooks/useVideoUpload';
import { VideoPlayer } from '@components/ui/VideoPlayer';
import { uploadFile } from '@core/firebase/storage';
import { auth, db } from '@core/firebase/config';
import { listenToMessages, sendMessage } from '../services/chatService';
import { addMission } from '../services/missionService';
import { addMeeting } from '../services/meetingService';
import { MiniCalendar } from '@features/crew/components';
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

type Channel = {
  id: string;
  name: string;
  createdAt: Timestamp | null;
  createdBy: string;
  lastMessage: { text: string; senderId: string; timestamp: Timestamp } | null;
};

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
  const rtl = language === 'he';
  const currentUserId = auth.currentUser?.uid ?? '';

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const fetchedIdsRef = useRef<Set<string>>(new Set());
  const flatListRef = useRef<FlatList>(null);
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
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Channel state
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string>('');
  const [newChannelName, setNewChannelName] = useState('');
  const [addingChannel, setAddingChannel] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardWillHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // + action menu
  const [menuOpen, setMenuOpen] = useState(false);
  const menuAnim = useRef(new Animated.Value(0)).current;

  function openMenu() {
    setMenuOpen(true);
    Animated.timing(menuAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start();
  }
  function closeMenu() {
    Animated.timing(menuAnim, { toValue: 0, duration: 100, useNativeDriver: true }).start(() => setMenuOpen(false));
  }

  // Mission form state
  const [showAddMission, setShowAddMission] = useState(false);
  const [newMissionTitle, setNewMissionTitle] = useState('');
  const [newMissionAssignedTo, setNewMissionAssignedTo] = useState<string[]>([]);
  const [newMissionDueDate, setNewMissionDueDate] = useState('');
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);
  const [isAddingMission, setIsAddingMission] = useState(false);

  // Meeting form state
  const [showAddMeeting, setShowAddMeeting] = useState(false);
  const [newMeetingTitle, setNewMeetingTitle] = useState('');
  const [newMeetingDate, setNewMeetingDate] = useState('');
  const [newMeetingTime, setNewMeetingTime] = useState('');
  const [newMeetingLocation, setNewMeetingLocation] = useState('');
  const [newMeetingInvitedIds, setNewMeetingInvitedIds] = useState<string[]>([]);
  const [showMeetingDatePicker, setShowMeetingDatePicker] = useState(false);
  const [isAddingMeeting, setIsAddingMeeting] = useState(false);

  const assignableMembers = chatMembers
    .filter(id => id !== currentUserId)
    .map(id => ({ id, displayName: memberNames[id] ?? id }));

  function formatDueDate(iso: string, prefix: string): string {
    const d = new Date(iso);
    return `${prefix}${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }
  function toggleAssignee(id: string) {
    setNewMissionAssignedTo(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
  function toggleInvitee(id: string) {
    setNewMeetingInvitedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  // Voice recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (isRecording) {
      pulseLoopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.2, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      pulseLoopRef.current.start();
    } else {
      pulseLoopRef.current?.stop();
      pulseAnim.setValue(1);
    }
  }, [isRecording]);

  // Playback
  const [playingId, setPlayingId] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  function formatRecordingTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // Fetch chat metadata
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

  // Clear unread count
  useEffect(() => {
    if (!currentUserId) return;
    updateDoc(doc(db, 'chats', chatId), {
      [`unreadCount.${currentUserId}`]: 0,
    }).catch(() => {});
  }, [chatId, currentUserId]);

  // Non-community messages listener
  useEffect(() => {
    if (chatType === null || chatType === 'community') return;
    return listenToMessages(chatId, setMessages);
  }, [chatId, chatType]);

  // Community: listen to channels subcollection, create General if empty
  useEffect(() => {
    if (chatType !== 'community') return;
    const q = query(
      collection(db, 'chats', chatId, 'channels'),
      orderBy('createdAt', 'asc'),
    );
    return onSnapshot(q, (snap) => {
      if (snap.empty && currentUserId) {
        addDoc(collection(db, 'chats', chatId, 'channels'), {
          name: t('community.default_channel'),
          createdAt: serverTimestamp(),
          createdBy: currentUserId,
          lastMessage: null,
        });
        return;
      }
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Channel));
      setChannels(list);
      setActiveChannelId((prev) => {
        if (prev && list.some((c) => c.id === prev)) return prev;
        return list[0]?.id ?? '';
      });
    });
  }, [chatId, chatType]);

  // Community: listen to active channel messages
  useEffect(() => {
    if (chatType !== 'community' || !activeChannelId) return;
    const q = query(
      collection(db, 'chats', chatId, 'channels', activeChannelId, 'messages'),
      orderBy('timestamp', 'asc'),
    );
    return onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          senderId: data.senderId as string,
          text: (data.text as string) ?? '',
          timestamp: data.timestamp as Timestamp,
          readBy: (data.readBy as string[]) ?? [],
          imageURL: data.imageURL as string | undefined,
          videoUrl: data.videoUrl as string | undefined,
        } satisfies Message;
      }));
    });
  }, [chatId, chatType, activeChannelId]);

  // Join request listener (owner only)
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

  // Member display names
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

  // Sender display names
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

  useEffect(() => {
    if (messages.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: false });
    }
  }, [messages.length]);

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

  async function handleAddChannel() {
    const name = newChannelName.trim();
    if (!name || !currentUserId) return;
    await addDoc(collection(db, 'chats', chatId, 'channels'), {
      name,
      createdAt: serverTimestamp(),
      createdBy: currentUserId,
      lastMessage: null,
    });
    setNewChannelName('');
    setAddingChannel(false);
  }

  function handleDeleteChannel(channelId: string, channelName: string) {
    Alert.alert(t('community.delete_channel'), channelName, [
      { text: t('communities.reject'), style: 'cancel' },
      {
        text: '✕',
        style: 'destructive',
        onPress: async () => {
          await deleteDoc(doc(db, 'chats', chatId, 'channels', channelId));
          if (activeChannelId === channelId) {
            const remaining = channels.filter((c) => c.id !== channelId);
            setActiveChannelId(remaining[0]?.id ?? '');
          }
        },
      },
    ]);
  }

  async function handleSend() {
    const text = inputText.trim();
    if (!text || !currentUserId) return;
    setInputText('');
    if (chatType === 'community' && activeChannelId) {
      await addDoc(
        collection(db, 'chats', chatId, 'channels', activeChannelId, 'messages'),
        { senderId: currentUserId, text, timestamp: serverTimestamp(), readBy: [currentUserId] },
      );
      await updateDoc(doc(db, 'chats', chatId, 'channels', activeChannelId), {
        lastMessage: { text, senderId: currentUserId, timestamp: serverTimestamp() },
      });
    } else {
      await sendMessage(chatId, currentUserId, text);
    }
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

    if (chatType === 'community' && activeChannelId) {
      const msgRef = collection(db, 'chats', chatId, 'channels', activeChannelId, 'messages');
      if (asset.type === 'video') {
        const url = await uploadVideo('chat-videos', currentUserId, asset);
        if (url) {
          await addDoc(msgRef, { senderId: currentUserId, text: '', timestamp: serverTimestamp(), readBy: [currentUserId], videoUrl: url });
        }
      } else {
        setImageUploading(true);
        try {
          const blob = await fetch(asset.uri).then((r) => r.blob());
          const path = `chat-images/${chatId}/${Date.now()}.jpg`;
          const imageURL = await uploadFile(path, blob);
          await addDoc(msgRef, { senderId: currentUserId, text: '', timestamp: serverTimestamp(), readBy: [currentUserId], imageURL });
        } finally {
          setImageUploading(false);
        }
      }
    } else {
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
  }

  async function handleAttachCamera() {
    if (!currentUserId) return;
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'] as const, quality: 1 });
    if (result.canceled) return;
    const asset = result.assets[0];
    setImageUploading(true);
    try {
      const blob = await fetch(asset.uri).then(r => r.blob());
      const path = `chat-images/${chatId}/${Date.now()}.jpg`;
      const imageURL = await uploadFile(path, blob);
      if (chatType === 'community' && activeChannelId) {
        const msgRef = collection(db, 'chats', chatId, 'channels', activeChannelId, 'messages');
        await addDoc(msgRef, { senderId: currentUserId, text: '', timestamp: serverTimestamp(), readBy: [currentUserId], imageURL });
      } else {
        await sendMessage(chatId, currentUserId, '', { imageURL });
      }
    } finally {
      setImageUploading(false);
    }
  }

  async function handleAddMission() {
    if (!chatProjectId || !newMissionTitle.trim() || newMissionAssignedTo.length === 0) return;
    setIsAddingMission(true);
    try {
      await addMission(chatProjectId, currentUserId, {
        title: newMissionTitle.trim(),
        assignedTo: newMissionAssignedTo,
        dueDate: newMissionDueDate || undefined,
      });
      setNewMissionTitle(''); setNewMissionAssignedTo([]); setNewMissionDueDate('');
      setShowAddMission(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Error', msg || t('project_details.error_add_mission'));
    } finally {
      setIsAddingMission(false);
    }
  }

  async function handleAddMeeting() {
    if (!chatProjectId || !newMeetingTitle.trim() || !newMeetingDate || !newMeetingTime.trim() || !newMeetingLocation.trim() || newMeetingInvitedIds.length === 0) return;
    setIsAddingMeeting(true);
    try {
      await addMeeting(chatProjectId, currentUserId, {
        title: newMeetingTitle.trim(), date: newMeetingDate, time: newMeetingTime.trim(),
        location: newMeetingLocation.trim(), invitedIds: newMeetingInvitedIds,
      });
      setNewMeetingTitle(''); setNewMeetingDate(''); setNewMeetingTime('');
      setNewMeetingLocation(''); setNewMeetingInvitedIds([]);
      setShowAddMeeting(false);
    } catch {
      Alert.alert('Error', t('project_details.error_add_meeting'));
    } finally {
      setIsAddingMeeting(false);
    }
  }

  async function startRecording() {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') return;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => setRecordingDuration(d => d + 1), 1000);
    } catch {
      setIsRecording(false);
    }
  }

  async function stopAndSendRecording() {
    if (!recordingRef.current || !isRecording) return;
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
    const duration = recordingDuration;
    const rec = recordingRef.current;
    recordingRef.current = null;
    setIsRecording(false);
    setRecordingDuration(0);
    try {
      await rec.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = rec.getURI();
      if (!uri || !currentUserId) return;
      const blob = await fetch(uri).then(r => r.blob());
      const path = `chat-audio/${chatId}/${Date.now()}-${currentUserId}.m4a`;
      const audioUrl = await uploadFile(path, blob);
      await sendMessage(chatId, currentUserId, '', { audioUrl, audioDuration: duration });
    } catch (e) {
      console.error('[voiceRecord] send failed:', e);
    }
  }

  function cancelRecording() {
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
    recordingRef.current?.stopAndUnloadAsync().catch(() => {});
    Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
    recordingRef.current = null;
    setIsRecording(false);
    setRecordingDuration(0);
  }

  async function togglePlayback(messageId: string, audioUrl: string) {
    if (playingId === messageId) {
      await soundRef.current?.pauseAsync();
      setPlayingId(null);
    } else {
      await soundRef.current?.stopAsync().catch(() => {});
      await soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
      const { sound } = await Audio.Sound.createAsync({ uri: audioUrl }, { shouldPlay: true });
      soundRef.current = sound;
      setPlayingId(messageId);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setPlayingId(null);
          soundRef.current = null;
        }
      });
    }
  }

  const isGeneralChannel = (name: string) =>
    name === 'כללי' || name === 'General' || name === t('community.default_channel');

  return (
    <LinearGradient colors={colors.bgGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.container}>
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: '#ffffff', borderBottomColor: colors.border, paddingTop: TOP_INSET + 8 }]}>
        <TouchableOpacity onPress={() => router.push(`/${activeMode === 'client' ? '(client)' : '(professional)'}/(tabs)/chats`)} style={styles.headerBack} activeOpacity={0.7}>
          <Text style={[styles.headerBackText, { color: colors.accent, ...font.regular }]}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          {chatType === 'group' && chatProjectId ? (
            <TouchableOpacity
              style={styles.headerNameTouchable}
              onPress={() => router.push(`/(client)/(tabs)/chat/project-details?projectId=${chatProjectId}`)}
              activeOpacity={0.8}
            >
              <AppText weight="bold" style={[styles.headerName, { color: '#004aad' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.4}>
                {chatName}
              </AppText>
            </TouchableOpacity>
          ) : (
            <AppText weight="bold" style={[styles.headerName, { color: '#004aad' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.4}>
              {chatName}
            </AppText>
          )}
        </View>
        <View style={[styles.headerRight, { alignItems: 'center', justifyContent: 'center' }]}>
          {chatType === 'community' && currentUserId === chatOwnerId && (
            <TouchableOpacity onPress={() => setManageVisible(true)} style={{ padding: 8 }}>
              <AppText weight="semiBold" style={{ color: colors.accent, fontSize: 13 }}>
                {t('communities.manage')}
              </AppText>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Channel tab bar (community only) */}
      {chatType === 'community' && channels.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.channelBar}
          contentContainerStyle={[styles.channelBarContent, { flexDirection: rtl ? 'row-reverse' : 'row' }]}
        >
          {channels.map((ch) => {
            const isActive = activeChannelId === ch.id;
            return (
              <TouchableOpacity
                key={ch.id}
                style={[styles.channelPill, isActive && styles.channelPillActive]}
                onPress={() => setActiveChannelId(ch.id)}
                activeOpacity={0.7}
              >
                <AppText weight={isActive ? 'semiBold' : 'regular'} style={[styles.channelPillText, isActive && styles.channelPillTextActive]}>
                  # {ch.name}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {!bannerDismissed && (
        <View style={{ zIndex: 2 }}>
          <PurchaseBanner chatId={chatId} onDismiss={() => setBannerDismissed(true)} />
        </View>
      )}

      {/* Messages */}
      <View style={{ flex: 1, zIndex: 0 }}>
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const isOwn = item.senderId === currentUserId;
            return (
              <View style={[styles.bubbleWrapper, isOwn ? styles.wrapperOwn : styles.wrapperPeer]}>
                {item.videoUrl ? (
                  <View style={styles.mediaBubble}>
                    {!isOwn && (
                      <AppText weight="regular" style={[styles.senderName, { color: colorForUser(item.senderId) }]}>
                        {userNames[item.senderId] ?? 'Loading...'}
                      </AppText>
                    )}
                    <VideoPlayer uri={item.videoUrl} style={styles.mediaMessage} />
                    <Text style={[styles.messageTime, { color: isOwn ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.4)' }]}>
                      {formatMessageTime(item.timestamp)}
                    </Text>
                  </View>
                ) : item.imageURL ? (
                  <View style={styles.mediaBubble}>
                    {!isOwn && (
                      <AppText weight="regular" style={[styles.senderName, { color: colorForUser(item.senderId) }]}>
                        {userNames[item.senderId] ?? 'Loading...'}
                      </AppText>
                    )}
                    <Image source={{ uri: item.imageURL }} style={styles.mediaMessage} resizeMode="cover" />
                    <Text style={[styles.messageTime, { color: isOwn ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.4)' }]}>
                      {formatMessageTime(item.timestamp)}
                    </Text>
                  </View>
                ) : item.audioUrl ? (
                  <View style={[styles.bubble, isOwn ? { backgroundColor: colors.accent } : { backgroundColor: '#ffffff' }]}>
                    {!isOwn && (
                      <AppText weight="regular" style={[styles.senderName, { color: colorForUser(item.senderId) }]}>
                        {userNames[item.senderId] ?? 'Loading...'}
                      </AppText>
                    )}
                    <View style={chatStyles.audioBubble}>
                      <TouchableOpacity onPress={() => togglePlayback(item.id, item.audioUrl!)} activeOpacity={0.7} style={chatStyles.audioPlayBtn}>
                        {playingId === item.id
                          ? <Pause size={18} color={isOwn ? '#ffffff' : '#004aad'} strokeWidth={1.5} />
                          : <Play size={18} color={isOwn ? '#ffffff' : '#004aad'} strokeWidth={1.5} />}
                      </TouchableOpacity>
                      <Text style={[chatStyles.audioDurationText, { color: isOwn ? 'rgba(255,255,255,0.85)' : '#004aad' }]}>
                        {formatRecordingTime(item.audioDuration ?? 0)}
                      </Text>
                    </View>
                    <Text style={[styles.messageTime, { color: isOwn ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.4)' }]}>
                      {formatMessageTime(item.timestamp)}
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.bubble, isOwn ? { backgroundColor: colors.accent } : { backgroundColor: '#ffffff' }]}>
                    {!isOwn && (
                      <AppText weight="regular" style={[styles.senderName, { color: colorForUser(item.senderId) }]}>
                        {userNames[item.senderId] ?? 'Loading...'}
                      </AppText>
                    )}
                    <AppText weight="regular" style={[styles.messageText, { color: isOwn ? '#fff' : colors.text }]}>
                      {item.text}
                    </AppText>
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

      {/* + Action bar — inline, above input, moves with keyboard */}
      {menuOpen && (
        <Animated.View
          style={[
            chatStyles.menuSheet,
            {
              borderTopColor: colors.border,
              backgroundColor: colors.card,
              opacity: menuAnim,
              transform: [{ translateY: menuAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
            },
          ]}
        >
          <TouchableOpacity style={chatStyles.menuItem} onPress={() => { closeMenu(); handleAttachMedia(); }} activeOpacity={0.7}>
            <View style={chatStyles.menuItemIcon}><Paperclip size={22} color="#004aad" strokeWidth={1.5} /></View>
            <AppText weight="regular" style={chatStyles.menuItemLabel}>{t('chats.add_media')}</AppText>
          </TouchableOpacity>
          <TouchableOpacity style={chatStyles.menuItem} onPress={() => { closeMenu(); handleAttachCamera(); }} activeOpacity={0.7}>
            <View style={chatStyles.menuItemIcon}><Camera size={22} color="#004aad" strokeWidth={1.5} /></View>
            <AppText weight="regular" style={chatStyles.menuItemLabel}>{t('chats.take_photo')}</AppText>
          </TouchableOpacity>
          {chatProjectId && (
            <TouchableOpacity style={chatStyles.menuItem} onPress={() => { closeMenu(); setShowAddMission(true); }} activeOpacity={0.7}>
              <View style={chatStyles.menuItemIcon}><CheckSquare size={22} color="#004aad" strokeWidth={1.5} /></View>
              <AppText weight="regular" style={chatStyles.menuItemLabel}>{t('chats.add_task')}</AppText>
            </TouchableOpacity>
          )}
          {chatProjectId && (
            <TouchableOpacity style={chatStyles.menuItem} onPress={() => { closeMenu(); setShowAddMeeting(true); }} activeOpacity={0.7}>
              <View style={chatStyles.menuItemIcon}><Calendar size={22} color="#004aad" strokeWidth={1.5} /></View>
              <AppText weight="regular" style={chatStyles.menuItemLabel}>{t('chats.add_meeting')}</AppText>
            </TouchableOpacity>
          )}
        </Animated.View>
      )}

      {/* Recording bar — shown while recording, replaces input row */}
      {isRecording && (
        <View style={[chatStyles.recordingBar, { borderTopColor: colors.border, backgroundColor: colors.card }]}>
          <Animated.View style={[chatStyles.recordingDot, { opacity: pulseAnim }]} />
          <AppText weight="semiBold" style={chatStyles.recordingTimer}>{formatRecordingTime(recordingDuration)}</AppText>
          <AppText weight="regular" style={[chatStyles.recordingHint, { color: colors.textMuted }]}>Hold to record, release to send</AppText>
          <TouchableOpacity onPress={cancelRecording} activeOpacity={0.7} hitSlop={10}>
            <AppText weight="semiBold" style={chatStyles.recordingCancel}>Cancel</AppText>
          </TouchableOpacity>
        </View>
      )}

      {/* Input */}
      {!isRecording && (
        <View style={[styles.inputRow, { borderTopColor: colors.border, backgroundColor: 'transparent', paddingBottom: keyboardVisible ? 10 : 90 }]}>
          {mediaActive ? (
            <View style={styles.mediaSendingRow}>
              <ActivityIndicator size="small" color={colors.accent} />
              <AppText weight="regular" style={[styles.mediaSendingText, { color: colors.textMuted }]}>
                {videoUploading || videoProcessing ? t('media.send_video') : t('chats.sending_image')}
              </AppText>
            </View>
          ) : (
            <>
              <TouchableOpacity style={styles.attachBtn} onPress={menuOpen ? closeMenu : openMenu} activeOpacity={0.7}>
                <Plus size={24} color={menuOpen ? colors.text : colors.accent} strokeWidth={2} />
              </TouchableOpacity>
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text, ...font.regular }]}
                value={inputText}
                onChangeText={setInputText}
                placeholder="Message..."
                placeholderTextColor={colors.placeholder}
                multiline
                returnKeyType="default"
              />
              {inputText.trim() ? (
                <TouchableOpacity
                  style={[styles.sendButton, { backgroundColor: colors.accent }]}
                  onPress={handleSend}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.sendLabel, { ...font.semiBold }]}>Send</Text>
                </TouchableOpacity>
              ) : (
                <Pressable
                  style={[styles.sendButton, { backgroundColor: colors.accent }]}
                  onLongPress={startRecording}
                  onPressOut={() => { if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; } if (isRecording) stopAndSendRecording(); }}
                  delayLongPress={400}
                >
                  <Mic size={20} color="#fff" strokeWidth={1.5} />
                </Pressable>
              )}
            </>
          )}
        </View>
      )}
    </KeyboardAvoidingView>

    {/* Add Mission Modal */}
    <Modal visible={showAddMission} transparent animationType="slide" onRequestClose={() => setShowAddMission(false)}>
      <View style={chatStyles.modalOverlay}>
        <View style={[chatStyles.modalSheet, { backgroundColor: colors.card }]}>
          <Text style={[chatStyles.modalTitle, { color: '#004aad', textAlign: rtl ? 'right' : 'left', ...font.bold }]}>
            {t('project_details.add_mission_title')}
          </Text>
          <Text style={[chatStyles.missionInputLabel, { color: '#004aad99', textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>
            {t('project_details.mission_title')}
          </Text>
          <TextInput
            style={[chatStyles.missionInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: '#004aad', textAlign: rtl ? 'right' : 'left', ...font.regular }]}
            value={newMissionTitle}
            onChangeText={setNewMissionTitle}
            placeholder={t('project_details.mission_placeholder')}
            placeholderTextColor={colors.textMuted}
          />
          <Text style={[chatStyles.missionInputLabel, { color: '#004aad99', textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>
            {t('project_details.assign_to')}
          </Text>
          {assignableMembers.map((m) => {
            const selected = newMissionAssignedTo.includes(m.id);
            return (
              <TouchableOpacity
                key={m.id}
                style={[chatStyles.missionAssignRow, { borderColor: selected ? '#004aad' : colors.border }, selected && chatStyles.missionAssignRowSelected]}
                onPress={() => toggleAssignee(m.id)}
                activeOpacity={0.8}
              >
                <Text style={[chatStyles.missionAssignName, { color: '#004aad', textAlign: rtl ? 'right' : 'left', ...font.medium }]}>{m.displayName}</Text>
                <View style={[chatStyles.missionCheckbox, { borderColor: selected ? '#004aad' : colors.border, backgroundColor: selected ? '#004aad' : 'transparent' }]}>
                  {selected && <Text style={[chatStyles.missionCheckboxTick, { ...font.bold }]}>✓</Text>}
                </View>
              </TouchableOpacity>
            );
          })}
          <Text style={[chatStyles.missionInputLabel, { color: '#004aad99', textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>
            {t('project_details.due_date')}
          </Text>
          {newMissionDueDate ? (
            <View style={[chatStyles.missionDateRow, { borderColor: '#004aad', backgroundColor: '#004aad18' }]}>
              <Calendar size={15} color="#004aad" strokeWidth={2} />
              <Text style={[chatStyles.missionDateText, { color: '#004aad', textAlign: rtl ? 'right' : 'left', ...font.medium }]}>
                {formatDueDate(newMissionDueDate, t('project_details.due'))}
              </Text>
              <TouchableOpacity onPress={() => setNewMissionDueDate('')} hitSlop={10} activeOpacity={0.7}>
                <Text style={[chatStyles.missionDateClear, { ...font.bold }]}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={[chatStyles.missionDateRow, { borderColor: colors.border }]} onPress={() => setShowDueDatePicker(true)} activeOpacity={0.8}>
              <Calendar size={15} color={colors.textMuted} strokeWidth={2} />
              <Text style={[chatStyles.missionDatePlaceholder, { color: '#004aad99', textAlign: rtl ? 'right' : 'left', ...font.regular }]}>
                {t('project_details.add_due_date')}
              </Text>
            </TouchableOpacity>
          )}
          <View style={chatStyles.modalActions}>
            <TouchableOpacity style={[chatStyles.modalBtn, chatStyles.modalBtnCancel, { borderColor: colors.border }]} onPress={() => setShowAddMission(false)} activeOpacity={0.8}>
              <Text style={[chatStyles.modalBtnCancelText, { color: '#004aad', ...font.semiBold }]}>{t('project_details.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[chatStyles.modalBtn, chatStyles.modalBtnConfirm, (!newMissionTitle.trim() || newMissionAssignedTo.length === 0 || isAddingMission) && chatStyles.completeBtnDisabled]}
              onPress={handleAddMission}
              disabled={!newMissionTitle.trim() || newMissionAssignedTo.length === 0 || isAddingMission}
              activeOpacity={0.8}
            >
              {isAddingMission ? <ActivityIndicator color="#fff" size="small" /> : <Text style={[chatStyles.modalBtnConfirmText, { ...font.bold }]}>{t('project_details.add')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
    {showDueDatePicker && (
      <MiniCalendar
        value={newMissionDueDate}
        onSelect={(iso) => { setNewMissionDueDate(iso); setShowDueDatePicker(false); }}
        onClose={() => setShowDueDatePicker(false)}
      />
    )}

    {/* Add Meeting Modal */}
    <Modal visible={showAddMeeting} transparent animationType="slide" onRequestClose={() => setShowAddMeeting(false)}>
      <View style={chatStyles.modalOverlay}>
        <View style={[chatStyles.modalSheet, { backgroundColor: colors.card }]}>
          <Text style={[chatStyles.modalTitle, { color: '#004aad', textAlign: rtl ? 'right' : 'left', ...font.bold }]}>
            {t('project_details.add_meeting_title')}
          </Text>
          <Text style={[chatStyles.missionInputLabel, { color: '#004aad99', textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>
            {t('project_details.meeting_title_label')}
          </Text>
          <TextInput
            style={[chatStyles.missionInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: '#004aad', textAlign: rtl ? 'right' : 'left', ...font.regular }]}
            value={newMeetingTitle}
            onChangeText={setNewMeetingTitle}
            placeholder={t('project_details.meeting_title_placeholder')}
            placeholderTextColor={colors.textMuted}
          />
          <Text style={[chatStyles.missionInputLabel, { color: '#004aad99', textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>
            {t('project_details.meeting_date')}
          </Text>
          {newMeetingDate ? (
            <View style={[chatStyles.missionDateRow, { borderColor: '#004aad', backgroundColor: '#004aad18' }]}>
              <Calendar size={15} color="#004aad" strokeWidth={2} />
              <Text style={[chatStyles.missionDateText, { color: '#004aad', textAlign: rtl ? 'right' : 'left', ...font.medium }]}>
                {formatDueDate(newMeetingDate, '')}
              </Text>
              <TouchableOpacity onPress={() => setNewMeetingDate('')} hitSlop={10} activeOpacity={0.7}>
                <Text style={[chatStyles.missionDateClear, { ...font.bold }]}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={[chatStyles.missionDateRow, { borderColor: colors.border }]} onPress={() => setShowMeetingDatePicker(true)} activeOpacity={0.8}>
              <Calendar size={15} color={colors.textMuted} strokeWidth={2} />
              <Text style={[chatStyles.missionDatePlaceholder, { color: '#004aad99', textAlign: rtl ? 'right' : 'left', ...font.regular }]}>
                {t('project_details.meeting_date')}
              </Text>
            </TouchableOpacity>
          )}
          <Text style={[chatStyles.missionInputLabel, { color: '#004aad99', textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>
            {t('project_details.meeting_time')}
          </Text>
          <TextInput
            style={[chatStyles.missionInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: '#004aad', textAlign: rtl ? 'right' : 'left', ...font.regular }]}
            value={newMeetingTime}
            onChangeText={setNewMeetingTime}
            placeholder={t('project_details.meeting_time_placeholder')}
            placeholderTextColor={colors.textMuted}
            keyboardType="numbers-and-punctuation"
          />
          <Text style={[chatStyles.missionInputLabel, { color: '#004aad99', textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>
            {t('project_details.meeting_location')}
          </Text>
          <TextInput
            style={[chatStyles.missionInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: '#004aad', textAlign: rtl ? 'right' : 'left', ...font.regular }]}
            value={newMeetingLocation}
            onChangeText={setNewMeetingLocation}
            placeholder={t('project_details.meeting_location_placeholder')}
            placeholderTextColor={colors.textMuted}
          />
          <Text style={[chatStyles.missionInputLabel, { color: '#004aad99', textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>
            {t('project_details.meeting_invitees')}
          </Text>
          {assignableMembers.map((m) => {
            const selected = newMeetingInvitedIds.includes(m.id);
            return (
              <TouchableOpacity
                key={m.id}
                style={[chatStyles.missionAssignRow, { borderColor: selected ? '#004aad' : colors.border }, selected && chatStyles.missionAssignRowSelected]}
                onPress={() => toggleInvitee(m.id)}
                activeOpacity={0.8}
              >
                <Text style={[chatStyles.missionAssignName, { color: '#004aad', textAlign: rtl ? 'right' : 'left', ...font.medium }]}>{m.displayName}</Text>
                <View style={[chatStyles.missionCheckbox, { borderColor: selected ? '#004aad' : colors.border, backgroundColor: selected ? '#004aad' : 'transparent' }]}>
                  {selected && <Text style={[chatStyles.missionCheckboxTick, { ...font.bold }]}>✓</Text>}
                </View>
              </TouchableOpacity>
            );
          })}
          <View style={chatStyles.modalActions}>
            <TouchableOpacity style={[chatStyles.modalBtn, chatStyles.modalBtnCancel, { borderColor: colors.border }]} onPress={() => setShowAddMeeting(false)} activeOpacity={0.8}>
              <Text style={[chatStyles.modalBtnCancelText, { color: '#004aad', ...font.semiBold }]}>{t('project_details.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[chatStyles.modalBtn, chatStyles.modalBtnConfirm, (!newMeetingTitle.trim() || !newMeetingDate || !newMeetingTime.trim() || !newMeetingLocation.trim() || newMeetingInvitedIds.length === 0 || isAddingMeeting) && chatStyles.completeBtnDisabled]}
              onPress={handleAddMeeting}
              disabled={!newMeetingTitle.trim() || !newMeetingDate || !newMeetingTime.trim() || !newMeetingLocation.trim() || newMeetingInvitedIds.length === 0 || isAddingMeeting}
              activeOpacity={0.8}
            >
              {isAddingMeeting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={[chatStyles.modalBtnConfirmText, { ...font.bold }]}>{t('project_details.add')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
    {showMeetingDatePicker && (
      <MiniCalendar
        value={newMeetingDate}
        onSelect={(iso) => { setNewMeetingDate(iso); setShowMeetingDatePicker(false); }}
        onClose={() => setShowMeetingDatePicker(false)}
      />
    )}

    {/* Manage modal */}
    <Modal visible={manageVisible} transparent animationType="fade" onRequestClose={() => setManageVisible(false)}>
      <TouchableOpacity style={manageStyles.overlay} activeOpacity={1} onPress={() => setManageVisible(false)}>
        <TouchableOpacity activeOpacity={1} style={{ width: '90%', maxHeight: '85%' }}>
          <LinearGradient colors={['#1a237e', '#004aad']} style={manageStyles.modal}>
            <View style={[manageStyles.modalHeader, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
              <AppText weight="bold" style={manageStyles.modalTitle}>
                {t('communities.manage')}
              </AppText>
              <TouchableOpacity onPress={() => setManageVisible(false)}>
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 22 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>

              {/* Pending Requests */}
              <AppText weight="semiBold" style={manageStyles.sectionTitle}>
                {t('communities.pending_requests')} ({pendingRequests.length})
              </AppText>
              {pendingRequests.length === 0 ? (
                <AppText weight="regular" style={manageStyles.emptyText}>—</AppText>
              ) : (
                pendingRequests.map((req) => (
                  <View key={req.userId} style={[manageStyles.requestRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                    <AppText weight="regular" style={manageStyles.requestName} numberOfLines={1}>
                      {req.displayName}
                    </AppText>
                    <TouchableOpacity
                      style={[manageStyles.actionBtn, { backgroundColor: '#16a34a' }]}
                      onPress={() => handleApproveRequest(req.userId)}
                    >
                      <AppText weight="semiBold" style={manageStyles.actionBtnText}>
                        {t('communities.approve')}
                      </AppText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[manageStyles.actionBtn, { backgroundColor: '#dc2626' }]}
                      onPress={() => handleRejectRequest(req.userId)}
                    >
                      <AppText weight="semiBold" style={manageStyles.actionBtnText}>
                        {t('communities.reject')}
                      </AppText>
                    </TouchableOpacity>
                  </View>
                ))
              )}

              {/* Members */}
              <AppText weight="semiBold" style={[manageStyles.sectionTitle, { marginTop: 20 }]}>
                {t('communities.members')} ({chatMembers.length})
              </AppText>
              {chatMembers.map((uid) => (
                <View key={uid} style={[manageStyles.memberRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                  <View style={manageStyles.memberAvatar}>
                    <AppText weight="bold" style={manageStyles.memberInitial}>
                      {(memberNames[uid] ?? uid).charAt(0).toUpperCase()}
                    </AppText>
                  </View>
                  <AppText weight="regular" style={manageStyles.memberName} numberOfLines={1}>
                    {memberNames[uid] ?? uid}
                    {uid === chatOwnerId ? ' ★' : ''}
                  </AppText>
                  {uid !== chatOwnerId && (
                    <TouchableOpacity onPress={() => handleRemoveMember(uid)} style={{ padding: 4 }}>
                      <Text style={{ color: '#dc2626', fontSize: 18 }}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}

              {/* Channels */}
              <AppText weight="semiBold" style={[manageStyles.sectionTitle, { marginTop: 20 }]}>
                {t('community.channels')} ({channels.length})
              </AppText>
              {channels.map((ch) => (
                <View key={ch.id} style={[manageStyles.channelRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                  <AppText weight="regular" style={manageStyles.channelName}># {ch.name}</AppText>
                  {!isGeneralChannel(ch.name) && (
                    <TouchableOpacity onPress={() => handleDeleteChannel(ch.id, ch.name)} style={{ padding: 4 }}>
                      <Text style={{ color: '#dc2626', fontSize: 16 }}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {addingChannel ? (
                <View style={[manageStyles.addChannelRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                  <TextInput
                    value={newChannelName}
                    onChangeText={setNewChannelName}
                    placeholder={t('community.channel_name')}
                    placeholderTextColor="rgba(255,255,255,0.4)"
                    style={[manageStyles.channelInput, { ...font.regular, textAlign: rtl ? 'right' : 'left' }]}
                    autoFocus
                  />
                  <TouchableOpacity style={manageStyles.addBtn} onPress={handleAddChannel}>
                    <Text style={[{ color: '#004aad', ...font.bold, fontSize: 15 }]}>+</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={() => setAddingChannel(true)} style={manageStyles.addChannelTrigger}>
                  <AppText weight="semiBold" style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>
                    {t('community.add_channel')}
                  </AppText>
                </TouchableOpacity>
              )}

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
    paddingBottom: 12,
    borderBottomWidth: 1,
    paddingHorizontal: 8,
  },
  headerBack: {
    width: 48,
    alignSelf: 'stretch',
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
  channelBar: {
    flexGrow: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.15)',
  },
  channelBarContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  channelPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: 'transparent',
  },
  channelPillActive: {
    backgroundColor: '#004aad',
    borderColor: '#004aad',
  },
  channelPillText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
  },
  channelPillTextActive: {
    color: '#ffffff',
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
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: { borderRadius: 24, padding: 24 },
  modalHeader: {
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  sectionTitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  emptyText: { color: 'rgba(255,255,255,0.4)', fontSize: 13, marginBottom: 8 },
  requestRow: { alignItems: 'center', gap: 8, marginBottom: 10 },
  requestName: { flex: 1, color: '#fff', fontSize: 14 },
  actionBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  actionBtnText: { color: '#fff', fontSize: 12 },
  memberRow: {
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  memberAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberInitial: { color: '#fff', fontSize: 14 },
  memberName: { flex: 1, color: '#fff', fontSize: 14 },
  channelRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  channelName: { color: '#fff', fontSize: 14, flex: 1 },
  addChannelRow: {
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  channelInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#fff',
    fontSize: 14,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addChannelTrigger: {
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 10,
    marginTop: 8,
  },
});

const chatStyles = StyleSheet.create({
  menuSheet: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  menuItem: {
    alignItems: 'center',
    gap: 6,
  },
  menuItemIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#e8f0fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemLabel: {
    fontSize: 11,
    color: '#004aad',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    gap: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 4 },
  missionInputLabel: { fontSize: 13, fontWeight: '600', marginTop: 8, marginBottom: 4 },
  missionInput: {
    borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
  },
  missionAssignRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6,
  },
  missionAssignRowSelected: { backgroundColor: '#004aad18' },
  missionAssignName: { fontSize: 14, fontWeight: '500', flex: 1 },
  missionCheckbox: {
    width: 20, height: 20, borderRadius: 5, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  missionCheckboxTick: { color: '#fff', fontSize: 12, fontWeight: '700', lineHeight: 14 },
  missionDateRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
  },
  missionDateText: { flex: 1, fontSize: 14, fontWeight: '500' },
  missionDatePlaceholder: { flex: 1, fontSize: 14 },
  missionDateClear: { color: '#ef4444', fontSize: 14, fontWeight: '700', paddingHorizontal: 4 },
  completeBtnDisabled: { opacity: 0.6 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  modalBtnCancel: { borderWidth: 1 },
  modalBtnCancelText: { fontSize: 15, fontWeight: '600' },
  modalBtnConfirm: { backgroundColor: '#004aad' },
  modalBtnConfirmText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  // Recording
  recordingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ef4444',
    flexShrink: 0,
  },
  recordingTimer: { fontSize: 15, color: '#ef4444', minWidth: 36 },
  recordingHint: { flex: 1, fontSize: 12 },
  recordingCancel: { fontSize: 13, color: '#ef4444' },
  // Audio bubble
  audioBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  audioPlayBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  audioDurationText: { fontSize: 13, fontWeight: '600', minWidth: 32 },
});
