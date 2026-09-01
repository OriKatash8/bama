import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import {
  useAudioRecorder,
  useAudioPlayer,
  useAudioPlayerStatus,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import { initialWindowMetrics } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

const TOP_INSET = initialWindowMetrics?.insets.top ?? 0;
const BOTTOM_INSET = initialWindowMetrics?.insets.bottom ?? 0;
import {
  getDoc, updateDoc, doc, Timestamp,
  collection, onSnapshot, query, where,
  arrayUnion, arrayRemove, addDoc, setDoc, serverTimestamp,
  orderBy, deleteDoc,
} from 'firebase/firestore';
import { useRouter } from 'expo-router';
import { Plus, Camera, CheckSquare, Calendar, Coins, Paperclip, Mic, Play, Pause, X, Eye, ShoppingBag, ChevronDown } from 'lucide-react-native';
import { AppText } from '@components/ui/AppText';
import { useTheme } from '@core/hooks/useTheme';
import { useAppFont } from '@core/hooks/useAppFont';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAuthStore } from '@core/stores/authStore';
import { useUiStore } from '@core/stores/uiStore';
import { useVideoUpload } from '@core/hooks/useVideoUpload';
import { VideoPlayer } from '@components/ui/VideoPlayer';
import { uploadFile } from '@core/firebase/storage';
import { auth, db } from '@core/firebase/config';
import { listenToMessages, sendMessage, hideChatForUser } from '../services/chatService';
import { confirmDialog } from '@utils/confirmDialog';
import { addMission } from '../services/missionService';
import { addMeeting } from '../services/meetingService';
import { MiniCalendar } from '@features/crew/components';
import { PurchaseBanner } from '@features/marketplace/components/PurchaseBanner';
import { ListingDetailModal } from '@features/marketplace/components/ListingDetailModal';
import { ListingCard } from '@features/marketplace/components/ListingCard';
import { useMarketplaceListings } from '@features/marketplace/hooks/useMarketplaceListings';
import { shareListingToCommunities } from '@features/marketplace/services/marketplaceService';
import type { MarketplaceListing } from '@features/marketplace/types';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import type { Chat, Message } from '../types';
import { PortfolioViewer } from '@features/profile/components/PortfolioViewer';
import type { MediaAsset } from '@core/types/media';

type Translations = typeof en;

/** Names the General channel has shipped under. Matched language-agnostically so
 *  a community created in one language still resolves in the other. */
const GENERAL_CHANNEL_NAMES = ['כללי', 'General'];
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
  /** Stable identity for special channels. Absent = legacy/normal channel. */
  kind?: 'general' | 'market';
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

function formatMessageDate(timestamp: Timestamp | null | undefined, language: string): string {
  if (!timestamp) return '';
  const date = typeof timestamp === 'object' && 'seconds' in timestamp
    ? new Date(timestamp.seconds * 1000)
    : new Date(timestamp as unknown as string);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === now.toDateString()) return language === 'he' ? 'היום' : 'Today';
  if (date.toDateString() === yesterday.toDateString()) return language === 'he' ? 'אתמול' : 'Yesterday';
  return date.toLocaleDateString(language === 'he' ? 'he-IL' : 'en-US', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function formatMessageTime(timestamp: Timestamp | number | string | null | undefined): string {
  if (!timestamp) return '';
  const date = typeof timestamp === 'object' && 'seconds' in timestamp
    ? new Date(timestamp.seconds * 1000)
    : new Date(timestamp);
  return date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatRecordingTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── System messages (new mission/meeting) ──────────────────────────────────
const HE_MONTHS_ABBR = ['ינו׳','פבר׳','מרץ','אפר׳','מאי','יוני','יולי','אוג׳','ספט׳','אוק׳','נוב׳','דצמ׳'];

/** Turn a "…{title} · YYYY-MM-DD HH:MM" system text into a nice Hebrew detail line. */
function formatHebMeetingDetail(text: string): string {
  const m = text.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}:\d{2})/);
  const formattedDate = m
    ? `${parseInt(m[3], 10)} ב${HE_MONTHS_ABBR[parseInt(m[2], 10) - 1] ?? ''}, ${m[4]}`
    : '';
  const title = text.replace(/^📅\s*פגישה חדשה:\s*/, '').split(' · ')[0]?.trim();
  if (title && formattedDate) return `${title} · ${formattedDate}`;
  return formattedDate || title || '';
}

type SystemVariant = 'meeting' | 'mission' | 'price_change' | 'neutral';

function parseSystemMessage(text: string): { variant: SystemVariant; headline: string; detail: string } {
  if (text.startsWith('📅')) {
    return { variant: 'meeting', headline: 'פגישה חדשה נקבעה', detail: formatHebMeetingDetail(text) };
  }
  if (text.startsWith('📋')) {
    return {
      variant: 'mission',
      headline: 'משימה חדשה נוספה',
      detail: text.replace(/^📋\s*משימה חדשה:\s*/, '').trim(),
    };
  }
  // Match by the Hebrew phrase (not only the emoji) so the amber price pill renders
  // identically on web and native, regardless of emoji encoding differences.
  if (text.startsWith('💰') || text.includes('בקשת שינוי מחיר')) {
    const detail = text.replace(/^(?:💰\s*)?בקשת שינוי מחיר:?\s*/, '').trim();
    return { variant: 'price_change', headline: 'בקשה לשינוי מחיר', detail };
  }
  return { variant: 'neutral', headline: text, detail: '' };
}

interface VoiceMessageBubbleProps {
  messageId: string;
  audioUrl: string;
  audioDuration: number;
  isOwn: boolean;
  playingId: string | null;
  setPlayingId: (id: string | null) => void;
}

function VoiceMessageBubble({ messageId, audioUrl, audioDuration, isOwn, playingId, setPlayingId }: VoiceMessageBubbleProps) {
  const isActive = playingId === messageId;
  const player = useAudioPlayer(audioUrl);
  const status = useAudioPlayerStatus(player);
  const language = useSettingsStore((s) => s.language);
  const rtl = language === 'he';

  // ── Drag-seek state ──
  const [isDragging, setIsDragging] = useState(false);
  const [seekPct, setSeekPct] = useState(0);
  const trackWidthRef = useRef(0);
  const seekPctRef = useRef(0);
  const totalDurationRef = useRef(audioDuration);
  const rtlRef = useRef(rtl);
  rtlRef.current = rtl;
  const playerRef = useRef(player);
  playerRef.current = player;

  // ── Derived values ──
  const totalSec = (status.duration > 0 ? status.duration : audioDuration) || audioDuration || 1;
  totalDurationRef.current = totalSec;
  const rawPct = Math.max(0, Math.min(1, totalSec > 0 ? (status.currentTime || 0) / totalSec : 0));
  const displayPct = isDragging ? seekPct : rawPct;
  const displayElapsed = isDragging ? seekPct * totalSec : Math.max(0, status.currentTime || 0);

  // ── Colours ──
  const accent = isOwn ? 'rgba(255,255,255,0.9)' : '#004aad';
  const trackBg = isOwn ? 'rgba(255,255,255,0.25)' : 'rgba(0,74,173,0.15)';

  // ── Existing effects (unchanged) ──
  useEffect(() => {
    if (!isActive && status.playing) {
      player.pause();
    }
  }, [isActive]);

  useEffect(() => {
    if (isActive && status.didJustFinish) {
      setPlayingId(null);
    }
  }, [status.didJustFinish]);

  // ── PanResponder (created once; reads from refs to avoid stale closures) ──
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const w = trackWidthRef.current;
        if (!w) return;
        const raw = e.nativeEvent.locationX / w;
        const pct = Math.max(0, Math.min(1, rtlRef.current ? 1 - raw : raw));
        seekPctRef.current = pct;
        setIsDragging(true);
        setSeekPct(pct);
      },
      onPanResponderMove: (e) => {
        const w = trackWidthRef.current;
        if (!w) return;
        const raw = e.nativeEvent.locationX / w;
        const pct = Math.max(0, Math.min(1, rtlRef.current ? 1 - raw : raw));
        seekPctRef.current = pct;
        setSeekPct(pct);
      },
      onPanResponderRelease: () => {
        playerRef.current.seekTo(seekPctRef.current * totalDurationRef.current);
        setIsDragging(false);
      },
      onPanResponderTerminate: () => {
        setIsDragging(false);
      },
    })
  ).current;

  // ── handlePress (unchanged logic) ──
  async function handlePress() {
    if (isActive && status.playing) {
      player.pause();
      setPlayingId(null);
    } else {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch((e) => {
        console.warn('[AudioMode] handlePress:', e);
      });
      if (status.didJustFinish) player.seekTo(0);
      player.play();
      setPlayingId(messageId);
    }
  }

  // ── Flex track helpers (avoids flex:0 edge cases) ──
  const filledFlex = Math.max(0.001, displayPct);
  const unfilledFlex = Math.max(0.001, 1 - displayPct);

  return (
    <View style={[chatStyles.audioBubble, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
      {/* Play / Pause */}
      <TouchableOpacity onPress={handlePress} activeOpacity={0.7} style={chatStyles.audioPlayBtn}>
        {isActive && status.playing
          ? <Pause size={18} color={isOwn ? '#ffffff' : '#004aad'} strokeWidth={1.5} />
          : <Play size={18} color={isOwn ? '#ffffff' : '#004aad'} strokeWidth={1.5} />}
      </TouchableOpacity>

      {/* Elapsed */}
      <AppText weight="semiBold" style={[chatStyles.audioTimeText, { color: accent }]}>
        {formatRecordingTime(Math.floor(displayElapsed))}
      </AppText>

      {/* Progress track */}
      <View
        style={chatStyles.audioTrackOuter}
        onLayout={(e) => { trackWidthRef.current = e.nativeEvent.layout.width; }}
        {...panResponder.panHandlers}
      >
        <View style={{ flex: filledFlex, height: 3, backgroundColor: accent, borderRadius: 1.5 }} />
        <View style={[chatStyles.audioHandleDot, { backgroundColor: accent }]} />
        <View style={{ flex: unfilledFlex, height: 3, backgroundColor: trackBg, borderRadius: 1.5 }} />
      </View>

      {/* Total duration */}
      <AppText weight="semiBold" style={[chatStyles.audioTimeText, { color: accent }]}>
        {formatRecordingTime(Math.floor(totalSec))}
      </AppText>
    </View>
  );
}

type ListItem = Message | { type: 'date-separator'; id: string; label: string };

function DateSeparator({ label }: { label: string }) {
  return (
    <View style={styles.dateSepRow}>
      <AppText weight="regular" style={styles.dateSepLabel}>{label}</AppText>
    </View>
  );
}

interface Props {
  chatId: string;
}

/** A marketplace listing shared into a community market channel. Shows a
 *  rental/sale ribbon and, if the listing was removed/sold, a "not relevant"
 *  state with a disabled CTA. */
function SharedListingCard({ msg }: { msg: Message }) {
  const language = useSettingsStore((s) => s.language);
  const rtl = language === 'he';
  const t = makeT(language === 'he' ? he : en);
  const router = useRouter();
  const [available, setAvailable] = useState<boolean | null>(null);
  // Authoritative sale/rental type read from the live listing (falls back to the
  // message field, which is only present on newer shared cards).
  const [docType, setDocType] = useState<string | null>(null);
  const [photoURL, setPhotoURL] = useState<string | null>(null);

  useEffect(() => {
    if (!msg.listingId) { setAvailable(false); return; }
    let cancelled = false;
    getDoc(doc(db, 'marketplace_listings', msg.listingId))
      .then((snap) => {
        if (cancelled) return;
        if (!snap.exists()) { setAvailable(false); return; }
        const data = snap.data() as { status?: string; type?: string };
        setDocType(data.type ?? null);
        setAvailable(data.status !== 'sold' && data.status !== 'reserved');
      })
      .catch(() => { if (!cancelled) setAvailable(true); });
    return () => { cancelled = true; };
  }, [msg.listingId]);

  useEffect(() => {
    if (!msg.senderId) return;
    let cancelled = false;
    getDoc(doc(db, 'users', msg.senderId))
      .then((snap) => {
        if (!cancelled && snap.exists()) setPhotoURL((snap.data() as { photoURL?: string }).photoURL ?? null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [msg.senderId]);

  const posterName = msg.posterName ?? '';
  const initial = (posterName || '?').charAt(0).toUpperCase();
  const isRental = (docType ?? msg.listingType) === 'rental';
  const removed = available === false;

  return (
    <>
      {/* Listing card */}
      <View style={styles.listingWrapper}>
        <View style={[styles.listingCard, removed && { opacity: 0.6 }]}>
          {/* Header box: avatar (leading), name, and send time */}
          <View style={styles.listingHeader}>
            <View style={[styles.listingHeaderRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
              {photoURL ? (
                <Image source={{ uri: photoURL }} style={styles.listingHeaderAvatar} resizeMode="cover" />
              ) : (
                <View style={[styles.listingHeaderAvatar, styles.listingHeaderAvatarFallback]}>
                  <AppText weight="bold" style={styles.listingHeaderAvatarText}>{initial}</AppText>
                </View>
              )}
              <AppText weight="bold" numberOfLines={1} style={[styles.listingHeaderName, { textAlign: rtl ? 'right' : 'left' }]}>
                {posterName}
              </AppText>
            </View>
          </View>

          <View>
            {msg.imageUrl ? (
              <Image source={{ uri: msg.imageUrl }} style={styles.listingImage} resizeMode="cover" />
            ) : (
              <View style={[styles.listingImage, styles.listingImagePlaceholder]} />
            )}
            <View style={[styles.listingRibbon, !isRental && styles.listingRibbonSale, rtl ? { right: 10 } : { left: 10 }]}>
              <AppText weight="bold" style={styles.listingRibbonText}>
                {isRental ? t('marketplace.for_rent') : t('marketplace.for_sale')}
              </AppText>
            </View>
            {removed && (
              <View style={[styles.listingRemovedBadge, rtl ? { left: 10 } : { right: 10 }]}>
                <AppText weight="bold" style={styles.listingRemovedText}>{t('marketplace.not_relevant')}</AppText>
              </View>
            )}
          </View>
          <View style={styles.listingBody}>
            <AppText weight="bold" numberOfLines={2} style={[styles.listingTitle, { textAlign: rtl ? 'right' : 'left' }]}>
              {msg.title ?? ''}
            </AppText>
            <AppText weight="bold" style={[styles.listingPrice, { textAlign: rtl ? 'right' : 'left' }]}>
              ₪{(msg.price ?? 0).toLocaleString()}
            </AppText>
            {removed ? (
              <View style={[styles.listingCta, styles.listingCtaDisabled, { flexDirection: rtl ? 'row-reverse' : 'row', marginTop: 10 }]}>
                <AppText weight="bold" style={styles.listingCtaText}>{t('marketplace.listing_unavailable')}</AppText>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => router.push(`/(professional)/(tabs)/marketplace?listingId=${msg.listingId}` as never)}
                activeOpacity={0.85}
                style={{ marginTop: 10 }}
              >
                <LinearGradient
                  colors={['#1e4fa3', '#3d6fc9']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.listingCta, { flexDirection: rtl ? 'row-reverse' : 'row' }]}
                >
                  <Eye size={16} color="#ffffff" strokeWidth={2.4} />
                  <AppText weight="bold" style={styles.listingCtaText}>{t('marketplace.view_listing')}</AppText>
                </LinearGradient>
              </TouchableOpacity>
            )}
            <AppText weight="regular" style={[styles.listingHeaderTime, { textAlign: rtl ? 'left' : 'right', marginTop: 8 }]}>
              {formatMessageTime(msg.timestamp)}
            </AppText>
          </View>
        </View>
      </View>
    </>
  );
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

  const listItems = useMemo((): ListItem[] => {
    const result: ListItem[] = [];
    let lastDateStr: string | null = null;
    for (const msg of messages) {
      const ts = msg.timestamp;
      const dateStr = ts && typeof ts === 'object' && 'seconds' in ts
        ? new Date(ts.seconds * 1000).toDateString()
        : ts ? new Date(ts as unknown as string).toDateString() : null;
      if (dateStr && dateStr !== lastDateStr) {
        result.push({ type: 'date-separator', id: `sep-${dateStr}`, label: formatMessageDate(ts, language) });
        lastDateStr = dateStr;
      }
      result.push(msg);
    }
    return result;
  }, [messages, language]);

  const [inputText, setInputText] = useState('');
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const fetchedIdsRef = useRef<Set<string>>(new Set());
  const creatingGeneralRef = useRef(false);
  const creatingMarketRef = useRef(false);
  const channelBarRef = useRef<ScrollView>(null);
  const flatListRef = useRef<FlatList>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  // Tracks whether the list is at/near the bottom, so content-size changes keep
  // the view pinned to the newest message (initial open + new messages while at
  // the bottom) without yanking the user down when they've scrolled up.
  const isAtBottomRef = useRef(true);
  // Opening a conversation (or switching channel) pins the list to the newest
  // message until the user drags. isAtBottomRef alone is not enough: rows are
  // measured as they render — images and listing cards land late — so the first
  // scrollToEnd lands short and the last message sits below the fold.
  const pinToBottomRef = useRef(true);
  const [chatName, setChatName] = useState<string>('');
  const [chatType, setChatType] = useState<Chat['type'] | null>(null);
  const [chatArchived, setChatArchived] = useState(false);
  const [chatReadOnly, setChatReadOnly] = useState(false);
  const [chatArchiveReason, setChatArchiveReason] = useState<'completed' | 'cancelled' | 'superseded' | null>(null);
  const [chatProjectId, setChatProjectId] = useState<string | undefined>(undefined);
  const [projectDeadline, setProjectDeadline] = useState<string | undefined>(undefined);
  const [chatOwnerId, setChatOwnerId] = useState<string>('');
  const [communityPhotoURL, setCommunityPhotoURL] = useState<string | undefined>(undefined);
  const [communityPhotoUploading, setCommunityPhotoUploading] = useState(false);
  const [chatPhotoURL, setChatPhotoURL] = useState<string | null>(null);
  const [chatPhotoModalOpen, setChatPhotoModalOpen] = useState(false);
  const [chatPhotoUploading, setChatPhotoUploading] = useState(false);
  const [manageVisible, setManageVisible] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<{ userId: string; displayName: string }[]>([]);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [chatMembers, setChatMembers] = useState<string[]>([]);
  const { uploading: videoUploading, processing: videoProcessing, uploadVideo } = useVideoUpload();
  const [imageUploading, setImageUploading] = useState(false);
  const mediaActive = videoUploading || videoProcessing || imageUploading;
  const [viewingMedia, setViewingMedia] = useState<{ url: string; type: 'image' | 'video' } | null>(null);
  const [pendingMedia, setPendingMedia] = useState<{
    uri: string;
    type: 'image' | 'video';
    asset: ImagePicker.ImagePickerAsset;
  } | null>(null);
  const [pendingCaption, setPendingCaption] = useState('');
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [purchaseListing, setPurchaseListing] = useState<MarketplaceListing | null>(null);
  const [showPurchaseNotice, setShowPurchaseNotice] = useState(false);

  // Channel state
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string>('');
  const [newChannelName, setNewChannelName] = useState('');
  const [addingChannel, setAddingChannel] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  // ── Market channel: post one of my own listings ──
  const currentUserName = useAuthStore((s) => s.user?.displayName) ?? '';
  const { showToast } = useUiStore();
  const { listings: shListings } = useMarketplaceListings('secondhand');
  const { listings: rtListings } = useMarketplaceListings('rental');
  const myListings = useMemo(
    () => [...shListings, ...rtListings].filter((l) => l.posterId === currentUserId),
    [shListings, rtListings, currentUserId],
  );
  const [listingPickerOpen, setListingPickerOpen] = useState(false);
  const [postingListing, setPostingListing] = useState(false);
  const postingRef = useRef(false);
  const activeChannel = channels.find((c) => c.id === activeChannelId);
  const isMarketActive =
    chatType === 'community' && (activeChannelId === 'market' || activeChannel?.kind === 'market');

  async function handlePostListing(listing: MarketplaceListing) {
    if (postingRef.current || !currentUserId) return;
    postingRef.current = true;
    setPostingListing(true);
    try {
      await shareListingToCommunities(listing, [chatId], { id: currentUserId, name: currentUserName });
      showToast(t('marketplace.posted_to_market'), 'success');
      setListingPickerOpen(false);
    } catch {
      showToast(t('marketplace.share_error'), 'error');
    } finally {
      setPostingListing(false);
      postingRef.current = false;
    }
  }

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
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
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

  // Fetch chat metadata — real-time so archived state updates instantly
  useEffect(() => {
    let nameResolved = false;

    const unsub = onSnapshot(doc(db, 'chats', chatId), async (snap) => {
      if (!snap.exists()) { router.back(); return; }
      const data = snap.data() as Omit<Chat, 'id'>;

      setChatType(data.type);
      setChatArchived(data.archived ?? false);
      setChatReadOnly(data.readOnly ?? false);
      setChatArchiveReason(data.archiveReason ?? null);
      setChatProjectId(data.projectId);
      if (data.ownerId) setChatOwnerId(data.ownerId);
      if (data.members) setChatMembers(data.members as string[]);
      setCommunityPhotoURL(data.photoURL);
      setChatPhotoURL(data.photoURL ?? null);

      if (!nameResolved) {
        nameResolved = true;
        if (data.type === 'dm') {
          const otherId = (data.members as string[]).find((id) => id !== currentUserId);
          if (otherId) {
            const userSnap = await getDoc(doc(db, 'users', otherId));
            const displayName = userSnap.exists()
              ? (userSnap.data() as { displayName: string }).displayName
              : 'Unknown';
            setChatName(displayName);
          } else {
            setChatName('Direct message');
          }
        } else if (data.type === 'purchase') {
          const lang = useSettingsStore.getState().language;
          let productName = data.name as string | undefined;
          // Fetch the full listing so the header title can open the product
          // notice (ListingDetailModal); also resolves the name when missing.
          if (data.purchaseListingId) {
            const listingSnap = await getDoc(doc(db, 'marketplace_listings', data.purchaseListingId as string));
            if (listingSnap.exists()) {
              const listingData = listingSnap.data() as Omit<MarketplaceListing, 'id'>;
              if (!productName) productName = listingData.productName;
              setPurchaseListing({ id: listingSnap.id, ...listingData });
            }
          }
          // Prefer the buyer's name in the title so the seller can tell buyers
          // apart. Fall back to the buyer member's displayName, then to a suffix.
          let buyerName = (data as { buyerName?: string }).buyerName;
          if (!buyerName) {
            const sellerId = (data as { posterId?: string }).posterId;
            const buyerId = (data.members as string[]).find((id) => id !== sellerId && id !== currentUserId)
              ?? (data.members as string[]).find((id) => id !== currentUserId);
            if (buyerId) {
              const buyerSnap = await getDoc(doc(db, 'users', buyerId));
              if (buyerSnap.exists()) buyerName = (buyerSnap.data() as { displayName?: string }).displayName;
            }
          }
          setChatName(
            productName
              ? (buyerName
                  ? `${productName} - ${buyerName}`
                  : (lang === 'he' ? `קנייה - ${productName}` : `${productName} - Purchase`))
              : (lang === 'he' ? 'רכישה' : 'Purchase'),
          );
        } else {
          setChatName(data.name ?? 'Group Chat');
        }
      }
    });

    return unsub;
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

  // Community: listen to channels subcollection; ensure General + Market exist.
  useEffect(() => {
    if (chatType !== 'community') return;
    // Re-arm the create guards whenever the community changes.
    creatingGeneralRef.current = false;
    creatingMarketRef.current = false;
    const channelsRef = collection(db, 'chats', chatId, 'channels');
    const q = query(channelsRef, orderBy('createdAt', 'asc'));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Channel));

      // Ensure the General channel (empty subcollection = brand-new community).
      if (snap.empty && currentUserId && !creatingGeneralRef.current) {
        creatingGeneralRef.current = true;
        addDoc(channelsRef, {
          name: t('community.default_channel'),
          kind: 'general',
          createdAt: serverTimestamp(),
          createdBy: currentUserId,
          lastMessage: null,
        });
        return; // wait for the next snapshot
      }

      // Ensure the Market channel — fixed doc id so concurrent creates hit the SAME doc.
      const hasMarket = list.some((c) => c.kind === 'market' || c.name === t('community.market_channel'));
      if (!snap.empty && !hasMarket && currentUserId && !creatingMarketRef.current) {
        creatingMarketRef.current = true;
        setDoc(doc(db, 'chats', chatId, 'channels', 'market'), {
          name: t('community.market_channel'),
          kind: 'market',
          createdAt: serverTimestamp(),
          createdBy: currentUserId,
          lastMessage: null,
        });
      }

      // Order: General, שוק, then legacy channels (by createdAt) — timestamp-independent.
      // General is matched by name too: channels created before `kind` existed
      // carry no kind, and this one must stay first (it anchors the strip).
      const rank = (c: Channel) =>
        c.kind === 'general' || GENERAL_CHANNEL_NAMES.includes(c.name) ? 0
        : c.kind === 'market' ? 1
        : 2;
      const sorted = [...list].sort(
        (a, b) => rank(a) - rank(b) || (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0),
      );
      setChannels(sorted);
      setActiveChannelId((prev) => {
        if (prev && sorted.some((c) => c.id === prev)) return prev;
        return sorted[0]?.id ?? '';
      });
    });
  }, [chatId, chatType]);

  // Entering a chat — or switching community channel — opens on the last message.
  useEffect(() => {
    pinToBottomRef.current = true;
    isAtBottomRef.current = true;
    setShowScrollDown(false);
    flatListRef.current?.scrollToEnd({ animated: false });
  }, [chatId, activeChannelId]);

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
          // Shared marketplace listing (Part B/C)
          type: data.type as 'listing' | undefined,
          listingId: data.listingId as string | undefined,
          title: data.title as string | undefined,
          price: data.price as number | undefined,
          imageUrl: data.imageUrl as string | null | undefined,
          posterId: data.posterId as string | undefined,
          posterName: data.posterName as string | undefined,
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

  // Load the linked project's end date so mission/meeting dates can be
  // constrained to the project window (today → project end).
  useEffect(() => {
    if (!chatProjectId) { setProjectDeadline(undefined); return; }
    let cancelled = false;
    getDoc(doc(db, 'projects', chatProjectId))
      .then((snap) => {
        if (cancelled) return;
        const dl = snap.exists() ? (snap.data() as { deadline?: string }).deadline : undefined;
        setProjectDeadline(dl && dl !== 'flexible' ? dl : undefined);
      })
      .catch(() => { if (!cancelled) setProjectDeadline(undefined); });
    return () => { cancelled = true; };
  }, [chatProjectId]);

  const todayISO = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  // Member display names
  useEffect(() => {
    if (chatMembers.length === 0) return;
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
      (id) => id !== currentUserId && id !== 'system' && !fetchedIdsRef.current.has(id)
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


  async function handleChangeCommunityPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as const,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;
    setCommunityPhotoUploading(true);
    try {
      const blob = await fetch(result.assets[0].uri).then((r) => r.blob());
      const url = await uploadFile(`community-images/${chatId}.jpg`, blob);
      await updateDoc(doc(db, 'chats', chatId), { photoURL: url });
      setCommunityPhotoURL(url);
    } finally {
      setCommunityPhotoUploading(false);
    }
  }

  async function handleChangeChatPhoto() {
    // Only the community owner may change a community's photo.
    if (chatType === 'community' && currentUserId !== chatOwnerId) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as const,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;
    setChatPhotoUploading(true);
    try {
      const blob = await fetch(result.assets[0].uri).then((r) => r.blob());
      const url = await uploadFile(`chat-images/${chatId}.jpg`, blob);
      await updateDoc(doc(db, 'chats', chatId), { photoURL: url });
      setChatPhotoURL(url);
      setChatPhotoModalOpen(false);
    } finally {
      setChatPhotoUploading(false);
    }
  }

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

  async function handleDeleteChannel(channelId: string, channelName: string) {
    const confirmed = await confirmDialog(t('community.delete_channel'), channelName);
    if (!confirmed) return;
    await deleteDoc(doc(db, 'chats', chatId, 'channels', channelId));
    if (activeChannelId === channelId) {
      const remaining = channels.filter((c) => c.id !== channelId);
      setActiveChannelId(remaining[0]?.id ?? '');
    }
  }

  async function handleDeleteChat() {
    if (!currentUserId) return;
    const confirmed = await confirmDialog(
      t('chats.delete_chat_title'),
      t('chats.delete_chat_msg'),
    );
    if (!confirmed) return;
    await hideChatForUser(chatId, currentUserId);
    router.back();
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
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'] as const,
        allowsEditing: false,
        quality: 1,
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        shouldDownloadFromNetwork: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      setPendingMedia({ uri: asset.uri, type: asset.type === 'video' ? 'video' : 'image', asset });
    } catch {
      Alert.alert(t('chats.error'), t('chats.media_load_failed'));
    }
  }

  async function handleSendPendingMedia() {
    if (!pendingMedia || !currentUserId) return;
    const { asset, type } = pendingMedia;
    const caption = pendingCaption.trim();
    setPendingMedia(null);
    setPendingCaption('');

    if (chatType === 'community' && activeChannelId) {
      const msgRef = collection(db, 'chats', chatId, 'channels', activeChannelId, 'messages');
      if (type === 'video') {
        const url = await uploadVideo('chat-videos', currentUserId, asset);
        if (url) {
          await addDoc(msgRef, { senderId: currentUserId, text: caption, timestamp: serverTimestamp(), readBy: [currentUserId], videoUrl: url });
        } else {
          Alert.alert(t('chats.error'), t('chats.video_send_failed'));
        }
      } else {
        setImageUploading(true);
        try {
          const blob = await fetch(asset.uri).then((r) => r.blob());
          const path = `chat-images/${chatId}/${Date.now()}.jpg`;
          const imageURL = await uploadFile(path, blob);
          await addDoc(msgRef, { senderId: currentUserId, text: caption, timestamp: serverTimestamp(), readBy: [currentUserId], imageURL });
        } finally {
          setImageUploading(false);
        }
      }
    } else {
      if (type === 'video') {
        const url = await uploadVideo('chat-videos', currentUserId, asset);
        if (url) {
          await sendMessage(chatId, currentUserId, caption, { videoUrl: url });
        } else {
          Alert.alert(t('chats.error'), t('chats.video_send_failed'));
        }
      } else {
        setImageUploading(true);
        try {
          const blob = await fetch(asset.uri).then((r) => r.blob());
          const path = `chat-images/${chatId}/${Date.now()}.jpg`;
          const imageURL = await uploadFile(path, blob);
          await sendMessage(chatId, currentUserId, caption, { imageURL });
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
    setPendingMedia({ uri: asset.uri, type: 'image', asset });
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
    Keyboard.dismiss();
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert('Permission needed', 'Allow microphone access in Settings to record voice messages.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => setRecordingDuration(d => d + 1), 1000);
    } catch (e) {
      console.error('[startRecording] failed:', e);
      setIsRecording(false);
    }
  }

  async function stopAndSendRecording() {
    if (!recorder.isRecording) return;
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
    const duration = recordingDuration;
    setIsRecording(false);
    setRecordingDuration(0);
    try {
      await recorder.stop();
      setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      const uri = recorder.uri;
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
    if (recorder.isRecording) recorder.stop().catch(() => {});
    setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    setIsRecording(false);
    setRecordingDuration(0);
  }

  const isGeneralChannel = (name: string) =>
    name === 'כללי' || name === 'General' || name === t('community.default_channel');
  const isMarketChannel = (ch: Channel) =>
    ch.kind === 'market' || ch.name === t('community.market_channel');

  return (
    <LinearGradient colors={colors.bgGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.container}>
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: '#ffffff', borderBottomColor: colors.border, paddingTop: TOP_INSET + 8 }]}>
        <TouchableOpacity onPress={() => router.push(`/${activeMode === 'client' ? '(client)' : '(professional)'}/(tabs)/chats${chatType === 'community' ? '?tab=communities' : ''}`)} style={styles.headerBack} activeOpacity={0.7}>
          <Text style={[styles.headerBackText, { color: colors.accent, ...font.regular }]}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          {chatType === 'group' && chatProjectId ? (
            <TouchableOpacity
              style={styles.headerNameTouchable}
              onPress={() => router.push(`/(client)/(tabs)/chats/project-details?projectId=${chatProjectId}&chatId=${chatId}`)}
              activeOpacity={0.8}
            >
              <AppText weight="bold" style={[styles.headerName, { color: '#004aad' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.4}>
                {chatName}
              </AppText>
              <AppText style={chatStyles.headerHint}>{t('chats.click_for_project_info')}</AppText>
            </TouchableOpacity>
          ) : chatType === 'purchase' && purchaseListing ? (
            <TouchableOpacity
              style={styles.headerNameTouchable}
              onPress={() => setShowPurchaseNotice(true)}
              activeOpacity={0.8}
            >
              <AppText weight="bold" style={[styles.headerName, { color: '#004aad' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.4}>
                {chatName}
              </AppText>
              <AppText style={chatStyles.headerHint}>{t('chats.purchase_info_hint')}</AppText>
            </TouchableOpacity>
          ) : (
            <AppText weight="bold" style={[styles.headerName, { color: '#004aad' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.4}>
              {chatName}
            </AppText>
          )}
        </View>
        <View style={[styles.headerRight, { alignItems: 'flex-start', justifyContent: 'center' }]}>
          {chatType === 'community' && currentUserId === chatOwnerId && (
            <TouchableOpacity onPress={() => setManageVisible(true)} style={{ padding: 4 }}>
              <AppText weight="semiBold" style={{ color: colors.accent, fontSize: 13 }}>
                {t('communities.manage')}
              </AppText>
            </TouchableOpacity>
          )}
          {(() => {
            // For purchase chats, the header avatar is the product image, and
            // tapping it opens the product notice instead of the change-photo sheet.
            const isPurchase = chatType === 'purchase';
            const avatarUri = isPurchase ? purchaseListing?.imageUrl ?? null : chatPhotoURL;
            return (
              <TouchableOpacity
                onPress={() => (isPurchase ? (purchaseListing && setShowPurchaseNotice(true)) : setChatPhotoModalOpen(true))}
                activeOpacity={0.8}
                style={chatStyles.headerPhotoBtn}
              >
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={chatStyles.headerPhoto} />
                ) : (
                  <View style={[chatStyles.headerPhoto, chatStyles.headerPhotoFallback]}>
                    <AppText style={chatStyles.headerPhotoFallbackText}>{chatName?.[0] ?? '?'}</AppText>
                  </View>
                )}
              </TouchableOpacity>
            );
          })()}
        </View>
      </View>

      {/* Channel tab bar (community only) */}
      {chatType === 'community' && channels.length > 0 && (
        <ScrollView
          ref={channelBarRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.channelBar}
          // row-reverse puts channels[0] (General) at the right in Hebrew and at
          // the left in English; flexGrow packs a short strip against that same
          // edge instead of leaving it stranded on the left.
          contentContainerStyle={[
            styles.channelBarContent,
            { flexDirection: rtl ? 'row-reverse' : 'row', flexGrow: 1 },
          ]}
          // A strip too wide to fit opens at scroll offset 0 — the far left,
          // i.e. the LAST channel in Hebrew. Jump to the right edge so General
          // is what the user sees first.
          onContentSizeChange={() => {
            if (rtl) channelBarRef.current?.scrollToEnd({ animated: false });
          }}
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

      {/* Product notice opened by tapping the purchase-chat title */}
      <ListingDetailModal
        listing={showPurchaseNotice ? purchaseListing : null}
        onClose={() => setShowPurchaseNotice(false)}
        readOnly
      />

      {/* Messages */}
      <View style={{ flex: 1, zIndex: 0 }}>
        <FlatList
          ref={flatListRef}
          data={listItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          scrollEventThrottle={16}
          onScroll={(e) => {
            const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
            const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
            isAtBottomRef.current = distanceFromBottom <= 80;
            setShowScrollDown(distanceFromBottom > 200);
          }}
          // The user taking hold of the list releases the open-at-bottom pin.
          onScrollBeginDrag={() => { pinToBottomRef.current = false; }}
          onLayout={() => {
            if (pinToBottomRef.current) flatListRef.current?.scrollToEnd({ animated: false });
          }}
          onContentSizeChange={() => {
            if (pinToBottomRef.current || isAtBottomRef.current) {
              flatListRef.current?.scrollToEnd({ animated: false });
            }
          }}
          renderItem={({ item }) => {
            if ('type' in item && item.type === 'date-separator') {
              return <DateSeparator label={(item as { label: string }).label} />;
            }
            const msg = item as Message;
            if (msg.system || msg.senderId === 'system') {
              const { variant, headline, detail } = parseSystemMessage(msg.text ?? '');
              const accent = variant === 'mission' ? '#a23bc4' : variant === 'price_change' ? '#1c9d63' : '#1e4fa3';
              return (
                <View style={styles.systemWrapper}>
                  <View style={[
                    styles.systemPill,
                    variant === 'mission' ? styles.systemPillMission : variant === 'price_change' ? styles.systemPillPrice : styles.systemPillMeeting,
                    { flexDirection: rtl ? 'row-reverse' : 'row' },
                  ]}>
                    {variant === 'mission'
                      ? <CheckSquare size={16} color={accent} strokeWidth={2} />
                      : variant === 'price_change'
                        ? <Coins size={16} color={accent} strokeWidth={2} />
                        : <Calendar size={16} color={accent} strokeWidth={2} />}
                    <View style={{ flexShrink: 1 }}>
                      <AppText weight="bold" style={[styles.systemHeadline, { color: accent }]}>
                        {headline}
                      </AppText>
                      {!!detail && (
                        <AppText weight="regular" style={styles.systemDetail}>{detail}</AppText>
                      )}
                    </View>
                  </View>
                </View>
              );
            }
            if (msg.type === 'listing') {
              return <SharedListingCard msg={msg} />;
            }
            const isOwn = msg.senderId === currentUserId;
            return (
              <View style={[styles.bubbleWrapper, isOwn ? styles.wrapperOwn : styles.wrapperPeer]}>
                {msg.videoUrl ? (
                  <View style={[styles.mediaBubble, { backgroundColor: isOwn ? colors.accent : '#ffffff' }]}>
                    {!isOwn && (
                      <AppText weight="regular" style={[styles.senderName, { color: colorForUser(msg.senderId), paddingHorizontal: 10, paddingTop: 6 }]}>
                        {userNames[msg.senderId] ?? 'Loading...'}
                      </AppText>
                    )}
                    <TouchableOpacity onPress={() => setViewingMedia({ url: msg.videoUrl!, type: 'video' })} activeOpacity={0.9}>
                      <VideoPlayer uri={msg.videoUrl} style={styles.mediaMessage} thumbnailOnly />
                    </TouchableOpacity>
                    {!!msg.text && (
                      <AppText weight="regular" style={[styles.messageText, { color: isOwn ? '#fff' : colors.text, paddingHorizontal: 10, paddingTop: 6, textAlign: rtl ? 'right' : 'left' }]}>
                        {msg.text}
                      </AppText>
                    )}
                    <Text style={[styles.messageTime, { color: isOwn ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.4)', paddingHorizontal: 10, paddingBottom: 6 }]}>
                      {formatMessageTime(msg.timestamp)}
                    </Text>
                  </View>
                ) : msg.imageURL ? (
                  <View style={[styles.mediaBubble, { backgroundColor: isOwn ? colors.accent : '#ffffff' }]}>
                    {!isOwn && (
                      <AppText weight="regular" style={[styles.senderName, { color: colorForUser(msg.senderId), paddingHorizontal: 10, paddingTop: 6 }]}>
                        {userNames[msg.senderId] ?? 'Loading...'}
                      </AppText>
                    )}
                    <TouchableOpacity onPress={() => setViewingMedia({ url: msg.imageURL!, type: 'image' })} activeOpacity={0.9}>
                      <Image source={{ uri: msg.imageURL }} style={styles.mediaMessage} resizeMode="cover" />
                    </TouchableOpacity>
                    {!!msg.text && (
                      <AppText weight="regular" style={[styles.messageText, { color: isOwn ? '#fff' : colors.text, paddingHorizontal: 10, paddingTop: 6, textAlign: rtl ? 'right' : 'left' }]}>
                        {msg.text}
                      </AppText>
                    )}
                    <Text style={[styles.messageTime, { color: isOwn ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.4)', paddingHorizontal: 10, paddingBottom: 6 }]}>
                      {formatMessageTime(msg.timestamp)}
                    </Text>
                  </View>
                ) : msg.audioUrl ? (
                  <View style={[styles.bubble, isOwn ? { backgroundColor: colors.accent } : { backgroundColor: '#ffffff' }]}>
                    {!isOwn && (
                      <AppText weight="regular" style={[styles.senderName, { color: colorForUser(msg.senderId) }]}>
                        {userNames[msg.senderId] ?? 'Loading...'}
                      </AppText>
                    )}
                    <VoiceMessageBubble
                      messageId={msg.id}
                      audioUrl={msg.audioUrl!}
                      audioDuration={msg.audioDuration ?? 0}
                      isOwn={isOwn}
                      playingId={playingId}
                      setPlayingId={setPlayingId}
                    />
                    <Text style={[styles.messageTime, { color: isOwn ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.4)' }]}>
                      {formatMessageTime(msg.timestamp)}
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.bubble, isOwn ? { backgroundColor: colors.accent } : { backgroundColor: '#ffffff' }]}>
                    {!isOwn && (
                      <AppText weight="regular" style={[styles.senderName, { color: colorForUser(msg.senderId) }]}>
                        {userNames[msg.senderId] ?? 'Loading...'}
                      </AppText>
                    )}
                    <AppText weight="regular" style={[styles.messageText, { color: isOwn ? '#fff' : colors.text }]}>
                      {msg.text}
                    </AppText>
                    <Text style={[styles.messageTime, { color: isOwn ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.4)' }]}>
                      {formatMessageTime(msg.timestamp)}
                    </Text>
                  </View>
                )}
              </View>
            );
          }}
        />
        {showScrollDown && (
          <TouchableOpacity
            style={[styles.scrollDownBtn, rtl ? { left: 16 } : { right: 16 }]}
            onPress={() => { flatListRef.current?.scrollToEnd({ animated: true }); setShowScrollDown(false); }}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <ChevronDown size={22} color="#004aad" strokeWidth={2.5} />
          </TouchableOpacity>
        )}
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
          {isMarketActive && (
            <TouchableOpacity style={chatStyles.menuItem} onPress={() => { closeMenu(); setListingPickerOpen(true); }} activeOpacity={0.7}>
              <View style={chatStyles.menuItemIcon}><ShoppingBag size={22} color="#004aad" strokeWidth={1.5} /></View>
              <AppText weight="regular" style={chatStyles.menuItemLabel}>{t('marketplace.share_to_market')}</AppText>
            </TouchableOpacity>
          )}
          {chatProjectId && !chatArchived && (
            <TouchableOpacity style={chatStyles.menuItem} onPress={() => { closeMenu(); setShowAddMission(true); }} activeOpacity={0.7}>
              <View style={chatStyles.menuItemIcon}><CheckSquare size={22} color="#004aad" strokeWidth={1.5} /></View>
              <AppText weight="regular" style={chatStyles.menuItemLabel}>{t('chats.add_task')}</AppText>
            </TouchableOpacity>
          )}
          {chatProjectId && !chatArchived && (
            <TouchableOpacity style={chatStyles.menuItem} onPress={() => { closeMenu(); setShowAddMeeting(true); }} activeOpacity={0.7}>
              <View style={chatStyles.menuItemIcon}><Calendar size={22} color="#004aad" strokeWidth={1.5} /></View>
              <AppText weight="regular" style={chatStyles.menuItemLabel}>{t('chats.add_meeting')}</AppText>
            </TouchableOpacity>
          )}
        </Animated.View>
      )}

      {/* Archived purchase chat — read-only banner replaces input */}
      {chatType === 'purchase' && chatArchived && (
        <View style={[styles.inputRow, { paddingBottom: BOTTOM_INSET + 10, borderTopColor: colors.border, backgroundColor: colors.card, flexDirection: 'column', gap: 8, alignItems: 'center' }]}>
          <AppText weight="semiBold" style={{ color: '#8890b0', fontSize: 13, textAlign: 'center' }}>
            {chatArchiveReason === 'cancelled'
              ? t('chats.purchase_cancelled')
              : chatArchiveReason === 'superseded'
              ? t('chats.purchase_not_relevant')
              : t('chats.purchase_completed')}
          </AppText>
          <TouchableOpacity
            onPress={handleDeleteChat}
            activeOpacity={0.7}
            style={{ borderWidth: 1.5, borderColor: '#ef4444', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 20 }}
          >
            <AppText weight="semiBold" style={{ color: '#ef4444', fontSize: 13 }}>
              {t('chats.delete_chat')}
            </AppText>
          </TouchableOpacity>
        </View>
      )}

      {/* Cancelled group (project) chat — read-only banner replaces input */}
      {chatType === 'group' && chatArchived && (
        <View style={[styles.inputRow, { paddingBottom: BOTTOM_INSET + 10, borderTopColor: colors.border, backgroundColor: colors.card, flexDirection: 'column', gap: 8, alignItems: 'center' }]}>
          <AppText weight="semiBold" style={{ color: '#8890b0', fontSize: 13, textAlign: 'center' }}>
            {t('chats.project_cancelled')}
          </AppText>
        </View>
      )}

      {/* BAMA System chat — read-only, user cannot reply */}
      {chatReadOnly && (
        <View style={[styles.inputRow, { paddingBottom: BOTTOM_INSET + 10, borderTopColor: colors.border, backgroundColor: colors.card, flexDirection: 'column', gap: 8, alignItems: 'center' }]}>
          <AppText weight="semiBold" style={{ color: '#8890b0', fontSize: 13, textAlign: 'center' }}>
            {t('chats.system_read_only')}
          </AppText>
        </View>
      )}

      {/* Recording bar — same geometry as input row, no position jump */}
      {isRecording && !chatReadOnly && !((chatType === 'purchase' || chatType === 'group') && chatArchived) && (
        <View style={[
          styles.inputRow,
          { borderTopColor: colors.border, backgroundColor: colors.card, paddingBottom: keyboardVisible ? 18 : BOTTOM_INSET + 10, alignItems: 'center' },
        ]}>
          <Animated.View style={[chatStyles.recordingDot, { opacity: pulseAnim }]} />
          <AppText weight="semiBold" style={chatStyles.recordingTimer}>
            {formatRecordingTime(recordingDuration)}
          </AppText>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={[styles.sendButton, { backgroundColor: '#ef4444' }]}
            onPress={cancelRecording}
            activeOpacity={0.7}
          >
            <AppText weight="semiBold" style={[styles.sendLabel, { color: '#fff' }]}>{t('chats.record_cancel')}</AppText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sendButton, { backgroundColor: colors.accent }]}
            onPress={stopAndSendRecording}
            activeOpacity={0.7}
          >
            <AppText weight="semiBold" style={[styles.sendLabel, { color: '#fff' }]}>{t('chats.record_send')}</AppText>
          </TouchableOpacity>
        </View>
      )}

      {/* Input */}
      {!isRecording && !chatReadOnly && !((chatType === 'purchase' || chatType === 'group') && chatArchived) && (
        <View style={[styles.inputRow, { borderTopColor: colors.border, backgroundColor: 'transparent', paddingBottom: keyboardVisible ? 18 : BOTTOM_INSET + 10 }]}>
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
                <TouchableOpacity
                  style={[styles.sendButton, { backgroundColor: colors.accent }]}
                  onPress={startRecording}
                  activeOpacity={0.7}
                >
                  <Mic size={20} color="#fff" strokeWidth={1.5} />
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      )}
    </KeyboardAvoidingView>

    {/* My-listings picker (post into the market channel) */}
    <Modal visible={listingPickerOpen} transparent animationType="fade" onRequestClose={() => setListingPickerOpen(false)}>
      <View style={styles.listingPickerOverlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setListingPickerOpen(false)} />
        <View style={styles.listingPickerCard}>
          <View style={[styles.listingPickerHeader, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
            <AppText weight="bold" style={styles.listingPickerTitle}>{t('marketplace.pick_listing_title')}</AppText>
            <TouchableOpacity onPress={() => setListingPickerOpen(false)} hitSlop={10} activeOpacity={0.7}>
              <X size={20} color="#004aad" strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          {myListings.length === 0 ? (
            <View style={{ paddingVertical: 28, alignItems: 'center', gap: 6 }}>
              <AppText weight="semiBold" style={[styles.listingPickerEmpty, { textAlign: rtl ? 'right' : 'left' }]}>
                {t('marketplace.no_listings_to_share')}
              </AppText>
              <AppText weight="regular" style={[styles.listingPickerHint, { textAlign: 'center' }]}>
                {t('marketplace.no_listings_hint')}
              </AppText>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 440 }} showsVerticalScrollIndicator={false}>
              {myListings.map((l) => (
                <ListingCard key={l.id} listing={l} onPress={() => handlePostListing(l)} />
              ))}
            </ScrollView>
          )}

          {postingListing && (
            <View style={styles.listingPickerBusy}>
              <ActivityIndicator color="#004aad" />
            </View>
          )}
        </View>
      </View>
    </Modal>

    {/* Chat Photo Modal */}
    <Modal visible={chatPhotoModalOpen} transparent animationType="fade" onRequestClose={() => setChatPhotoModalOpen(false)}>
      <View style={chatStyles.photoModalOverlay}>
        <View style={[chatStyles.photoModalTopBar, { paddingTop: TOP_INSET + 12 }]}>
          {(chatType !== 'community' || currentUserId === chatOwnerId) ? (
            <TouchableOpacity onPress={handleChangeChatPhoto} disabled={chatPhotoUploading} activeOpacity={0.7}>
              <AppText weight="semiBold" style={chatStyles.photoModalChangeBtn}>
                {chatPhotoUploading ? '...' : t('chats.change_photo')}
              </AppText>
            </TouchableOpacity>
          ) : (
            <View />
          )}
          <TouchableOpacity onPress={() => setChatPhotoModalOpen(false)} activeOpacity={0.7}>
            <X size={22} color="#fff" strokeWidth={2} />
          </TouchableOpacity>
        </View>
        <TouchableWithoutFeedback onPress={() => setChatPhotoModalOpen(false)}>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            {chatPhotoURL ? (
              <Image source={{ uri: chatPhotoURL }} style={chatStyles.photoModalImage} />
            ) : (
              <View style={[chatStyles.photoModalImage, chatStyles.headerPhotoFallback]}>
                <AppText style={{ fontSize: 64, color: '#004aad', fontWeight: '700' }}>{chatName?.[0] ?? '?'}</AppText>
              </View>
            )}
          </View>
        </TouchableWithoutFeedback>
      </View>
    </Modal>

    {/* Media preview modal — confirm before sending */}
    <Modal
      visible={pendingMedia !== null}
      transparent
      animationType="fade"
      onRequestClose={() => { setPendingMedia(null); setPendingCaption(''); }}
    >
      <KeyboardAvoidingView
        style={previewStyles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[previewStyles.topBar, { paddingTop: TOP_INSET + 12 }]}>
          <TouchableOpacity onPress={() => { setPendingMedia(null); setPendingCaption(''); }} activeOpacity={0.7}>
            <X size={26} color="#fff" strokeWidth={2} />
          </TouchableOpacity>
        </View>
        <View style={previewStyles.previewArea}>
          {pendingMedia?.type === 'video' ? (
            <VideoPlayer uri={pendingMedia.uri} style={previewStyles.previewMedia} />
          ) : (
            <Image source={{ uri: pendingMedia?.uri }} style={previewStyles.previewMedia} resizeMode="contain" />
          )}
        </View>
        <View style={[previewStyles.bottomBar, { paddingBottom: BOTTOM_INSET + 12 }]}>
          <TextInput
            style={[previewStyles.captionInput, { ...font.regular }]}
            value={pendingCaption}
            onChangeText={setPendingCaption}
            placeholder={t('chats.caption_placeholder')}
            placeholderTextColor="rgba(255,255,255,0.5)"
            multiline
            returnKeyType="default"
          />
          <TouchableOpacity style={previewStyles.sendBtn} onPress={handleSendPendingMedia} activeOpacity={0.8}>
            <AppText weight="bold" style={previewStyles.sendBtnText}>{t('chats.record_send')}</AppText>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>

    {/* Fullscreen media viewer (image: pinch-zoom + double-tap; video: native controls) */}
    <PortfolioViewer
      assets={viewingMedia ? [{
        id: 'chat-media',
        url: viewingMedia.url,
        type: viewingMedia.type,
        thumbnailUrl: null,
        uploadedAt: { seconds: 0, nanoseconds: 0 },
      } as MediaAsset] : []}
      initialIndex={0}
      visible={viewingMedia !== null}
      onClose={() => setViewingMedia(null)}
    />

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
        minDate={todayISO}
        maxDate={projectDeadline}
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
        minDate={todayISO}
        maxDate={projectDeadline}
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

              {/* Community avatar — editable by owner */}
              {chatType === 'community' && (
                <View style={{ alignItems: 'center', marginBottom: 20 }}>
                  <TouchableOpacity
                    onPress={currentUserId === chatOwnerId ? handleChangeCommunityPhoto : undefined}
                    activeOpacity={currentUserId === chatOwnerId ? 0.8 : 1}
                    style={{ position: 'relative' }}
                  >
                    {communityPhotoURL ? (
                      <Image
                        source={{ uri: communityPhotoURL }}
                        style={{ width: 72, height: 72, borderRadius: 16 }}
                      />
                    ) : (
                      <LinearGradient
                        colors={['#1e4fa3', '#cb6ce6']}
                        style={{ width: 72, height: 72, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <AppText weight="bold" style={{ color: '#fff', fontSize: 28 }}>
                          {(chatName ?? '?').charAt(0).toUpperCase()}
                        </AppText>
                      </LinearGradient>
                    )}
                    {currentUserId === chatOwnerId && !communityPhotoUploading && (
                      <View style={{
                        position: 'absolute', bottom: -4, right: -4,
                        width: 24, height: 24, borderRadius: 12,
                        backgroundColor: 'rgba(255,255,255,0.25)',
                        alignItems: 'center', justifyContent: 'center',
                        borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)',
                      }}>
                        <Camera size={12} color="#fff" strokeWidth={2} />
                      </View>
                    )}
                    {communityPhotoUploading && (
                      <View style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.45)',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <ActivityIndicator size="small" color="#fff" />
                      </View>
                    )}
                  </TouchableOpacity>
                  <AppText weight="semiBold" style={{ color: '#fff', marginTop: 8, fontSize: 15 }}>
                    {chatName}
                  </AppText>
                </View>
              )}

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
                  {currentUserId === chatOwnerId && !isGeneralChannel(ch.name) && !isMarketChannel(ch) && (
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
    backgroundColor: '#ffffff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
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
    borderColor: '#004aad',
    backgroundColor: '#ffffff',
  },
  channelPillActive: {
    backgroundColor: '#004aad',
    borderColor: '#004aad',
  },
  channelPillText: {
    fontSize: 13,
    color: '#004aad',
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
  listingAnnouncePill: {
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fdeceb',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
    maxWidth: '90%',
  },
  listingAnnounceText: { fontSize: 12.5, color: '#c0392b', textAlign: 'center' },
  listingWrapper: { width: '100%', alignItems: 'center', marginTop: 6 },
  listingCard: {
    width: '82%',
    borderRadius: 18,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    shadowColor: '#1e4fa3',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  listingHeader: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8, gap: 4 },
  listingHeaderRow: { alignItems: 'center', gap: 8 },
  listingHeaderAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#eef0fa' },
  listingHeaderAvatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#6c5ce0' },
  listingHeaderAvatarText: { fontSize: 15, color: '#ffffff' },
  listingHeaderName: { flex: 1, fontSize: 14.5, color: '#2a2f5a' },
  listingHeaderTime: { fontSize: 11.5, color: '#8890b0' },
  scrollDownBtn: {
    position: 'absolute',
    bottom: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1e4fa3',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  listingImage: { width: '100%', height: 150, backgroundColor: '#eef0fa' },
  listingImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  listingRibbon: {
    position: 'absolute',
    top: 10,
    backgroundColor: '#e0483d',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  listingRibbonSale: { backgroundColor: '#004aad' },
  listingRibbonText: { fontSize: 12, color: '#ffffff' },
  listingRemovedBadge: {
    position: 'absolute',
    top: 10,
    backgroundColor: '#6b7280',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  listingRemovedText: { fontSize: 12, color: '#ffffff' },
  listingBody: { padding: 14, gap: 5 },
  listingTitle: { fontSize: 17, color: '#2a2f5a' },
  listingPrice: { fontSize: 21, color: '#6c5ce0' },
  listingSellerRow: { alignItems: 'center', gap: 7, marginTop: 2 },
  listingAvatar: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#6c5ce0', alignItems: 'center', justifyContent: 'center' },
  listingAvatarText: { fontSize: 11, color: '#ffffff' },
  listingPoster: { fontSize: 12.5, color: '#8890b0' },
  listingCta: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 13,
    paddingVertical: 12,
  },
  listingCtaText: { color: '#ffffff', fontSize: 14.5 },
  listingCtaDisabled: { backgroundColor: '#c3c7d4' },
  listingPickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', paddingHorizontal: 20 },
  listingPickerCard: { backgroundColor: '#ffffff', borderRadius: 20, padding: 16 },
  listingPickerHeader: { alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  listingPickerTitle: { fontSize: 17, color: '#004aad' },
  listingPickerEmpty: { fontSize: 15, color: '#2a2f5a' },
  listingPickerHint: { fontSize: 13, color: '#9aa0b8', maxWidth: 240 },
  listingPickerBusy: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  systemWrapper: {
    width: '100%',
    alignItems: 'center',
    marginVertical: 8,
  },
  systemPill: {
    maxWidth: '88%',
    alignItems: 'center',
    gap: 8,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  systemPillMeeting: { backgroundColor: 'rgba(30,79,163,0.08)' },
  systemPillMission: { backgroundColor: 'rgba(203,108,230,0.10)' },
  systemPillPrice: { backgroundColor: 'rgba(28,157,99,0.10)' },
  systemHeadline: {
    fontSize: 13,
    textAlign: 'center',
  },
  systemDetail: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
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
    width: '75%',
    borderRadius: 18,
    overflow: 'hidden',
  },
  mediaMessage: {
    width: '100%',
    aspectRatio: 16 / 9,
    minHeight: 0,
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
  dateSepRow: {
    alignItems: 'center',
    marginVertical: 10,
  },
  dateSepLabel: {
    fontSize: 12,
    color: 'rgba(0,0,0,0.45)',
    backgroundColor: 'rgba(0,0,0,0.06)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    overflow: 'hidden',
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
    gap: 8,
    paddingVertical: 4,
    minWidth: 210,
  },
  audioPlayBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  audioDurationText: { fontSize: 13, fontWeight: '600', minWidth: 32 },
  audioTrackOuter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 20,
  },
  audioHandleDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    flexShrink: 0,
  },
  audioTimeText: {
    fontSize: 12,
    minWidth: 28,
    textAlign: 'center',
  },
  headerHint: { fontSize: 11, color: '#8890b0', marginTop: 1, textAlign: 'center' },
  headerPhotoBtn: { marginLeft: 2, alignItems: 'center', justifyContent: 'center' },
  headerPhoto: { width: 36, height: 36, borderRadius: 18 },
  headerPhotoFallback: { backgroundColor: '#004aad22', alignItems: 'center', justifyContent: 'center' },
  headerPhotoFallbackText: { fontSize: 15, color: '#004aad', fontWeight: '700' },
  photoModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)' },
  photoModalTopBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12 },
  photoModalChangeBtn: { fontSize: 15, color: '#fff' },
  photoModalImage: { width: 260, height: 260, borderRadius: 130 },
});

const previewStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  previewArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  previewMedia: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  captionInput: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    maxHeight: 80,
    paddingVertical: 4,
  },
  sendBtn: {
    backgroundColor: '#004aad',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  sendBtnText: { color: '#fff', fontSize: 15 },
});
