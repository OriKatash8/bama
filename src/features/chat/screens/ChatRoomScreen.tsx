import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isolate } from '@utils/formatters';
import { BottomSheet } from '@components/ui/BottomSheet';
import { useModeAccent } from '@core/navigation/floatingTabBar';
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

import { MentionAutocomplete } from '../components/MentionAutocomplete';
import { EVERYONE_TOKENS, useMentionAutocomplete } from '../hooks/useMentionAutocomplete';
import { splitMentionRuns, type MentionTarget } from '../utils/mentions';
import { usePendingMentions } from '../hooks/usePendingMentions';

const TOP_INSET = initialWindowMetrics?.insets.top ?? 0;
const BOTTOM_INSET = initialWindowMetrics?.insets.bottom ?? 0;
import {
  getDoc, updateDoc, doc, Timestamp,
  collection, onSnapshot, query,
  addDoc, setDoc, serverTimestamp,
  orderBy,
} from 'firebase/firestore';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useActiveChatStore } from '@core/stores/activeChatStore';
import { Plus, Camera, CheckSquare, Calendar, Coins, Flag, Paperclip, Mic, Play, Pause, X, Eye, ShoppingBag, ChevronDown, Users, UserMinus } from 'lucide-react-native';
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
import { channelDocToMessage, listenToMessages, sendMessage, hideChatForUser } from '../services/chatService';
import { confirmDialog } from '@utils/confirmDialog';
import { listenToProjectFee } from '@features/pricing/services/feesService';
import { showsOnBalance } from '@features/pricing/utils/balance';
import type { ProjectFee } from '@core/types/project';
import { addMission } from '../services/missionService';
import { addMeeting } from '../services/meetingService';
import { formatMeetingDetail } from '../utils/meetingText';
import { MiniCalendar } from '@features/crew/components';
import { PurchaseBanner } from '@features/marketplace/components/PurchaseBanner';
import { CandidateReviewCard } from '../components/candidates/CandidateReviewCard';
import { CandidateProCard } from '../components/candidates/CandidateProCard';
import { ListingDetailModal } from '@features/marketplace/components/ListingDetailModal';
import { ListingCard } from '@features/marketplace/components/ListingCard';
import { useMarketplaceListings } from '@features/marketplace/hooks/useMarketplaceListings';
import { shareListingToCommunities } from '@features/marketplace/services/marketplaceService';
import type { MarketplaceListing } from '@features/marketplace/types';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import type { Chat, Message } from '../types';
import { GENERAL_CHANNEL_NAMES, type Channel } from '../communityChannels';
import { PortfolioViewer } from '@features/profile/components/PortfolioViewer';
import type { MediaAsset } from '@core/types/media';

type Translations = typeof en;

/** Names the General channel has shipped under. Matched language-agnostically so
 *  a community created in one language still resolves in the other. */
function makeT(translations: Translations) {
  return (key: string, vars?: Record<string, string>): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    if (typeof result !== 'string') return key;
    if (!vars) return result;
    return result.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
  };
}

type T = ReturnType<typeof makeT>;

/** The add sheets' header tile — the same gradient as on project details. */
const SHEET_TILE_GRADIENT = ['#2563EB', '#6D34DE', '#9A4BF0'] as const;

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

type SystemVariant = 'meeting' | 'mission' | 'price_change' | 'completion' | 'crew' | 'left' | 'neutral';

/**
 * Which section of project-details a system message opens. Keyed by the variant
 * parseSystemMessage derives from the text, so no new field is needed on the
 * message document and existing messages become tappable too.
 *
 * 'neutral' is absent on purpose: it has no section to open.
 */
const SYSTEM_SECTION: Partial<Record<SystemVariant, 'missions' | 'meetings' | 'payments'>> = {
  mission: 'missions',
  meeting: 'meetings',
  price_change: 'payments',
};

/**
 * Variants that open project-details with NO section. Completion is one: the
 * complete / request / dispute bar is pinned to the bottom of that screen rather
 * than living in the scroll, so there is nothing to scroll to — but opening the
 * screen is still exactly what the reader wants to do next.
 */
const SYSTEM_OPENS_UNSECTIONED: Partial<Record<SystemVariant, true>> = { completion: true };

/**
 * System messages are written in Hebrew — by the app and by the triggers in
 * functions/ — and stored that way, so the text is matched on its Hebrew and the
 * headline is rebuilt from the variant in the reader's language. Details that are
 * someone's own words (a task's title, a price note) stay as they were written.
 */
function parseSystemMessage(text: string, t: T, lang: 'he' | 'en'): { variant: SystemVariant; headline: string; detail: string } {
  if (text.startsWith('📅')) {
    return { variant: 'meeting', headline: t('chats.system_meeting_title'), detail: formatMeetingDetail(text, lang) };
  }
  if (text.startsWith('📋')) {
    return {
      variant: 'mission',
      headline: t('chats.system_mission_title'),
      detail: text.replace(/^📋\s*משימה חדשה:\s*/, '').trim(),
    };
  }
  // Match by the Hebrew phrase (not only the emoji) so the amber price pill renders
  // identically on web and native, regardless of emoji encoding differences.
  if (text.startsWith('💰') || text.includes('בקשת שינוי מחיר')) {
    const detail = text.replace(/^(?:💰\s*)?בקשת שינוי מחיר:?\s*/, '').trim();
    return { variant: 'price_change', headline: t('chats.system_price_title'), detail };
  }
  // Matched by phrase as well as emoji, for the same encoding reason as above.
  if (text.startsWith('🏁') || text.includes('בקשת סיום פרויקט') || text.includes('הפרויקט הושלם')) {
    const done = text.includes('הפרויקט הושלם');
    const detail = text.replace(/^(?:🏁\s*)?(?:בקשת סיום פרויקט:?|הפרויקט הושלם)\s*/, '').trim();
    return {
      variant: 'completion',
      headline: done ? t('chats.system_completion_done') : t('chats.system_completion_title'),
      detail,
    };
  }
  // maybeActivateProject (functions/src/lifecycle/candidates.ts): every hired
  // professional confirmed and no seat empty — the crew is set.
  if (text.startsWith('🎬') || text.includes('הצוות נסגר')) {
    const detail = text.replace(/^(?:🎬\s*)?הצוות נסגר:?\s*/, '').trim();
    return { variant: 'crew', headline: t('chats.system_crew_title'), detail };
  }
  // releaseEngagement (functions/src/lifecycle/removal.ts): a professional left
  // or was released ("עזב את הפרויקט"), or declined during review ("החליט/ה לא
  // להמשיך בפרויקט"). Used to fall through to 'neutral' and wear the meeting icon.
  if (text.includes('עזב את הפרויקט') || text.includes('החליט/ה לא להמשיך בפרויקט')) {
    // releaseNotice writes "<name> <phrase>", so the name is whatever precedes it.
    const declined = text.includes('החליט/ה לא להמשיך בפרויקט');
    const phrase = declined ? 'החליט/ה לא להמשיך בפרויקט' : 'עזב את הפרויקט';
    const name = text.split(phrase)[0]?.trim() ?? '';
    return {
      variant: 'left',
      headline: t(declined ? 'chats.system_declined' : 'chats.system_left', { name }),
      detail: '',
    };
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

/**
 * A message's text, with its mentions marked.
 *
 * Rendered as plain <Text> rather than <AppText>: AppText picks Heebo vs
 * Montserrat by regex-testing extractString(children), which returns '' for
 * ELEMENT children — so the moment the bubble becomes nested runs, every Hebrew
 * bubble silently switches to the Latin face. The font is resolved here from
 * the whole raw string instead.
 *
 * Each mention is wrapped in `isolate` (U+2068 FSI … U+2069 PDI), which lives
 * in @utils/formatters beside rtlSafe — the reply quote needs the same thing
 * for the name it shows, and the reasoning is written up there.
 */

function MessageBody({ msg, rtl, names, color, accent, font, onPressMention }: {
  msg: Message;
  rtl: boolean;
  names: Record<string, string>;
  color: string;
  accent: string;
  font: ReturnType<typeof useAppFont>;
  onPressMention: (userId: string) => void;
}) {
  const targets: MentionTarget[] = (msg.mentions ?? []).map((userId) => ({
    userId,
    name: names[userId] ?? '',
  }));
  const runs = splitMentionRuns(
    msg.text,
    targets,
    msg.mentionsEveryone ? [...EVERYONE_TOKENS] : [],
  );

  return (
    <Text
      testID="message-body"
      style={[
        styles.messageText,
        { color, writingDirection: rtl ? 'rtl' : 'ltr', textAlign: rtl ? 'right' : 'left' },
        font.forText(msg.text, 'regular'),
      ]}
    >
      {runs.map((run, i) =>
        run.userId || run.everyone ? (
          <Text
            key={i}
            testID={run.userId ? `mention-${run.userId}` : 'mention-everyone'}
            style={[styles.mentionRun, { color: accent }]}
            onPress={run.userId ? () => onPressMention(run.userId!) : undefined}
          >
            {isolate(run.text)}
          </Text>
        ) : (
          run.text
        ),
      )}
    </Text>
  );
}

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
  // Buttons, the back arrow and my own bubbles follow the mode: purple in the
  // client app, blue in the pro app.
  const { accent: modeAccent, tint: modeTint } = useModeAccent();
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
  /**
   * Where the list is pinned while opening, until the user drags.
   *
   * Was a boolean meaning "pin to bottom". It has to be a TARGET because
   * jump-to-mention cannot win against it otherwise: onLayout and every
   * onContentSizeChange re-scroll while pinned, and rows remeasure late as
   * images and listing cards land, so a one-off scrollToIndex is overridden a
   * frame later. isAtBottomRef alone is not enough for the same reason — the
   * first scrollToEnd lands short and the last message sits below the fold.
   */
  const pinTargetRef = useRef<{ kind: 'bottom' } | { kind: 'message'; id: string } | null>({ kind: 'bottom' });
  const [chatName, setChatName] = useState<string>('');
  const [chatType, setChatType] = useState<Chat['type'] | null>(null);
  const [chatArchived, setChatArchived] = useState(false);
  const [chatReadOnly, setChatReadOnly] = useState(false);
  const [chatReadOnlyReason, setChatReadOnlyReason] = useState<string | null>(null);
  // Projects completed before the chat was flagged server-side have no readOnly
  // field; the linked project's status stands in for it so old group chats close
  // too, without a backfill.
  const [projectCompleted, setProjectCompleted] = useState(false);
  const [chatArchiveReason, setChatArchiveReason] = useState<'completed' | 'cancelled' | 'superseded' | null>(null);
  const [chatProjectId, setChatProjectId] = useState<string | undefined>(undefined);
  const [projectDeadline, setProjectDeadline] = useState<string | undefined>(undefined);
  // Who owns this project. The fee entry point keys off this, not activeMode —
  // mode picks the tab, it does not decide your role on a given project.
  const [projectClientId, setProjectClientId] = useState<string | undefined>(undefined);
  const [projectStatus, setProjectStatus] = useState<string | undefined>(undefined);
  // True while the review card is a carousel the client can swipe through.
  const [cardSwipeable, setCardSwipeable] = useState(false);
  const [chatOwnerId, setChatOwnerId] = useState<string>('');
  const [chatPhotoURL, setChatPhotoURL] = useState<string | null>(null);
  const [chatPhotoModalOpen, setChatPhotoModalOpen] = useState(false);
  const [chatPhotoUploading, setChatPhotoUploading] = useState(false);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [chatMembers, setChatMembers] = useState<string[]>([]);
  /** Caret, a logical index. Fed by onSelectionChange; drives @-detection. */
  const [caret, setCaret] = useState(0);
  /**
   * Passed to the TextInput for EXACTLY ONE render after an insertion, then
   * reset to undefined.
   *
   * react-native-web applies `selection` in a useLayoutEffect keyed on the
   * object itself, so a fresh {start,end} literal every render re-runs it and
   * forces the caret back on every keystroke — a web-only broken field. On iOS
   * the same one-shot pattern also avoids the multiline quirk where a
   * programmatic selection scrolls the field.
   */
  const [pendingSelection, setPendingSelection] = useState<{ start: number; end: number } | undefined>();
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

  /** Text + caret move together when a mention is inserted. */
  const applyComposerChange = useCallback((next: string, nextCaret: number) => {
    setInputText(next);
    setCaret(nextCaret);
    setPendingSelection({ start: nextCaret, end: nextCaret });
  }, []);

  const mention = useMentionAutocomplete({
    text: inputText,
    caret,
    memberIds: chatMembers,
    memberNames,
    currentUserId,
    // @everyone reaches the whole roster and overrides mute, so it is the
    // community owner's alone — the same predicate the rule enforces.
    canMentionEveryone: chatType === 'community' && currentUserId === chatOwnerId,
    enabled: chatType !== 'dm',
    onChange: applyComposerChange,
  });

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
      setChatReadOnlyReason((data as { readOnlyReason?: string }).readOnlyReason ?? null);
      setChatArchiveReason(data.archiveReason ?? null);
      setChatProjectId(data.projectId);
      if (data.ownerId) setChatOwnerId(data.ownerId);
      if (data.members) setChatMembers(data.members as string[]);
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
    }, (err) => {
      // A permission-denied here is what a removed member gets: they are no
      // longer in the chat's `members`, so the rule denies the read. With no
      // error callback this did nothing at all — the screen sat on stale content
      // and looked frozen, which is the same silent-empty shape that has now
      // caused three bugs. Send them somewhere they can actually read.
      console.error('[chat] chat listener failed:', err?.code, err);
      router.replace(`/${activeMode === 'client' ? '(client)' : '(professional)'}/(tabs)/chats`);
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

  // While this room is on screen, pushes for it are not shown (see
  // foregroundHandler). Focus, not mount: a screen pushed on top of the room
  // (project details, a profile) means the user is no longer reading it.
  useFocusEffect(
    useCallback(() => {
      useActiveChatStore.getState().setActive(chatId, chatType === 'community' ? activeChannelId || null : null);
      return () => useActiveChatStore.getState().clear(chatId);
    }, [chatId, chatType, activeChannelId]),
  );

  const pendingMentions = usePendingMentions();

  /**
   * Re-apply the pin. Called from onLayout and from every onContentSizeChange
   * while a target is set, because rows remeasure late — that repetition is
   * what makes the jump stick instead of being overridden a frame later.
   */
  const applyPin = useCallback(() => {
    const target = pinTargetRef.current;
    if (!target) return;
    if (target.kind === 'bottom') { flatListRef.current?.scrollToEnd({ animated: false }); return; }
    const index = listItems.findIndex((it) => it.id === target.id);
    if (index < 0) return;
    flatListRef.current?.scrollToIndex({ index, animated: false, viewPosition: 0.3 });
  }, [listItems]);

  /** Which chat/channel we have already jumped in, so a snapshot arriving
   *  mid-read cannot yank the list a second time. */
  const jumpedRef = useRef('');
  const mentionChannelId = chatType === 'community' ? activeChannelId || null : null;

  // Entering a chat — or switching channel — opens on the last message.
  useEffect(() => {
    pinTargetRef.current = { kind: 'bottom' };
    isAtBottomRef.current = true;
    setShowScrollDown(false);
    flatListRef.current?.scrollToEnd({ animated: false });
  }, [chatId, activeChannelId]);

  // ...unless a mention is waiting here, in which case open on the OLDEST one
  // still unseen. That is what lets the @ pill clear on open without a
  // per-message read receipt.
  //
  // Runs again when the snapshot lands, because opening from a push arrives
  // before the mention list does — the ref keeps it to once per chat.
  useEffect(() => {
    const key = `${chatId}|${mentionChannelId ?? ''}`;
    if (jumpedRef.current === key) return;
    const jumpTo = pendingMentions.firstFor(chatId, mentionChannelId);
    if (!jumpTo) return;
    jumpedRef.current = key;
    pinTargetRef.current = { kind: 'message', id: jumpTo.messageId };
    isAtBottomRef.current = false;
    applyPin();
  }, [chatId, mentionChannelId, pendingMentions, applyPin]);

  // Opening clears this chat's mentions — ONE path for group chats and channels
  // alike, which is why it does not hang off unreadCount (communities have no
  // unread state at all). Declared AFTER the jump so the jump reads the entry
  // before it goes; `clear` no-ops when nothing matches, so this cannot loop
  // against its own snapshot.
  useEffect(() => {
    if (!chatId) return;
    void pendingMentions.clear(chatId, mentionChannelId);
  }, [chatId, mentionChannelId, pendingMentions]);

  // Community: listen to active channel messages
  useEffect(() => {
    if (chatType !== 'community' || !activeChannelId) return;
    const q = query(
      collection(db, 'chats', chatId, 'channels', activeChannelId, 'messages'),
      orderBy('timestamp', 'asc'),
    );
    return onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => channelDocToMessage(d.id, d.data())));
    });
  }, [chatId, chatType, activeChannelId]);

  // Load the linked project's end date so mission/meeting dates can be
  // constrained to the project window (today → project end).
  useEffect(() => {
    if (!chatProjectId) { setProjectDeadline(undefined); setProjectCompleted(false); return; }
    // LIVE, not a one-time read: the candidate review card and the status chip
    // follow the project's status, and a project going 'in_progress' (or
    // completing) while the chat is open has to reach them without a reload.
    return onSnapshot(
      doc(db, 'projects', chatProjectId),
      (snap) => {
        // Same document as before — clientId and status cost nothing extra.
        const data = snap.exists()
          ? (snap.data() as { deadline?: string; status?: string; clientId?: string })
          : undefined;
        const dl = data?.deadline;
        setProjectDeadline(dl && dl !== 'flexible' ? dl : undefined);
        setProjectCompleted(data?.status === 'completed');
        setProjectStatus(data?.status);
        setProjectClientId(data?.clientId);
      },
      () => {
        setProjectDeadline(undefined);
        setProjectCompleted(false);
        setProjectStatus(undefined);
        setProjectClientId(undefined);
      },
    );
  }, [chatProjectId]);

  // This professional's own fee on the linked project, so a completed-but-unpaid
  // chat can offer a way to settle.
  //
  // Gated on ROLE, not mode. Keying this on activeMode meant a professional
  // browsing in client mode lost the pay button on a project they owe on. The
  // client never reads fee documents (§6) and the rules deny them, so the gate
  // is "I am not this project's client".
  //
  // Self-hire (client also hired as a professional) resolves to the client:
  // no money moved between parties, so there is no fee to settle.
  const [myProjectFee, setMyProjectFee] = useState<ProjectFee | null>(null);
  useEffect(() => {
    if (!chatProjectId || !currentUserId || !projectClientId || projectClientId === currentUserId) {
      setMyProjectFee(null);
      return;
    }
    return listenToProjectFee(chatProjectId, currentUserId, setMyProjectFee);
  }, [chatProjectId, currentUserId, projectClientId]);

  // One switch for "this conversation is closed to new messages".
  const isReadOnly = chatReadOnly || projectCompleted;
  // Independent of isReadOnly by design: an early payment on an ACTIVE project
  // frees the slot while the chat stays open, and a completed chat is read-only
  // whether or not anything is owed.
  // The SECOND door to the balance screen, and it had the same amount-shaped
  // gate (`outstandingFee(...) > 0`) as the first. Same predicate as the
  // screen's own row filter, so the door and the room cannot disagree.
  const balanceReachable = showsOnBalance(myProjectFee);
  const readOnlyLabel = chatReadOnlyReason === 'completed' || projectCompleted
    ? t('chats.completed_read_only')
    : t('chats.system_read_only');

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
    // Derived from what is actually being sent, not from what was picked:
    // backspace deletes one character rather than the whole token, so a
    // half-deleted "@Dana Coh" must drop the push along with the highlight.
    const { mentions, everyone } = mention.resolveMentions(text);
    setInputText('');
    setCaret(0);
    if (chatType === 'community' && activeChannelId) {
      await addDoc(
        collection(db, 'chats', chatId, 'channels', activeChannelId, 'messages'),
        {
          senderId: currentUserId, text, timestamp: serverTimestamp(), readBy: [currentUserId],
          ...(mentions.length ? { mentions } : {}),
          ...(everyone ? { mentionsEveryone: true } : {}),
        },
      );
      await updateDoc(doc(db, 'chats', chatId, 'channels', activeChannelId), {
        lastMessage: { text, senderId: currentUserId, timestamp: serverTimestamp() },
      });
    } else {
      await sendMessage(chatId, currentUserId, text, mentions.length ? { mentions } : undefined);
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

  return (
    <LinearGradient colors={colors.bgGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.container}>
    {/*
      The screen's swipe-back and the review card's swipe are the same motion.
      The app lays out left to right (I18nManager.allowRTL(false)), so the back
      gesture starts on the left edge — which is exactly where a Hebrew reader
      begins a right-swipe to see the next professional. One of them has to give
      way, and while the card is swipeable it is the screen's: the back button in
      the header still goes back, and the gesture returns the moment the client
      is down to one professional to decide on.
    */}
    <Stack.Screen options={{ headerShown: false, gestureEnabled: !cardSwipeable }} />
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: '#ffffff', borderBottomColor: colors.border, paddingTop: TOP_INSET + 8 }]}>
        {/* dismissTo, not push: the list is already underneath us, and pushing
            a second copy on top of it left this room mounted, played the
            forward animation, and held the app header and the tab bar back
            until the new list had rendered (they key off usePathname). Falls
            back to navigating there for a chat opened cold from a
            notification. */}
        <TouchableOpacity onPress={() => router.dismissTo(`/${activeMode === 'client' ? '(client)' : '(professional)'}/(tabs)/chats${chatType === 'community' ? '?tab=communities' : ''}`)} style={styles.headerBack} activeOpacity={0.7}>
          <Text style={[styles.headerBackText, { color: modeAccent, ...font.regular }]}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          {chatType === 'group' && chatProjectId ? (
            <TouchableOpacity
              style={styles.headerNameTouchable}
              onPress={() => router.push(`/(client)/chat/project-details?projectId=${chatProjectId}&chatId=${chatId}`)}
              activeOpacity={0.8}
            >
              <AppText weight="bold" style={styles.headerName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.4}>
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
              <AppText weight="bold" style={styles.headerName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.4}>
                {chatName}
              </AppText>
              <AppText style={chatStyles.headerHint}>{t('chats.purchase_info_hint')}</AppText>
            </TouchableOpacity>
          ) : chatType === 'community' ? (
            <TouchableOpacity
              style={styles.headerNameTouchable}
              onPress={() => router.push(`/(client)/chat/community-details?chatId=${chatId}`)}
              activeOpacity={0.8}
            >
              <AppText weight="bold" style={styles.headerName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.4}>
                {chatName}
              </AppText>
              <AppText style={chatStyles.headerHint}>{t('chats.click_for_community_info')}</AppText>
            </TouchableOpacity>
          ) : (
            <AppText weight="bold" style={styles.headerName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.4}>
              {chatName}
            </AppText>
          )}
        </View>
        <View style={[styles.headerRight, { alignItems: 'flex-start', justifyContent: 'center' }]}>
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

      {/* Candidate review — pinned header chrome, above the message list so it
          does not scroll. Role decides which side renders, never the mode: the
          client decides, a professional sees where he stands. Both hide
          themselves when there is nothing to show. */}
      {chatType === 'group' && !!chatProjectId && !!projectClientId && !isReadOnly && !chatArchived && (
        projectClientId === currentUserId
          ? (
            <CandidateReviewCard
              projectId={chatProjectId}
              chatId={chatId}
              clientId={currentUserId}
              onSwipeableChange={setCardSwipeable}
            />
          )
          : <CandidateProCard projectId={chatProjectId} chatId={chatId} proId={currentUserId} projectStatus={projectStatus} />
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
          onScrollBeginDrag={() => { pinTargetRef.current = null; }}
          onLayout={() => applyPin()}
          onContentSizeChange={() => {
            if (pinTargetRef.current) { applyPin(); return; }
            if (isAtBottomRef.current) flatListRef.current?.scrollToEnd({ animated: false });
          }}
          // No getItemLayout on these variable-height rows, so scrollToIndex
          // WILL fail until they are measured. Nudge toward the estimate and
          // let the next content-size change try again.
          onScrollToIndexFailed={(info) => {
            flatListRef.current?.scrollToOffset({
              offset: info.averageItemLength * info.index,
              animated: false,
            });
          }}
          renderItem={({ item }) => {
            if ('type' in item && item.type === 'date-separator') {
              return <DateSeparator label={(item as { label: string }).label} />;
            }
            const msg = item as Message;
            if (msg.system || msg.senderId === 'system') {
              const { variant, headline, detail } = parseSystemMessage(msg.text ?? '', t, rtl ? 'he' : 'en');
              // Black, like the text beside it: the pill's own tint is what
              // tells the variants apart now.
              const accent = '#000000';
              // Each known kind names a section of project-details. 'neutral' has
              // nowhere to go — that is "X left the project" and the purchase-chat
              // notices — and a chat with no projectId has no details screen at
              // all, so both stay inert rather than navigating nowhere.
              const targetSection = SYSTEM_SECTION[variant];
              const canOpen = (!!targetSection || !!SYSTEM_OPENS_UNSECTIONED[variant]) && !!chatProjectId;
              const pill = (
                <View style={[
                  styles.systemPill,
                  variant === 'mission' ? styles.systemPillMission : variant === 'price_change' || variant === 'crew' ? styles.systemPillPrice : variant === 'completion' ? styles.systemPillCompletion : variant === 'left' ? styles.systemPillLeft : styles.systemPillMeeting,
                  { flexDirection: rtl ? 'row-reverse' : 'row' },
                ]}>
                  {variant === 'mission'
                    ? <CheckSquare size={16} color={accent} strokeWidth={2} />
                    : variant === 'price_change'
                      ? <Coins size={16} color={accent} strokeWidth={2} />
                      : variant === 'completion'
                        ? <Flag size={16} color={accent} strokeWidth={2} />
                        : variant === 'crew'
                          ? <Users size={16} color={accent} strokeWidth={2} />
                          : variant === 'left'
                            ? <UserMinus size={16} color={accent} strokeWidth={2} />
                            : <Calendar size={16} color={accent} strokeWidth={2} />}
                  <View style={{ flexShrink: 1 }}>
                    <AppText weight="bold" style={styles.systemHeadline}>
                      {headline}
                    </AppText>
                    {!!detail && (
                      <AppText weight="regular" style={styles.systemDetail}>{detail}</AppText>
                    )}
                  </View>
                </View>
              );
              return (
                <View style={styles.systemWrapper}>
                  {canOpen ? (
                    <TouchableOpacity
                      onPress={() => router.push(
                        targetSection
                          ? `/(client)/chat/project-details?projectId=${chatProjectId}&chatId=${chatId}&section=${targetSection}`
                          : `/(client)/chat/project-details?projectId=${chatProjectId}&chatId=${chatId}`,
                      )}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                    >
                      {pill}
                    </TouchableOpacity>
                  ) : pill}
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
                  <View style={[styles.mediaBubble, { backgroundColor: isOwn ? modeAccent : '#ffffff' }]}>
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
                  <View style={[styles.mediaBubble, { backgroundColor: isOwn ? modeAccent : '#ffffff' }]}>
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
                  <View style={[styles.bubble, isOwn ? { backgroundColor: modeAccent } : { backgroundColor: '#ffffff' }]}>
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
                  <View style={[styles.bubble, isOwn ? { backgroundColor: modeAccent } : { backgroundColor: '#ffffff' }]}>
                    {!isOwn && (
                      <AppText weight="regular" style={[styles.senderName, { color: colorForUser(msg.senderId) }]}>
                        {userNames[msg.senderId] ?? 'Loading...'}
                      </AppText>
                    )}
                    <MessageBody
                      msg={msg}
                      rtl={rtl}
                      names={memberNames}
                      color={isOwn ? '#fff' : colors.text}
                      accent={isOwn ? '#fff' : modeAccent}
                      font={font}
                      onPressMention={(uid) =>
                        router.push(`/${activeMode === 'client' ? '(client)' : '(professional)'}/(tabs)/browse/profile/${uid}` as never)
                      }
                    />
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
            <ChevronDown size={22} color={modeAccent} strokeWidth={2.5} />
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
              // Transparent: the chat shows through the strip.
              backgroundColor: 'transparent',
              opacity: menuAnim,
              transform: [{ translateY: menuAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
            },
          ]}
        >
          <TouchableOpacity style={chatStyles.menuItem} onPress={() => { closeMenu(); handleAttachMedia(); }} activeOpacity={0.7}>
            <View style={chatStyles.menuItemIcon}><Paperclip size={22} color={modeAccent} strokeWidth={1.5} /></View>
            <AppText weight="regular" style={chatStyles.menuItemLabel}>{t('chats.add_media')}</AppText>
          </TouchableOpacity>
          <TouchableOpacity style={chatStyles.menuItem} onPress={() => { closeMenu(); handleAttachCamera(); }} activeOpacity={0.7}>
            <View style={chatStyles.menuItemIcon}><Camera size={22} color={modeAccent} strokeWidth={1.5} /></View>
            <AppText weight="regular" style={chatStyles.menuItemLabel}>{t('chats.take_photo')}</AppText>
          </TouchableOpacity>
          {isMarketActive && (
            <TouchableOpacity style={chatStyles.menuItem} onPress={() => { closeMenu(); setListingPickerOpen(true); }} activeOpacity={0.7}>
              <View style={chatStyles.menuItemIcon}><ShoppingBag size={22} color={modeAccent} strokeWidth={1.5} /></View>
              <AppText weight="regular" style={chatStyles.menuItemLabel}>{t('marketplace.share_to_market')}</AppText>
            </TouchableOpacity>
          )}
          {chatProjectId && !chatArchived && (
            <TouchableOpacity style={chatStyles.menuItem} onPress={() => { closeMenu(); setShowAddMission(true); }} activeOpacity={0.7}>
              <View style={chatStyles.menuItemIcon}><CheckSquare size={22} color={modeAccent} strokeWidth={1.5} /></View>
              <AppText weight="regular" style={chatStyles.menuItemLabel}>{t('chats.add_task')}</AppText>
            </TouchableOpacity>
          )}
          {chatProjectId && !chatArchived && (
            <TouchableOpacity style={chatStyles.menuItem} onPress={() => { closeMenu(); setShowAddMeeting(true); }} activeOpacity={0.7}>
              <View style={chatStyles.menuItemIcon}><Calendar size={22} color={modeAccent} strokeWidth={1.5} /></View>
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

      {/* Read-only: BAMA System DMs, and group chats whose project is completed */}
      {isReadOnly && (
        <View style={[styles.inputRow, { paddingBottom: BOTTOM_INSET + 10, borderTopColor: colors.border, backgroundColor: colors.card, flexDirection: 'column', gap: 8, alignItems: 'center' }]}>
          <AppText weight="semiBold" style={{ color: '#8890b0', fontSize: 13, textAlign: 'center' }}>
            {readOnlyLabel}
          </AppText>
          {/* The composer is gone, so the pay action lives here — a completed
              chat is precisely when the fee is due, and it must stay reachable. */}
          {balanceReachable && chatProjectId && (
            <TouchableOpacity
              style={chatStyles.payFromChatBtn}
              onPress={() => router.push(`/settings/payment?projectId=${chatProjectId}` as never)}
              activeOpacity={0.85}
            >
              <AppText weight="bold" style={chatStyles.payFromChatText}>
                {t('project_details.pay_fee')}
              </AppText>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Recording bar — same geometry as input row, no position jump */}
      {isRecording && !isReadOnly && !((chatType === 'purchase' || chatType === 'group') && chatArchived) && (
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
            style={[styles.sendButton, { backgroundColor: modeAccent }]}
            onPress={stopAndSendRecording}
            activeOpacity={0.7}
          >
            <AppText weight="semiBold" style={[styles.sendLabel, { color: '#fff' }]}>{t('chats.record_send')}</AppText>
          </TouchableOpacity>
        </View>
      )}

      {/* Input */}
      {!isRecording && !isReadOnly && !((chatType === 'purchase' || chatType === 'group') && chatArchived) && (
        <View style={styles.composerAnchor}>
        <MentionAutocomplete
          state={mention}
          rtl={rtl}
          accent={modeAccent}
          tint={modeTint}
          onPick={mention.pick}
          onPressStart={mention.notePressStart}
          onPressEnd={mention.notePressEnd}
          labels={{
            loading: t('mentions.loading'),
            empty: t('mentions.empty'),
            atLimit: t('mentions.at_limit'),
            everyone: t('mentions.everyone'),
          }}
        />
        <View style={[styles.inputRow, { borderTopColor: colors.border, backgroundColor: 'transparent', paddingBottom: keyboardVisible ? 18 : BOTTOM_INSET + 10 }]}>
          {mediaActive ? (
            <View style={styles.mediaSendingRow}>
              <ActivityIndicator size="small" color={modeAccent} />
              <AppText weight="regular" style={[styles.mediaSendingText, { color: colors.textMuted }]}>
                {videoUploading || videoProcessing ? t('media.send_video') : t('chats.sending_image')}
              </AppText>
            </View>
          ) : (
            <>
              <TouchableOpacity style={styles.attachBtn} onPress={menuOpen ? closeMenu : openMenu} activeOpacity={0.7}>
                <Plus size={24} color={menuOpen ? colors.text : modeAccent} strokeWidth={2} />
              </TouchableOpacity>
              <TextInput
                // The layout is forced LTR app-wide, so the field's own text
                // side is set here: the placeholder and what is typed both start
                // on the right in Hebrew. writingDirection as well as textAlign,
                // because iOS infers the paragraph direction from the first
                // strong character while the web textarea inherits dir=ltr — the
                // same Hebrew string laid out differently on the two platforms.
                style={[styles.input, { backgroundColor: modeTint, borderColor: modeAccent, color: colors.text, textAlign: rtl ? 'right' : 'left', writingDirection: rtl ? 'rtl' : 'ltr', ...font.regular }]}
                value={inputText}
                onChangeText={(next) => {
                  setInputText(next);
                  // Keep the caret plausible between change and selection
                  // events; the effect in the hook settles on whichever lands
                  // last, so this only has to avoid going backwards.
                  setCaret((prev) => Math.min(prev + (next.length - inputText.length), next.length));
                }}
                selection={pendingSelection}
                onSelectionChange={(e) => {
                  setCaret(e.nativeEvent.selection.start);
                  // One-shot: release control of the caret the moment it lands.
                  if (pendingSelection) setPendingSelection(undefined);
                }}
                onBlur={mention.handleBlur}
                testID="chat-composer-input"
                placeholder={t('chats.message_placeholder')}
                placeholderTextColor={colors.placeholder}
                multiline
                returnKeyType="default"
              />
              {inputText.trim() ? (
                <TouchableOpacity
                  style={[styles.sendButton, { backgroundColor: modeAccent }]}
                  onPress={handleSend}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.sendLabel, { ...font.semiBold }]}>Send</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.sendButton, { backgroundColor: modeAccent }]}
                  onPress={startRecording}
                  activeOpacity={0.7}
                >
                  <Mic size={20} color="#fff" strokeWidth={1.5} />
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
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
              <X size={20} color={modeAccent} strokeWidth={2.5} />
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
    <BottomSheet visible={showAddMission} onClose={() => setShowAddMission(false)}>
      <View style={[chatStyles.sheetHeader, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
        <LinearGradient colors={SHEET_TILE_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={chatStyles.sheetTile}>
          <CheckSquare size={20} color="#FFFFFF" strokeWidth={2} />
        </LinearGradient>
        <Text style={[chatStyles.sheetTitle, { textAlign: rtl ? 'right' : 'left', ...font.bold }]} numberOfLines={2}>
          {t('project_details.add_mission_title')}
        </Text>
      </View>

      <ScrollView
        style={chatStyles.sheetBody}
        contentContainerStyle={chatStyles.sheetBodyContent}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View>
          <Text style={[chatStyles.sheetFieldLabel, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}>
            {t('project_details.mission_title')}
          </Text>
          <TextInput
            style={[chatStyles.sheetInput, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}
            value={newMissionTitle}
            onChangeText={setNewMissionTitle}
            placeholder={t('project_details.mission_placeholder')}
            placeholderTextColor="#9C99AD"
          />
        </View>

        <View>
          <Text style={[chatStyles.sheetFieldLabel, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}>
            {t('project_details.assign_to')}
          </Text>
          {assignableMembers.map((m) => {
            const selected = newMissionAssignedTo.includes(m.id);
            return (
              <TouchableOpacity
                key={m.id}
                style={[chatStyles.sheetPersonRow, { flexDirection: rtl ? 'row-reverse' : 'row' }, selected && { borderColor: modeAccent, backgroundColor: '#F8F6FC' }]}
                onPress={() => toggleAssignee(m.id)}
                activeOpacity={0.8}
              >
                <Text style={[chatStyles.sheetPersonName, { textAlign: rtl ? 'right' : 'left', ...font.medium }]}>{m.displayName}</Text>
                <View style={[chatStyles.sheetCheck, { borderColor: selected ? modeAccent : '#DDD7EC', backgroundColor: selected ? modeAccent : 'transparent' }]}>
                  {selected && <Text style={[chatStyles.sheetCheckTick, { ...font.bold }]}>✓</Text>}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View>
          <Text style={[chatStyles.sheetFieldLabel, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}>
            {t('project_details.due_date')}
          </Text>
          {newMissionDueDate ? (
            <View style={[chatStyles.sheetPickRow, chatStyles.sheetOutlined, { borderColor: modeAccent, flexDirection: rtl ? 'row-reverse' : 'row' }]}>
              <View style={chatStyles.sheetRowTile}>
                <Calendar size={16} color="#6D28D9" strokeWidth={2} />
              </View>
              <Text style={[chatStyles.sheetPickValue, { textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>
                {formatDueDate(newMissionDueDate, t('project_details.due'))}
              </Text>
              <TouchableOpacity onPress={() => setNewMissionDueDate('')} hitSlop={12} activeOpacity={0.7}>
                <Text style={[chatStyles.sheetPickClear, { ...font.bold }]}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[chatStyles.sheetPickRow, chatStyles.sheetOutlined, { borderColor: modeAccent, flexDirection: rtl ? 'row-reverse' : 'row' }]}
              onPress={() => setShowDueDatePicker(true)}
              activeOpacity={0.8}
            >
              <View style={chatStyles.sheetRowTile}>
                <Calendar size={16} color="#6D28D9" strokeWidth={2} />
              </View>
              <Text style={[chatStyles.sheetPickPlaceholder, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}>
                {t('project_details.add_due_date')}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <View style={[chatStyles.sheetActions, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
        <TouchableOpacity style={chatStyles.sheetDismissBtn} onPress={() => setShowAddMission(false)} activeOpacity={0.8}>
          <Text style={[chatStyles.sheetDismissText, { ...font.semiBold }]}>{t('project_details.cancel')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[chatStyles.sheetPrimaryBtn, { backgroundColor: modeAccent }, (!newMissionTitle.trim() || newMissionAssignedTo.length === 0 || isAddingMission) && chatStyles.completeBtnDisabled]}
          onPress={handleAddMission}
          disabled={!newMissionTitle.trim() || newMissionAssignedTo.length === 0 || isAddingMission}
          activeOpacity={0.8}
        >
          {isAddingMission ? <ActivityIndicator color="#fff" size="small" /> : <Text style={[chatStyles.sheetPrimaryText, { ...font.bold }]}>{t('project_details.add')}</Text>}
        </TouchableOpacity>
      </View>
    </BottomSheet>
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
    <BottomSheet visible={showAddMeeting} onClose={() => setShowAddMeeting(false)}>
      <View style={[chatStyles.sheetHeader, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
        <LinearGradient colors={SHEET_TILE_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={chatStyles.sheetTile}>
          <Calendar size={20} color="#FFFFFF" strokeWidth={2} />
        </LinearGradient>
        <Text style={[chatStyles.sheetTitle, { textAlign: rtl ? 'right' : 'left', ...font.bold }]} numberOfLines={2}>
          {t('project_details.add_meeting_title')}
        </Text>
      </View>

      <ScrollView
        style={chatStyles.sheetBody}
        contentContainerStyle={chatStyles.sheetBodyContent}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View>
          <Text style={[chatStyles.sheetFieldLabel, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}>
            {t('project_details.meeting_title_label')}
          </Text>
          <TextInput
            style={[chatStyles.sheetInput, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}
            value={newMeetingTitle}
            onChangeText={setNewMeetingTitle}
            placeholder={t('project_details.meeting_title_placeholder')}
            placeholderTextColor="#9C99AD"
          />
        </View>

        <View>
          <Text style={[chatStyles.sheetFieldLabel, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}>
            {t('project_details.meeting_date')}
          </Text>
          {newMeetingDate ? (
            <View style={[chatStyles.sheetPickRow, chatStyles.sheetOutlined, { borderColor: modeAccent, flexDirection: rtl ? 'row-reverse' : 'row' }]}>
              <View style={chatStyles.sheetRowTile}>
                <Calendar size={16} color="#6D28D9" strokeWidth={2} />
              </View>
              <Text style={[chatStyles.sheetPickValue, { textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>
                {formatDueDate(newMeetingDate, '')}
              </Text>
              <TouchableOpacity onPress={() => setNewMeetingDate('')} hitSlop={12} activeOpacity={0.7}>
                <Text style={[chatStyles.sheetPickClear, { ...font.bold }]}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[chatStyles.sheetPickRow, chatStyles.sheetOutlined, { borderColor: modeAccent, flexDirection: rtl ? 'row-reverse' : 'row' }]}
              onPress={() => setShowMeetingDatePicker(true)}
              activeOpacity={0.8}
            >
              <View style={chatStyles.sheetRowTile}>
                <Calendar size={16} color="#6D28D9" strokeWidth={2} />
              </View>
              <Text style={[chatStyles.sheetPickPlaceholder, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}>
                {t('project_details.meeting_date')}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View>
          <Text style={[chatStyles.sheetFieldLabel, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}>
            {t('project_details.meeting_time')}
          </Text>
          <TextInput
            style={[chatStyles.sheetInput, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}
            value={newMeetingTime}
            onChangeText={setNewMeetingTime}
            placeholder={t('project_details.meeting_time_placeholder')}
            placeholderTextColor="#9C99AD"
            keyboardType="numbers-and-punctuation"
          />
        </View>

        <View>
          <Text style={[chatStyles.sheetFieldLabel, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}>
            {t('project_details.meeting_location')}
          </Text>
          <TextInput
            style={[chatStyles.sheetInput, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}
            value={newMeetingLocation}
            onChangeText={setNewMeetingLocation}
            placeholder={t('project_details.meeting_location_placeholder')}
            placeholderTextColor="#9C99AD"
          />
        </View>

        <View>
          <Text style={[chatStyles.sheetFieldLabel, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}>
            {t('project_details.meeting_invitees')}
          </Text>
          {assignableMembers.map((m) => {
            const selected = newMeetingInvitedIds.includes(m.id);
            return (
              <TouchableOpacity
                key={m.id}
                style={[chatStyles.sheetPersonRow, { flexDirection: rtl ? 'row-reverse' : 'row' }, selected && { borderColor: modeAccent, backgroundColor: '#F8F6FC' }]}
                onPress={() => toggleInvitee(m.id)}
                activeOpacity={0.8}
              >
                <Text style={[chatStyles.sheetPersonName, { textAlign: rtl ? 'right' : 'left', ...font.medium }]}>{m.displayName}</Text>
                <View style={[chatStyles.sheetCheck, { borderColor: selected ? modeAccent : '#DDD7EC', backgroundColor: selected ? modeAccent : 'transparent' }]}>
                  {selected && <Text style={[chatStyles.sheetCheckTick, { ...font.bold }]}>✓</Text>}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={[chatStyles.sheetActions, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
        <TouchableOpacity style={chatStyles.sheetDismissBtn} onPress={() => setShowAddMeeting(false)} activeOpacity={0.8}>
          <Text style={[chatStyles.sheetDismissText, { ...font.semiBold }]}>{t('project_details.cancel')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[chatStyles.sheetPrimaryBtn, { backgroundColor: modeAccent }, (!newMeetingTitle.trim() || !newMeetingDate || !newMeetingTime.trim() || !newMeetingLocation.trim() || newMeetingInvitedIds.length === 0 || isAddingMeeting) && chatStyles.completeBtnDisabled]}
          onPress={handleAddMeeting}
          disabled={!newMeetingTitle.trim() || !newMeetingDate || !newMeetingTime.trim() || !newMeetingLocation.trim() || newMeetingInvitedIds.length === 0 || isAddingMeeting}
          activeOpacity={0.8}
        >
          {isAddingMeeting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={[chatStyles.sheetPrimaryText, { ...font.bold }]}>{t('project_details.add')}</Text>}
        </TouchableOpacity>
      </View>
    </BottomSheet>
    {showMeetingDatePicker && (
      <MiniCalendar
        value={newMeetingDate}
        onSelect={(iso) => { setNewMeetingDate(iso); setShowMeetingDatePicker(false); }}
        onClose={() => setShowMeetingDatePicker(false)}
        minDate={todayISO}
        maxDate={projectDeadline}
      />
    )}

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
    color: '#000000',
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
  systemPillCompletion: { backgroundColor: 'rgba(0,74,173,0.10)' },
  systemPillLeft: { backgroundColor: 'rgba(107,114,128,0.10)' },
  // Black text on the tinted pill; the icon keeps the variant's own colour.
  systemHeadline: {
    fontSize: 13,
    color: '#000000',
    textAlign: 'center',
  },
  systemDetail: {
    fontSize: 12,
    color: '#000000',
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
  mentionRun: { fontWeight: '700' },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  messageTime: {
    fontSize: 10,
    textAlign: 'left',
    marginTop: 2,
  },
  composerAnchor: { position: 'relative' },
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

const chatStyles = StyleSheet.create({
  payFromChatBtn: {
    backgroundColor: '#2d6a2d', borderRadius: 999,
    paddingHorizontal: 22, paddingVertical: 9,
  },
  payFromChatText: { fontSize: 14, color: '#ffffff' },
  // ── Add sheets (task / meeting), the project-details sheet pattern ──────
  sheetHeader: { alignItems: 'center', gap: 11 },
  sheetTile: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { flex: 1, fontSize: 20, fontWeight: '800', color: '#000000', letterSpacing: -0.2, lineHeight: 26 },
  sheetBody: { flexShrink: 1 },
  sheetBodyContent: { gap: 14 },
  sheetFieldLabel: { fontSize: 11.5, color: '#000000', marginBottom: 6 },
  sheetInput: {
    backgroundColor: '#F8F6FC',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 14,
    color: '#1A1626',
  },
  sheetPickRow: { alignItems: 'center', gap: 11, paddingVertical: 11 },
  sheetOutlined: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12 },
  sheetRowTile: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#F3EEFE', alignItems: 'center', justifyContent: 'center' },
  sheetPickValue: { flex: 1, fontSize: 14, fontWeight: '600', color: '#1A1626' },
  sheetPickPlaceholder: { flex: 1, fontSize: 14, color: '#8B8898' },
  sheetPickClear: { fontSize: 13, color: '#8B8898', paddingHorizontal: 4 },
  sheetPersonRow: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EFEDF5',
    backgroundColor: '#FFFFFF',
    marginBottom: 6,
  },
  sheetPersonName: { flex: 1, fontSize: 14, color: '#1A1626' },
  sheetCheck: { width: 20, height: 20, borderRadius: 999, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  sheetCheckTick: { fontSize: 11, color: '#FFFFFF' },
  sheetActions: { flexDirection: 'row', gap: 10 },
  sheetDismissBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDD7EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetDismissText: { fontSize: 14.5, fontWeight: '600', color: '#4C1D95' },
  sheetPrimaryBtn: { flex: 1, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sheetPrimaryText: { fontSize: 14.5, fontWeight: '700', color: '#FFFFFF' },

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
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemLabel: {
    fontSize: 11,
    color: '#000000',
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
