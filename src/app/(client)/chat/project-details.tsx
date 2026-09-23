import { useRef, useEffect, useState } from 'react';
import { useModeAccent } from '@core/navigation/floatingTabBar';
import {
  ActivityIndicator,
  Alert,
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
import { confirmDialog } from '@utils/confirmDialog';
import { BottomSheet } from '@components/ui/BottomSheet';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { doc, updateDoc, arrayUnion, serverTimestamp, addDoc, collection, deleteField } from 'firebase/firestore';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { db } from '@core/firebase/config';
import { getDocument, queryDocuments, where } from '@core/firebase/firestore';
import { uploadFile } from '@core/firebase/storage';
import { auth } from '@core/firebase/config';
import { useTheme } from '@core/hooks/useTheme';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useUiStore } from '@core/stores/uiStore';
import { useAppFont } from '@core/hooks/useAppFont';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import type { BundleOffer, CrewRequestSlot, FilledSlot, Meeting, Mission, MissionStatus, PaymentRequest, PriceOffer, ProjectRequest, RemovalRequest } from '@core/types/project';
import type { User } from '@core/types/user';
import {
  calculateProjectFee,
  listenToPaymentRequests,
  createPaymentRequest,
  respondToPaymentRequest,
  type ClientCostBreakdown,
} from '@features/chat/services/paymentService';
import { repriceErrorKey } from '@features/chat/utils/repriceErrors';
import { engagementPriceFrozen } from '@features/chat/utils/priceRequestPolicy';
import { ChatMediaSection } from '@features/chat/components/ChatMediaSection';
import {
  listenToMissions,
  addMission,
  updateMissionStatus,
  deleteMission,
} from '@features/chat/services/missionService';
import { listenToMeetings, addMeeting, deleteMeeting } from '@features/chat/services/meetingService';
import { MiniCalendar, MiniTimePicker, RolePickerModal } from '@features/crew/components';
import { categoryLabel } from '@features/crew/data/categories';
import { ReviewFlow, type ReviewProfessional } from '@features/reviews/components/ReviewFlow';
import { requestRemoval, acceptRemoval, listenToRemovalRequests, listenToMyRemovalRequest } from '@features/chat/services/removalService';
import { listenToProjectFee } from '@features/pricing/services/feesService';
import {
  canDispute, markEngagementComplete, canMarkComplete, contestEngagement,
} from '@features/projects/services/completionService';
import { contestWindowEndsAt } from '@features/projects/utils/completion';
import { CompleteEngagementSheet } from '@features/projects/components/CompleteEngagementSheet';
import {
  ContestEngagementSheet, type ContestReason,
} from '@features/projects/components/ContestEngagementSheet';
import { endDateFromDeadline } from '@features/crew/utils/endDate';
import type { ProjectFee } from '@core/types/project';
import { callFunction } from '@core/firebase/functions';

const confirmCompletion = callFunction<{ projectId: string }, { ok: boolean }>('confirmCompletion');
import { Calendar, CalendarDays, CheckSquare, ChevronLeft, ChevronRight, Clapperboard, Clock, Flag, MapPin, Pencil, Trash2, Users, X } from 'lucide-react-native';
import { AppText } from '@components/ui/AppText';
import { initialWindowMetrics } from 'react-native-safe-area-context';

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

/** Mission pill outlines. The label itself is always black; 'done' keeps its
 *  green wash (styles.carouselStatusDone) because it is the finished state.
 *  'in_progress' takes the mode accent, filled in at render. */
/** The sheets' header tile — the same gradient as the app's + buttons. */
const SHEET_TILE_GRADIENT = ['#2563EB', '#6D34DE', '#9A4BF0'] as const;

/** Task status badge, read-only in the sheet (cycling stays on the card). */
const MISSION_BADGE: Record<MissionStatus, { bg: string; text: string }> = {
  todo:        { bg: '#F1EFF7', text: '#5A5768' },
  in_progress: { bg: '#E8F0FE', text: '#1D4FD8' },
  done:        { bg: '#E9F5EC', text: '#2F7A45' },
};

const MISSION_OUTLINE: Record<MissionStatus, string | null> = {
  todo:        '#000000',
  in_progress: null, // the mode accent
  done:        null, // the green wash instead of an outline
};

const MISSION_STATUS_CYCLE: Record<MissionStatus, MissionStatus> = {
  todo: 'in_progress',
  in_progress: 'done',
  done: 'todo',
};

function formatDueDate(iso: string, prefix: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(2);
  return `${prefix}${dd}/${mm}/${yy}`;
}

type MemberInfo = Pick<User, 'displayName' | 'photoURL'>;

const MAX_EVIDENCE = 3;

/** The tabs layout zeroes the safe-area context for its screens, so the real top
 *  inset comes from the window metrics (same as ChatRoomScreen). On a phone the header
 *  sits at least 16 below the status bar / Dynamic Island and never higher than 64;
 *  web keeps its 52. */
const HEADER_TOP = Platform.OS === 'web'
  ? 52
  : Math.max(64, (initialWindowMetrics?.insets.top ?? 0) + 16);

/** This route lives above the tab navigator (src/app/(client)/chat/_layout.tsx),
 *  so there is no tab bar over it and the pinned close-project bar only needs to
 *  clear the home indicator. */
const BOTTOM_BAR_PAD = (initialWindowMetrics?.insets.bottom ?? 0) + 16;

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(2);
  return `${dd}/${mm}/${yy}`;
}

export default function ProjectDetailsScreen() {
  const { projectId, chatId: chatIdParam, section } = useLocalSearchParams<{
    projectId: string; chatId: string; section?: string;
  }>();
  const router = useRouter();
  const colors = useTheme();
  // Back arrow and the primary buttons follow the mode: purple in the client
  // app, blue in the pro app.
  const { accent: modeAccent } = useModeAccent();
  const font = useAppFont();
  const language = useSettingsStore((s) => s.language);
  const { showToast } = useUiStore();
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const rowDirection: 'row' | 'row-reverse' = rtl ? 'row-reverse' : 'row';
  const [project, setProject] = useState<ProjectRequest | null>(null);
  const [clientUser, setClientUser] = useState<MemberInfo | null>(null);
  const [memberUsers, setMemberUsers] = useState<Record<string, MemberInfo>>({});
  const [acceptedOffers, setAcceptedOffers] = useState<PriceOffer[]>([]);
  const [bundleMap, setBundleMap] = useState<Map<string, BundleOffer>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [showPaymentSummary, setShowPaymentSummary] = useState(false);
  const [feeData, setFeeData] = useState<ClientCostBreakdown | null>(null);
  const [isCalculatingFee, setIsCalculatingFee] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [proActionBusy, setProActionBusy] = useState(false);
  const [showReviewFlow, setShowReviewFlow] = useState(false);

  const [missions, setMissions] = useState<Mission[]>([]);
  const [showAddMission, setShowAddMission] = useState(false);
  const [newMissionTitle, setNewMissionTitle] = useState('');
  const [newMissionDescription, setNewMissionDescription] = useState('');
  const [newMissionAssignedTo, setNewMissionAssignedTo] = useState<string[]>([]);
  const [newMissionDueDate, setNewMissionDueDate] = useState('');
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);
  const [isAddingMission, setIsAddingMission] = useState(false);
  const [detailMission, setDetailMission] = useState<Mission | null>(null);

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [showAddMeeting, setShowAddMeeting] = useState(false);
  const [newMeetingTitle, setNewMeetingTitle] = useState('');
  const [newMeetingDescription, setNewMeetingDescription] = useState('');
  const [newMeetingDate, setNewMeetingDate] = useState('');
  const [newMeetingTime, setNewMeetingTime] = useState('');
  const [newMeetingLocation, setNewMeetingLocation] = useState('');
  const [newMeetingInvitedIds, setNewMeetingInvitedIds] = useState<string[]>([]);
  const [showMeetingDatePicker, setShowMeetingDatePicker] = useState(false);
  const [showMeetingTimePicker, setShowMeetingTimePicker] = useState(false);
  const [isAddingMeeting, setIsAddingMeeting] = useState(false);
  const [detailMeeting, setDetailMeeting] = useState<Meeting | null>(null);
  const [showDeadlinePicker, setShowDeadlinePicker] = useState(false);

  const [missionIndex, setMissionIndex] = useState(0);
  const [meetingIndex, setMeetingIndex] = useState(0);

  // Missions/meetings must fall within the project window: today → project end.
  const todayISO = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const projectEndDate = project?.deadline && project.deadline !== 'flexible' ? project.deadline : undefined;

  // Only the project owner (client) may edit the deadline.
  const isProjectClient = !!project && project.clientId === auth.currentUser?.uid;
  // A new deadline can't be before today or before the execution date (if set).
  const deadlineMinDate = project?.exec && project.exec > todayISO ? project.exec : todayISO;

  async function handleEditDeadline(iso: string) {
    setShowDeadlinePicker(false);
    try {
      // endDate moves WITH the deadline, from this one answer — the same picker,
      // no second question. Choosing 'flexible' clears it, so the project stops
      // having an auto-complete date rather than keeping a stale one.
      //
      // The server trigger re-stamps completionDueAt on every engagement still
      // 'hired' and leaves the rest alone, so moving the date can never reach
      // back and un-complete something that already closed.
      const endDate = endDateFromDeadline(iso);
      await updateDoc(doc(db, 'projects', projectId), {
        deadline: iso,
        endDate: endDate ?? deleteField(),
      });
      // Local state holds the app's own Timestamp shape ({seconds, nanoseconds}),
      // not the JS Date the SDK converts on write — otherwise the optimistic
      // value and the value that comes back from Firestore are different types
      // for the same field.
      setProject((prev) => (prev ? {
        ...prev,
        deadline: iso,
        endDate: endDate
          ? { seconds: Math.floor(endDate.getTime() / 1000), nanoseconds: 0 }
          : undefined,
      } : prev));
    } catch (err) {
      console.error('[ProjectDetails] edit deadline failed:', err);
      showToast(t('project_details.edit_deadline_error'), 'error');
    }
  }

  /**
   * Deep link from a system message in the chat: `?section=missions|meetings|payments`
   * scrolls to that block once it has laid out.
   *
   * Sections report their own y through onLayout rather than being measured,
   * because they render conditionally and at different times — missions and
   * meetings stream in from listeners, and the payments block only exists while a
   * request is pending. That also means a section arriving late still scrolls: the
   * handler fires whenever it lands.
   *
   * `scrolledRef` makes it fire ONCE. Without it every re-render — a listener
   * tick, a keystroke in a modal — would yank the view back.
   */
  const scrollRef = useRef<ScrollView>(null);
  const scrolledRef = useRef(false);

  function onSectionLayout(name: string) {
    return (e: { nativeEvent: { layout: { y: number } } }) => {
      if (scrolledRef.current || section !== name) return;
      scrolledRef.current = true;
      // Read y NOW, not inside the callback below. React Native releases the
      // synthetic event as soon as this handler returns, so `e.nativeEvent` is
      // null by the next frame — reaching into it there threw
      // "Cannot read property 'layout' of null".
      const y = e.nativeEvent.layout.y;
      // A frame's grace so the block below the header has laid out too, otherwise
      // the offset is measured against a half-built list.
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
      });
    };
  }

  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>([]);
  const [showPaymentRequestModal, setShowPaymentRequestModal] = useState(false);
  const [selectedPrice, setSelectedPrice] = useState<
    { professionalId: string; currentAmount: number; bundleId?: string; category?: string } | null
  >(null);
  const [proposedAmount, setProposedAmount] = useState('');
  const [requestNote, setRequestNote] = useState('');
  const [isSendingRequest, setIsSendingRequest] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  // Feature A: removal requests
  const [removalRequests, setRemovalRequests] = useState<RemovalRequest[]>([]);
  // The professional's own request arrives by DOCUMENT listener, not from the
  // collection above — production denies that query to them (see removalService).
  const [myRemovalDoc, setMyRemovalDoc] = useState<RemovalRequest | null>(null);
  // freeSlot can cold-start for several seconds; without this the button looks
  // dead and people tap again, firing calls that then fail as "not on project".
  const [acceptingRemoval, setAcceptingRemoval] = useState(false);

  // This professional's own platform fee on this project. The CLIENT never reads
  // it — the rules deny them, and spec §6 says the client is never told that a
  // professional owes BAMA money.
  const [myFee, setMyFee] = useState<ProjectFee | null>(null);
  // The mark-complete sheet. A real modal rather than confirmDialog: this is
  // where a professional accepts a charge, and confirmDialog is window.confirm
  // on web — unlocalisable, and with nowhere to put the amount.
  const [completeSheetOpen, setCompleteSheetOpen] = useState(false);
  const [contestSheetOpen, setContestSheetOpen] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Report user
  const [reportVisible, setReportVisible] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportedUserId, setReportedUserId] = useState('');
  const [reportedUserName, setReportedUserName] = useState('');
  const [reportEvidence, setReportEvidence] = useState<string[]>([]);

  // Feature B: add professional
  const [showRolePicker, setShowRolePicker] = useState(false);
  const [isPostingRoles, setIsPostingRoles] = useState(false);

  useEffect(() => {
    if (!projectId) return;

    async function fetchAll() {
      const projectData = await getDocument<Omit<ProjectRequest, 'id'>>(`projects/${projectId}`);
      if (!projectData) {
        setIsLoading(false);
        return;
      }

      const fullProject: ProjectRequest = { ...projectData, id: projectId };
      setProject(fullProject);

      // Fetch member names first — always succeeds (public user docs)
      const uniqueProfessionalIds = [
        ...new Set((projectData.filledSlots ?? []).map((s) => s.professionalId)),
      ];
      const [client, ...memberResults] = await Promise.all([
        getDocument<MemberInfo>(`users/${projectData.clientId}`),
        ...uniqueProfessionalIds.map((id) =>
          getDocument<MemberInfo>(`users/${id}`).then((u) => [id, u] as const)
        ),
      ]);

      if (client) setClientUser(client as MemberInfo);
      setMemberUsers(
        Object.fromEntries(
          (memberResults as [string, MemberInfo | null][]).filter(
            (e): e is [string, MemberInfo] => e[1] !== null
          )
        )
      );

      // Fetch accepted offers. The project-wide query is only allowed for the client;
      // a professional viewer can only read his OWN offers, so scope the query by role.
      const viewerUid = auth.currentUser?.uid ?? '';
      const viewerIsClient = projectData.clientId === viewerUid;
      const offers = await (viewerIsClient
        ? queryDocuments<PriceOffer>(
            'priceOffers',
            where('projectId', '==', projectId),
            where('status', '==', 'accepted'),
          )
        : queryDocuments<PriceOffer>(
            'priceOffers',
            where('projectId', '==', projectId),
            where('professionalId', '==', viewerUid),
            where('status', '==', 'accepted'),
          )
      ).catch(() => [] as PriceOffer[]);

      setAcceptedOffers(offers);

      // Fetch bundle offer docs for any bundled price offers
      const bundleIds = [...new Set(offers.filter((o) => o.bundleId).map((o) => o.bundleId!))];
      if (bundleIds.length > 0) {
        const bundleDocs = await Promise.all(
          bundleIds.map((id) => getDocument<BundleOffer>(`bundleOffers/${id}`))
        );
        const map = new Map<string, BundleOffer>();
        bundleIds.forEach((id, i) => {
          const b = bundleDocs[i];
          if (b) map.set(id, b);
        });
        setBundleMap(map);
      }

      setIsLoading(false);
    }

    fetchAll().catch((err) => {
      console.error('[ProjectDetails] fetchAll error:', err);
      setIsLoading(false);
    });
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    console.log('[ProjectDetails] subscribing to missions for projectId:', projectId);
    return listenToMissions(projectId, setMissions);
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    return listenToMeetings(projectId, setMeetings);
  }, [projectId]);

  useEffect(() => {
    const userId = auth.currentUser?.uid;
    if (!projectId || !userId) return;
    return listenToPaymentRequests(projectId, userId, setPaymentRequests);
  }, [projectId]);

  // Two different reads, because the rules permit two different shapes.
  // CLIENT: the whole collection, to render every member's pending chip.
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!projectId || !project?.clientId || project.clientId !== uid) return;
    return listenToRemovalRequests(projectId, setRemovalRequests);
  }, [projectId, project?.clientId]);

  // PROFESSIONAL: their own fee document. Not run in client mode at all.
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!projectId || !uid || !project?.clientId || project.clientId === uid) return;
    return listenToProjectFee(projectId, uid, setMyFee);
  }, [projectId, project?.clientId]);

  // PROFESSIONAL: only their own request, by document id. Listening to the
  // collection here is denied in production and, because the old error handler
  // resolved to an empty list, silently rendered as "no pending removal" — the
  // accept banner never appeared.
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!projectId || !uid || !project?.clientId || project.clientId === uid) return;
    return listenToMyRemovalRequest(projectId, uid, setMyRemovalDoc);
  }, [projectId, project?.clientId]);

  async function handleMarkComplete() {
    if (!projectId) return;
    setIsCalculatingFee(true);
    try {
      const fee = await calculateProjectFee(projectId);
      setFeeData(fee);
      setShowPaymentSummary(true);
    } catch {
      showToast(t('project_details.error_payment'), 'error');
    } finally {
      setIsCalculatingFee(false);
    }
  }

  async function handleConfirmComplete() {
    console.log('[ReviewFlow] handleConfirmComplete called — projectId:', projectId, 'project exists:', !!project);
    if (!projectId || !project) return;

    console.log('[ReviewFlow] project.reviewsCompleted:', project.reviewsCompleted, 'filledSlots:', project.filledSlots?.length ?? 0);

    // Already reviewed — proceed directly
    if (project.reviewsCompleted === true) {
      console.log('[ReviewFlow] already reviewed — running normal complete flow');
      setIsConfirming(true);
      try {
        await confirmCompletion({ projectId });
        setProject((prev) => (prev ? { ...prev, status: 'completed' } : prev));
        setShowPaymentSummary(false);
        showToast(t('project_details.success_complete'), 'success');
      } catch {
        showToast(t('project_details.error_complete'), 'error');
      } finally {
        setIsConfirming(false);
      }
      return;
    }

    // Mark complete and require reviews. `status`/`completedAt` are server-owned
    // — the callable computes feeDue and decides whether the slot stays occupied.
    // reviewsCompleted/reviewsPending stay client-owned (pure review-flow state).
    const uniqueProfIds = [...new Set((project.filledSlots ?? []).map((s) => s.professionalId))];
    console.log('[ReviewFlow] uniqueProfIds:', uniqueProfIds);
    setIsConfirming(true);
    try {
      await confirmCompletion({ projectId });
      await updateDoc(doc(db, 'projects', projectId), {
        reviewsCompleted: false,
        reviewsPending: uniqueProfIds,
      });
      console.log('[ReviewFlow] completion confirmed — setting showReviewFlow=true');
      setProject((prev) =>
        prev
          ? { ...prev, status: 'completed', reviewsCompleted: false, reviewsPending: uniqueProfIds }
          : prev,
      );
      setShowPaymentSummary(false);
      setShowReviewFlow(true);
    } catch (err) {
      console.error('[ReviewFlow] confirmCompletion failed:', err);
      showToast(t('project_details.error_complete'), 'error');
    } finally {
      setIsConfirming(false);
    }
  }

  /**
   * The professional marks THEIR OWN engagement finished.
   *
   * The primary completion trigger since the Phase 4 inversion: the client has
   * already paid them outside the app, so waiting for the client to confirm
   * waited on the one party with no reason to act.
   *
   * Closes this engagement only. Everyone else's stands where it was, and the
   * project closes when the last of them is terminal — which is why the
   * optimistic write below touches `myFee` and never the project.
   */
  async function handleMarkEngagementComplete() {
    if (!projectId || proActionBusy) return;
    setProActionBusy(true);
    try {
      await markEngagementComplete({ projectId });
      // chargeDueAt is deliberately NOT guessed here. The server stamps it from
      // its own clock and its own config; inventing a local one would show a
      // contest deadline that disagrees with the one being enforced. The fee
      // listener delivers the real value a moment later.
      setMyFee((prev) => (prev ? { ...prev, engagementStatus: 'completed' as const } : prev));
      setCompleteSheetOpen(false);
      showToast(t('engagement.complete_done'), 'success');
    } catch (err) {
      console.error('[completion] markEngagementComplete failed:', err);
      showToast(t('engagement.complete_error'), 'error');
    } finally {
      setProActionBusy(false);
    }
  }

  /**
   * The professional contests their own completed engagement, inside the window
   * that ends when the fee is charged.
   *
   * Not framed as undoing anything: the project stays closed and the reviews stay
   * published either way. What the two reasons change is the FEE — `didnt_happen`
   * voids it, `amount_disputed` holds it for an admin — and the sheet says which
   * beside each option, because a choice whose consequences are off screen is not
   * one the professional actually made.
   */
  async function handleContest(reason: ContestReason, note: string) {
    if (!projectId || proActionBusy) return;
    setProActionBusy(true);
    try {
      await contestEngagement({ projectId, reason, ...(note ? { note } : {}) });
      // The contest RE-TAKES the slot the completion released, server-side. The
      // optimistic write mirrors only what this screen renders; the slot count
      // comes from the project document and arrives on its own.
      setMyFee((prev) => (prev
        ? {
            ...prev,
            engagementStatus: 'disputed' as const,
            // didnt_happen voids the fee outright. Showing the old amount beside
            // "with our team" would say the opposite of what just happened.
            ...(reason === 'didnt_happen' ? { feeDue: 0, status: 'not_owed' as const } : {}),
          }
        : prev));
      setContestSheetOpen(false);
      showToast(t('engagement.contest_sent'), 'success');
    } catch (err) {
      console.error('[completion] contestEngagement failed:', err);
      showToast(t('engagement.contest_error'), 'error');
    } finally {
      setProActionBusy(false);
    }
  }

  function handleReviewsComplete() {
    setShowReviewFlow(false);
    setProject((prev) => (prev ? { ...prev, reviewsCompleted: true } : prev));
    showToast(t('project_details.success_complete'), 'success');
  }

  /**
   * createPaymentRequest refuses for distinct, actionable reasons; a bare catch
   * collapsed them into one generic alert.
   */
  function repriceErrorMessage(err: unknown): string {
    return t(repriceErrorKey(err, 'create'));
  }

  async function handleSendPaymentRequest() {
    if (!projectId || !selectedPrice) return;
    const currentUserId = auth.currentUser?.uid;
    if (!currentUserId) return;
    const parsed = parseFloat(proposedAmount);
    if (isNaN(parsed) || parsed <= 0) return;

    setIsSendingRequest(true);
    try {
      // No identity fields: the callable derives fromUserId from the caller and
      // the counterparty from the project, so a self-addressed request cannot be
      // expressed. `currentAmount` is read server-side from the accepted offer.
      // The chat notice is posted in the same batch — it used to be a separate
      // client write wrapped in a swallow, so a failure left the counterparty
      // with a pending request and no heads-up.
      await createPaymentRequest(projectId, {
        professionalId: selectedPrice.professionalId,
        bundleId: selectedPrice.bundleId,
        category: selectedPrice.category,
        proposedAmount: parsed,
        note: requestNote.trim() || undefined,
      });
      setShowPaymentRequestModal(false);
      setSelectedPrice(null);
      setProposedAmount('');
      setRequestNote('');
    } catch (err) {
      console.error('[reprice] createPaymentRequest failed:', err);
      Alert.alert('Error', repriceErrorMessage(err));
    } finally {
      setIsSendingRequest(false);
    }
  }

  async function handleRespondToRequest(request: PaymentRequest, accept: boolean) {
    if (!projectId) return;
    setRespondingId(request.id);
    try {
      await respondToPaymentRequest(
        projectId,
        request.id,
        accept,
        request.professionalId,
        request.proposedAmount,
        request.bundleId,
      );
      // Offers/bundles are one-shot fetches, so reflect the new price locally right
      // away (mirrors the service).
      if (accept) {
        if (request.bundleId) {
          setBundleMap((prev) => {
            const next = new Map(prev);
            const b = next.get(request.bundleId!);
            if (b) next.set(request.bundleId!, { ...b, bundlePrice: request.proposedAmount });
            return next;
          });
        } else {
          setAcceptedOffers((prev) =>
            prev.map((o) =>
              o.professionalId === request.professionalId
                ? { ...o, price: request.proposedAmount }
                : o,
            ),
          );
        }
      }
    } catch (err) {
      Alert.alert('Error', t(repriceErrorKey(err, 'respond'), {
        action: accept ? t('project_details.accept').toLowerCase() : t('project_details.reject').toLowerCase(),
      }));
    } finally {
      setRespondingId(null);
    }
  }

  async function handleRequestRemoval(professionalId: string) {
    console.log('[removal] handleRequestRemoval called', { professionalId, projectId });
    if (!projectId) return;
    const confirmed = await confirmDialog(
      t('project_details.remove_member'),
      t('project_details.confirm_remove'),
    );
    if (!confirmed) return;
    setRemovingId(professionalId);
    try {
      await requestRemoval(projectId, professionalId, currentUserId);
    } catch (err) {
      // Logged, not swallowed: a bare catch here hid a rules denial on repeat
      // requests for weeks — the client saw only a generic alert.
      console.error('[removal] requestRemoval failed:', err);
      Alert.alert('Error', t('project_details.error_remove'));
    } finally {
      setRemovingId(null);
    }
  }

  function closeReport() {
    setReportVisible(false);
    setReportReason('');
    setReportEvidence([]);
  }

  async function pickEvidence() {
    if (reportEvidence.length >= MAX_EVIDENCE) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setReportEvidence((prev) => [...prev, result.assets[0].uri]);
    }
  }

  function removeEvidence(idx: number) {
    setReportEvidence((prev) => prev.filter((_, i) => i !== idx));
  }

  async function submitReport() {
    if (reportReason.trim().length < 20 || !currentUserId || !reportedUserId) return;
    setReportSubmitting(true);
    try {
      const docRef = await addDoc(collection(db, 'reports'), {
        reporterId: currentUserId,
        reportedUserId,
        reportedUserName,
        reason: reportReason.trim(),
        evidenceURLs: [] as string[],
        status: 'pending',
        createdAt: serverTimestamp(),
      });

      if (reportEvidence.length > 0) {
        const urls = await Promise.all(
          reportEvidence.map(async (uri, i) => {
            const blob = await (await fetch(uri)).blob();
            const ext = uri.split('.').pop() ?? 'jpg';
            return uploadFile(`reports/${docRef.id}/evidence/${Date.now()}_${i}.${ext}`, blob);
          })
        );
        await updateDoc(doc(db, 'reports', docRef.id), { evidenceURLs: urls });
      }

      closeReport();
      showToast(t('report.success'), 'success');
    } catch {
      Alert.alert('Error', 'Failed to submit report. Please try again.');
    } finally {
      setReportSubmitting(false);
    }
  }

  async function handleAcceptRemoval() {
    // These used to return with no feedback of any kind — the button simply did
    // nothing and nobody, user or developer, had a signal.
    if (!projectId || !project) {
      console.error('[removal] accept blocked: project not loaded', { projectId, hasProject: !!project });
      return;
    }
    if (!project.chatId) {
      console.error('[removal] accept blocked: project has no chatId', { projectId });
      return;
    }

    // Leaving a project cannot be undone, and every other destructive action on
    // this screen confirms first.
    const confirmed = await confirmDialog(
      t('project_details.confirm_leave_title'),
      t('project_details.confirm_leave_body'),
    );
    if (!confirmed) return;

    setAcceptingRemoval(true);
    try {
      // The "X left" notice is posted server-side inside freeSlot, in the same
      // batch as the membership removal — it cannot be written from here once
      // membership is gone.
      await acceptRemoval(projectId);
      // NOT router.back(): that returns to the project's chat, which this
      // professional has just been removed from and can no longer read.
      router.replace('/(professional)/(tabs)/chats');
    } catch (err) {
      // freeSlot no longer refuses on an outstanding fee — leaving a project is
      // not something a payment buys. Logged because a denial here is now always a
      // real error rather than an expected refusal.
      console.error('[removal] acceptRemoval/freeSlot failed:', err);
      Alert.alert('Error', t('project_details.error_accept_removal'));
    } finally {
      setAcceptingRemoval(false);
    }
  }

  async function handlePostRoles(newSlots: CrewRequestSlot[]) {
    if (!projectId || !project) return;
    setIsPostingRoles(true);
    try {
      const updates: Record<string, unknown> = {
        crewSlots: arrayUnion(...newSlots),
      };
      if (project.status !== 'open') updates.status = 'open';
      await updateDoc(doc(db, 'projects', projectId), updates);
      setProject((prev) =>
        prev
          ? { ...prev, crewSlots: [...(prev.crewSlots ?? []), ...newSlots], status: 'open' }
          : prev,
      );
      setShowRolePicker(false);
    } catch {
      Alert.alert('Error', t('project_details.error_post_roles'));
    } finally {
      setIsPostingRoles(false);
    }
  }

  if (isLoading) {
    return (
      <LinearGradient colors={colors.bgGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.centered}>
        <Stack.Screen options={{ headerShown: false, gestureEnabled: true, fullScreenGestureEnabled: true }} />
        <ActivityIndicator size="large" color={modeAccent} />
      </LinearGradient>
    );
  }

  if (!project) {
    return (
      <LinearGradient colors={colors.bgGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.centered}>
        <Stack.Screen options={{ headerShown: false, gestureEnabled: true, fullScreenGestureEnabled: true }} />
        <Text style={[styles.errorText, { color: '#000000', textAlign: rtl ? 'right' : 'left', ...font.regular }]}>
          {t('project_details.project_not_found')}
        </Text>
      </LinearGradient>
    );
  }

  function toggleAssignee(id: string) {
    setNewMissionAssignedTo((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function getMeetingUrgency(date: string, time: string): 'past' | 'imminent' | 'soon' | 'normal' {
    // The hour is optional. With none, the meeting counts until the end of its day.
    const meetingAt = new Date(`${date}T${time || '23:59'}`);
    const now = new Date();
    if (meetingAt <= now) return 'past';
    const diffDays = (meetingAt.getTime() - now.getTime()) / 86_400_000;
    if (diffDays <= 2) return 'imminent';
    if (diffDays <= 7) return 'soon';
    return 'normal';
  }

  function formatMeetingDateTime(date: string, time: string): string {
    const d = new Date(`${date}T${time}`);
    return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${time}`;
  }

  function getMeetingDateParts(dateStr: string): { monthAbbr: string; day: string } {
    const d = new Date(dateStr);
    const locale = language === 'he' ? 'he-IL' : 'en-US';
    const monthAbbr = d.toLocaleDateString(locale, { month: 'short' }).slice(0, 3);
    return { monthAbbr, day: String(d.getDate()) };
  }

  function toggleInvitee(id: string) {
    setNewMeetingInvitedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleAddMeeting() {
    if (
      !projectId ||
      !newMeetingTitle.trim() ||
      !newMeetingDate ||
      newMeetingInvitedIds.length === 0
    ) return;
    const currentUserId = auth.currentUser?.uid;
    if (!currentUserId) return;
    setIsAddingMeeting(true);
    try {
      await addMeeting(projectId, currentUserId, {
        title: newMeetingTitle.trim(),
        description: newMeetingDescription.trim() || undefined,
        date: newMeetingDate,
        // Optional, but always written: the meetings listener orders by `time`,
        // and Firestore leaves out any document missing an orderBy field.
        time: newMeetingTime.trim(),
        location: newMeetingLocation.trim(),
        invitedIds: newMeetingInvitedIds,
      });
      setNewMeetingTitle('');
      setNewMeetingDescription('');
      setNewMeetingDate('');
      setNewMeetingTime('');
      setNewMeetingLocation('');
      setNewMeetingInvitedIds([]);
      setShowAddMeeting(false);
    } catch {
      Alert.alert('Error', t('project_details.error_add_meeting'));
    } finally {
      setIsAddingMeeting(false);
    }
  }

  async function handleAddMission() {
    if (!projectId || !newMissionTitle.trim() || newMissionAssignedTo.length === 0) return;
    const currentUserId = auth.currentUser?.uid;
    if (!currentUserId) return;
    const missionData = {
      title: newMissionTitle.trim(),
      description: newMissionDescription.trim() || undefined,
      assignedTo: newMissionAssignedTo,
      dueDate: newMissionDueDate || undefined,
    };
    console.log('[handleAddMission] submitting', { projectId, currentUserId, missionData });
    setIsAddingMission(true);
    try {
      await addMission(projectId, currentUserId, missionData);
      console.log('[handleAddMission] success');
      setNewMissionTitle('');
      setNewMissionDescription('');
      setNewMissionAssignedTo([]);
      setNewMissionDueDate('');
      setShowAddMission(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[handleAddMission] failed:', msg);
      Alert.alert('Error', msg || t('project_details.error_add_mission'));
    } finally {
      setIsAddingMission(false);
    }
  }

  function prevMission() { setMissionIndex(i => (i - 1 + missions.length) % missions.length); }
  function nextMission() { setMissionIndex(i => (i + 1) % missions.length); }
  function prevMeeting() { setMeetingIndex(i => (i - 1 + sortedMeetings.length) % sortedMeetings.length); }
  function nextMeeting() { setMeetingIndex(i => (i + 1) % sortedMeetings.length); }

  async function handleCycleMissionStatus(mission: Mission) {
    if (!projectId) return;
    const next = MISSION_STATUS_CYCLE[mission.status];
    try {
      await updateMissionStatus(projectId, mission.id, next);
    } catch {
      Alert.alert('Error', t('project_details.error_update_mission'));
    }
  }

  /** Closing is a delete, and the sheet's button only says "close" — so ask. */
  async function confirmClose(): Promise<boolean> {
    return confirmDialog(
      t('project_details.confirm_close_title'),
      t('project_details.confirm_close_body'),
      { confirm: t('project_details.close'), cancel: t('common.cancel'), destructive: true },
    );
  }

  async function handleDeleteMeeting(meeting: Meeting) {
    if (!projectId) return;
    if (!await confirmClose()) return;
    try {
      await deleteMeeting(projectId, meeting.id);
      setDetailMeeting(null);
      setMeetingIndex(i => Math.max(0, i - 1));
    } catch {
      Alert.alert('Error', t('project_details.error_update_mission'));
    }
  }

  async function handleDeleteMission(mission: Mission) {
    if (!projectId) return;
    if (!await confirmClose()) return;
    try {
      await deleteMission(projectId, mission.id);
      setDetailMission(null);
      setMissionIndex(i => Math.max(0, i - 1));
    } catch {
      Alert.alert('Error', t('project_details.error_update_mission'));
    }
  }

  const missionLabel = (status: MissionStatus): string => {
    const map: Record<MissionStatus, string> = {
      todo:        t('project_details.mission_todo'),
      in_progress: t('project_details.mission_in_progress'),
      done:        t('project_details.mission_done'),
    };
    return map[status];
  };

  const projectStatusLabel = (status: ProjectRequest['status']): string => {
    const map: Record<ProjectRequest['status'], string> = {
      open:        t('chats.status_open'),
      in_progress: t('chats.status_in_progress'),
      completed:   t('chats.status_completed'),
      cancelled:   t('chats.status_cancelled'),
    };
    return map[status];
  };

  const filledSlots: FilledSlot[] = project.filledSlots ?? [];

  const reviewProfessionals: ReviewProfessional[] = Object.values(
    filledSlots.reduce<Record<string, { professionalId: string; roles: string[] }>>(
      (acc, slot) => {
        const role = slot.category;
        const entry = acc[slot.professionalId];
        if (entry) { if (!entry.roles.includes(role)) entry.roles.push(role); }
        else acc[slot.professionalId] = { professionalId: slot.professionalId, roles: [role] };
        return acc;
      },
      {},
    ),
  ).flatMap(({ professionalId, roles }) => {
    const member = memberUsers[professionalId];
    if (!member) {
      console.log('[ReviewFlow] memberUsers missing for professionalId:', professionalId, '— known keys:', Object.keys(memberUsers));
      return [];
    }
    return [{ id: professionalId, displayName: member.displayName, photoURL: member.photoURL, role: roles.join(' | ') }];
  });

  if (showReviewFlow) {
    console.log('[ReviewFlow] showReviewFlow=true, reviewProfessionals:', reviewProfessionals.length, reviewProfessionals.map(p => p.id));
  }

  // Per-professional payment summary (bundles counted once at bundlePrice)
  type MemberPaymentInfo = { price: number; hasBundle: boolean; individualOffer: PriceOffer | null; bundleId: string | null };
  const memberPaymentMap: Record<string, MemberPaymentInfo> = {};
  const seenBundleIds = new Set<string>();
  for (const offer of acceptedOffers) {
    const profId = offer.professionalId;
    if (!memberPaymentMap[profId]) {
      memberPaymentMap[profId] = { price: 0, hasBundle: false, individualOffer: null, bundleId: null };
    }
    const info = memberPaymentMap[profId];
    if (offer.bundleId) {
      if (!seenBundleIds.has(offer.bundleId)) {
        seenBundleIds.add(offer.bundleId);
        const bundle = bundleMap.get(offer.bundleId);
        if (bundle) {
          info.price += bundle.bundlePrice;
          info.hasBundle = true;
          info.bundleId = offer.bundleId;
        }
      }
    } else {
      info.price += offer.price;
      if (!info.individualOffer) info.individualOffer = offer;
    }
  }
  const currentUserId = auth.currentUser?.uid ?? '';
  const isClient = currentUserId === project.clientId;
  const isCompleted = project.status === 'completed';
  const isCancelled = project.status === 'cancelled';
  // A cancelled or completed project is read-only: no adding/editing missions,
  // meetings, team members or price requests.
  const isReadOnly = isCompleted || isCancelled;
  const isTeamMember = (project.filledSlots ?? []).some((s) => s.professionalId === currentUserId);

  /**
   * Whose price is frozen — the professionals who have finished their part.
   *
   * Two sources, because the two viewers learn it differently. The CLIENT may
   * not read a fee document (§6), so they get the project's derived cache; a
   * project the derivation has never stamped carries no array at all and must
   * read as "nobody has finished", not "everybody has". The PROFESSIONAL gets
   * their own engagement on top, which is authoritative for their own row and
   * ahead of the cache — applyDerivedProjectState is deliberately not atomic, so
   * the array can lag their completion by a round trip.
   *
   * The same freeze createPaymentRequest and respondToPaymentRequest refuse on,
   * so the button can never be tapped into `engagement-finished` except in a
   * race.
   */
  const frozenEngagements = new Set(project.endedEngagementIds ?? []);
  if (!isClient && engagementPriceFrozen(myFee?.engagementStatus)) {
    frozenEngagements.add(currentUserId);
  }

  const removalMap = Object.fromEntries(
    removalRequests.map((r) => [r.professionalId, r.status]),
  );
  const myRemovalRequest = !isClient && myRemovalDoc?.status === 'pending'
    ? myRemovalDoc
    : undefined;

  /** One sheet row: icon tile, then the label above its value. */
  function renderSheetRow(Icon: typeof Users, label: string, value: React.ReactNode, outlined = false) {
    return (
      <View style={[styles.sheetRow, outlined && styles.sheetOutlined, outlined && { borderColor: modeAccent }, { flexDirection: rowDirection }]}>
        <View style={styles.sheetRowTile}>
          <Icon size={16} color="#6D28D9" strokeWidth={2} />
        </View>
        <View style={styles.sheetRowCol}>
          <Text style={[styles.sheetRowLabel, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}>{label}</Text>
          {typeof value === 'string'
            ? <Text style={[styles.sheetRowValue, { textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>{value}</Text>
            : value}
        </View>
      </View>
    );
  }

  /** Invitees / assignees as chips — a comma-joined line does not scan. */
  function renderPeopleChips(ids: string[]) {
    if (ids.length === 0) {
      return <Text style={[styles.sheetRowValue, { textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>—</Text>;
    }
    return (
      <View style={[styles.sheetChipsWrap, { flexDirection: rowDirection }]}>
        {ids.map((id) => {
          const member = id === project?.clientId ? clientUser : memberUsers[id];
          const name = allMemberNames[id] ?? id;
          return (
            <View key={id} style={[styles.sheetChip, { flexDirection: rowDirection }]}>
              {member?.photoURL ? (
                <ExpoImage source={{ uri: member.photoURL }} style={styles.sheetChipAvatar} contentFit="cover" cachePolicy="memory-disk" />
              ) : (
                <View style={[styles.sheetChipAvatar, styles.sheetChipAvatarFallback]}>
                  <AppText weight="bold" style={styles.sheetChipInitial}>{(name[0] ?? '?').toUpperCase()}</AppText>
                </View>
              )}
              <Text style={[styles.sheetChipName, { ...font.medium }]} numberOfLines={1}>{name}</Text>
            </View>
          );
        })}
      </View>
    );
  }

  const allMemberNames: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(memberUsers).map(([id, m]) => [id, m.displayName]),
    ),
    ...(clientUser ? { [project.clientId]: clientUser.displayName } : {}),
  };

  const assignableMembers: { id: string; displayName: string }[] = [
    ...(clientUser ? [{ id: project.clientId, displayName: clientUser.displayName }] : []),
    ...filledSlots
      .map((s) => ({
        id: s.professionalId,
        displayName: memberUsers[s.professionalId]?.displayName ?? s.professionalId,
      }))
      .filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i),
  ];

  const incomingRequests = paymentRequests.filter((r) => r.toUserId === currentUserId);
  const outgoingRequests = paymentRequests.filter((r) => r.fromUserId === currentUserId);

  const sortedMeetings = [
    ...meetings.filter((m) => getMeetingUrgency(m.date, m.time) !== 'past'),
    ...[...meetings.filter((m) => getMeetingUrgency(m.date, m.time) === 'past')].reverse(),
  ];

  return (
    <LinearGradient colors={colors.bgGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.container}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: true, fullScreenGestureEnabled: true }} />

      <ScrollView ref={scrollRef} style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Header — scrolls with content; negative margins cancel contentContainerStyle padding */}
        <View style={[styles.header, { marginHorizontal: -16, marginTop: -16 }]}>
          <TouchableOpacity onPress={() => chatIdParam ? router.push(`/(client)/chat/${chatIdParam}` as never) : router.back()} style={styles.headerBack} activeOpacity={0.7}>
            <AppText weight="regular" style={[styles.headerBackText, { color: modeAccent }]}>{'‹'}</AppText>
          </TouchableOpacity>
          <View style={styles.headerCenter} pointerEvents="none">
            <AppText weight="semiBold" style={styles.headerLabel}>
              {t('project_details.header')}
            </AppText>
            <AppText weight="bold" style={styles.headerProjectTitle} numberOfLines={2}>
              {project.title}
            </AppText>
          </View>
          <View style={styles.headerRight} />
        </View>

        {/* Removal banner — shown to the professional who is pending removal */}
        {myRemovalRequest && !isReadOnly && (
          <View style={[styles.removalBanner, { flexDirection: rowDirection }]}>
            <Text style={[styles.removalBannerText, { ...font.regular, flex: 1, textAlign: rtl ? 'right' : 'left' }]}>
              {t('project_details.removal_pending')}
            </Text>
            <TouchableOpacity
              style={[styles.removalAcceptBtn, acceptingRemoval && styles.removalAcceptBtnBusy]}
              onPress={handleAcceptRemoval}
              disabled={acceptingRemoval}
              activeOpacity={0.8}
            >
              {acceptingRemoval ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={[styles.removalAcceptText, { ...font.bold }]}>
                  {t('project_details.accept_removal')}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Status badge — centered: black label, dot and outline in the mode's
            colour. The wording carries the state (open / done / cancelled). */}
        <View style={[styles.statusBadge, { backgroundColor: modeAccent + '14', borderColor: modeAccent, flexDirection: rowDirection, alignSelf: 'center' }]}>
          <View style={[styles.statusDot, { backgroundColor: modeAccent }]} />
          <Text style={[styles.statusText, { color: '#000000', ...font.bold }]}>{projectStatusLabel(project.status)}</Text>
        </View>

        {/* Three meta cards side-by-side */}
        <View style={[styles.metaCardsRow, { flexDirection: rowDirection }]}>
          <View style={styles.metaCard}>
            <Clapperboard size={16} color={modeAccent} strokeWidth={1.5} />
            <AppText weight="semiBold" style={styles.metaCardLabel}>{t('project_details.execution')}</AppText>
            <AppText weight="bold" style={styles.metaCardValue} numberOfLines={2}>{project.exec ? formatShortDate(project.exec) : t('project_details.tbd')}</AppText>
          </View>
          <TouchableOpacity
            style={styles.metaCard}
            activeOpacity={isProjectClient ? 0.7 : 1}
            onPress={isProjectClient ? () => setShowDeadlinePicker(true) : undefined}
            disabled={!isProjectClient}
          >
            <CalendarDays size={16} color={modeAccent} strokeWidth={1.5} />
            <AppText weight="semiBold" style={styles.metaCardLabel}>{t('project_details.deadline')}</AppText>
            <AppText weight="bold" style={styles.metaCardValue} numberOfLines={2}>
              {project.deadline === 'flexible' ? t('builder.flexible') : formatShortDate(project.deadline)}
            </AppText>
            {isProjectClient && (
              <View style={styles.editDeadlineBadge}>
                <Pencil size={10} color={modeAccent} strokeWidth={2} />
              </View>
            )}
          </TouchableOpacity>
          <View style={styles.metaCard}>
            <MapPin size={16} color={modeAccent} strokeWidth={1.5} />
            <AppText weight="semiBold" style={styles.metaCardLabel}>{t('project_details.location')}</AppText>
            <AppText weight="bold" style={styles.metaCardValue} numberOfLines={2}>{project.location}</AppText>
          </View>
        </View>

        {/* WHAT THAT DATE DOES, in the same words the builder used when it was
            chosen. The end-date reminder tells the client "the project ends in
            two days, change the date if it is wrong" and lands them here; a card
            showing a date and a pencil, with nothing about what the date causes,
            leaves them to guess what they are being warned about.

            Client only. The date is theirs to move and nobody else's, and a
            professional reading "it will close on its own" as an instruction
            would be reading someone else's control. */}
        {isProjectClient && !isReadOnly && (
          <AppText
            weight="regular"
            style={[
              styles.dateConsequence,
              project.deadline === 'flexible' && styles.dateConsequenceFlexible,
              { textAlign: rtl ? 'right' : 'left' },
            ]}
          >
            {project.deadline === 'flexible'
              ? t('builder.flexible_no_autocomplete')
              : t('builder.end_date_note')}
          </AppText>
        )}

        {/* Description card */}
        <View style={styles.descriptionCard}>
          <AppText weight="semiBold" style={styles.metaCardLabel}>{t('project_details.description')}</AppText>
          <AppText weight="regular" style={[styles.descriptionText, { textAlign: rtl ? 'right' : 'left' }]}>
            {project.description}
          </AppText>
        </View>

        {/* Media — every photo and video sent in the project's chat (WhatsApp-style).
            Hidden when there's none, or when the viewer can't read the chat. */}
        <ChatMediaSection chatId={project.chatId ?? chatIdParam} />

        {/* Pending payment-update requests — ABOVE the team, so a request
            waiting on someone is the first thing seen rather than something
            found by scrolling past missions and meetings. */}
        {paymentRequests.length > 0 && (
          <>
            {/* Wrapper exists only to carry onLayout — a fragment cannot. */}
            <View onLayout={onSectionLayout('payments')}>
              <AppText weight="bold" style={[styles.sectionTitle, { textAlign: rtl ? 'right' : 'left', marginTop: 8, marginBottom: 4 }]}>
                {t('project_details.price_requests')}
              </AppText>
            </View>
            {incomingRequests.map((req) => {
              const fromName = allMemberNames[req.fromUserId] ?? req.fromUserId;
              const isResponding = respondingId === req.id;
              return (
                <View
                  key={req.id}
                  style={[styles.pendingRequestCard, styles.pendingRequestCardIncoming]}
                >
                  <Text style={[styles.pendingRequestText, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}>
                    <Text style={[styles.pendingRequestBold, { ...font.bold }]}>{fromName}</Text>
                    {' ' + t('project_details.requests_to_change', {
                      from: req.currentAmount.toLocaleString(),
                      to: req.proposedAmount.toLocaleString(),
                    })}
                  </Text>
                  {req.note ? (
                    <Text style={[styles.pendingRequestNote, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}>
                      "{req.note}"
                    </Text>
                  ) : null}
                  <View style={[styles.pendingRequestActions, { flexDirection: rowDirection }]}>
                    <TouchableOpacity
                      style={[styles.pendingActionBtn, styles.pendingActionAccept, { backgroundColor: modeAccent }, isResponding && styles.completeBtnDisabled]}
                      onPress={() => handleRespondToRequest(req, true)}
                      disabled={isResponding}
                      activeOpacity={0.8}
                    >
                      {isResponding ? (
                        <ActivityIndicator color="#ffffff" size="small" />
                      ) : (
                        <Text style={[styles.pendingActionBtnText, styles.pendingActionAcceptText, { ...font.bold }]}>{t('project_details.accept')}</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.pendingActionBtn, styles.pendingActionReject, isResponding && styles.completeBtnDisabled]}
                      onPress={() => handleRespondToRequest(req, false)}
                      disabled={isResponding}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.pendingActionBtnText, styles.pendingActionRejectText, { ...font.bold }]}>{t('project_details.reject')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}

            {outgoingRequests.map((req) => (
              <View
                key={req.id}
                style={styles.pendingRequestCard}
              >
                <View style={[styles.pendingOutgoingRow, { flexDirection: rowDirection }]}>
                  <Text style={[styles.pendingRequestText, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}>
                    {t('project_details.awaiting', {
                      from: req.currentAmount.toLocaleString(),
                      to: req.proposedAmount.toLocaleString(),
                    })}
                  </Text>
                  <View style={styles.pendingBadge}>
                    <Text style={[styles.pendingBadgeText, { ...font.semiBold }]}>{t('project_details.pending')}</Text>
                  </View>
                </View>
              </View>
            ))}
          </>
        )}

        {/* SECTION 2 — Team Members */}
        {(() => {
          const uniqueProfCount = new Set(filledSlots.map(s => s.professionalId)).size;
          const memberCount = (clientUser ? 1 : 0) + uniqueProfCount;
          return (
            <View style={[styles.sectionHeaderRow, { flexDirection: rowDirection }]}>
              <View style={[styles.sectionTitleGroup, { flexDirection: rowDirection }]}>
                <AppText weight="bold" style={styles.sectionTitle}>{t('project_details.team_members')}</AppText>
                {memberCount > 0 && (
                  <AppText weight="regular" style={styles.sectionCount}>{memberCount}</AppText>
                )}
              </View>
              {isClient && !isReadOnly && (
                <TouchableOpacity style={[styles.addPill, { backgroundColor: modeAccent }]} onPress={() => setShowRolePicker(true)} activeOpacity={0.8}>
                  <AppText weight="semiBold" style={styles.addPillText}>{t('project_details.add_professional')}</AppText>
                </TouchableOpacity>
              )}
            </View>
          );
        })()}

        {clientUser && (
          <MemberRow
            displayName={clientUser.displayName}
            photoURL={clientUser.photoURL}
            roles={[t('project_details.project_client')]}
            badge={t('project_details.client')}
            rtl={rtl}
            onReport={!isClient ? () => { setReportedUserId(project.clientId); setReportedUserName(clientUser.displayName); setReportVisible(true); } : undefined}
          />
        )}

        {Object.values(
          filledSlots.reduce<Record<string, { professionalId: string; roles: string[] }>>(
            (acc, slot) => {
              const role = slot.category;
              const entry = acc[slot.professionalId];
              if (entry) {
                if (!entry.roles.includes(role)) entry.roles.push(role);
              } else {
                acc[slot.professionalId] = { professionalId: slot.professionalId, roles: [role] };
              }
              return acc;
            },
            {},
          ),
        ).map(({ professionalId, roles }) => {
          const member = memberUsers[professionalId];
          const isPendingRemoval = removalMap[professionalId] === 'pending';
          const payment = memberPaymentMap[professionalId];
          return (
            <MemberRow
              key={professionalId}
              displayName={member?.displayName ?? professionalId}
              photoURL={member?.photoURL ?? null}
              roles={roles}
              rtl={rtl}
              isPendingRemoval={isClient && isPendingRemoval}
              isRemoving={removingId === professionalId}
              onRemove={isClient && !isReadOnly ? () => handleRequestRemoval(professionalId) : undefined}
              onReport={professionalId !== currentUserId ? () => { setReportedUserId(professionalId); setReportedUserName(member?.displayName ?? ''); setReportVisible(true); } : undefined}
              payment={(isClient || professionalId === currentUserId) ? payment : undefined}
              // Per-engagement state is the viewing professional's OWN only: the
              // client cannot read fee docs by rule and is never told (§6), and
              // one professional must never see another's.
              engagementStatus={
                !isClient && professionalId === currentUserId
                  ? myFee?.engagementStatus ?? undefined
                  : undefined
              }
              onContest={
                !isClient && professionalId === currentUserId && canDispute(myFee)
                  ? () => setContestSheetOpen(true)
                  : undefined
              }
              contestWindowEndsAt={
                !isClient && professionalId === currentUserId && canDispute(myFee)
                  ? contestWindowEndsAt(myFee) ?? undefined
                  : undefined
              }
              onUpdate={(isClient || professionalId === currentUserId) && !isReadOnly
                && !frozenEngagements.has(professionalId)
                && (payment?.individualOffer || payment?.bundleId)
                ? () => {
                    if (!payment) return;
                    setSelectedPrice(
                      payment.bundleId
                        ? { professionalId, currentAmount: payment.price, bundleId: payment.bundleId }
                        : {
                            professionalId,
                            currentAmount: payment.individualOffer?.price ?? payment.price,
                            // Names the ROLE being repriced. Without it the accept
                            // matched every accepted offer this pro holds on the
                            // project and overwrote all of them.
                            category: payment.individualOffer?.category,
                          },
                    );
                    setProposedAmount('');
                    setRequestNote('');
                    setShowPaymentRequestModal(true);
                  }
                : undefined}
            />
          );
        })}

        {filledSlots.length === 0 && !clientUser && (
          <AppText weight="regular" style={styles.emptyNote}>
            {t('project_details.no_team_members')}
          </AppText>
        )}

        {/* SECTION 3 — Missions */}
        {(() => (
          <View onLayout={onSectionLayout('missions')} style={[styles.sectionHeaderRow, { flexDirection: rowDirection }]}>
            <View style={[styles.sectionTitleGroup, { flexDirection: rowDirection }]}>
              <AppText weight="bold" style={styles.sectionTitle}>{t('project_details.missions')}</AppText>
              {missions.length > 0 && (
                <AppText weight="regular" style={styles.sectionCount}>{missions.length}</AppText>
              )}
            </View>
            {(isClient || isTeamMember) && !isReadOnly && (
              <TouchableOpacity style={[styles.addPill, { backgroundColor: modeAccent }]} onPress={() => setShowAddMission(true)} activeOpacity={0.8}>
                <AppText weight="semiBold" style={styles.addPillText}>{t('project_details.add')}</AppText>
              </TouchableOpacity>
            )}
          </View>
        ))()}

        {missions.length === 0 ? (
          <AppText weight="regular" style={styles.emptyNote}>
            {t('project_details.no_missions')}
          </AppText>
        ) : (
          <>
            {(() => {
              const mission = missions[Math.min(missionIndex, missions.length - 1)];
              const missionOutline = MISSION_OUTLINE[mission.status] ?? modeAccent;
              const isAssigned = mission.assignedTo.includes(currentUserId);
              return (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setDetailMission(mission)}
                >
                <View style={[styles.carouselCard, { flexDirection: rowDirection }]}>
                  {/* Avatar stack — leading (right in RTL) */}
                  {(() => {
                    const MAX_STACK = 3;
                    const ids = mission.assignedTo.slice(0, MAX_STACK);
                    const overflow = mission.assignedTo.length - MAX_STACK;
                    return (
                      <View style={styles.avatarStack}>
                        {ids.map((id, idx) => {
                          const info = memberUsers[id];
                          const name = allMemberNames[id] ?? id;
                          return info?.photoURL ? (
                            <Image key={id} source={{ uri: info.photoURL }} style={[styles.stackAvatar, idx > 0 && styles.stackAvatarOverlap]} />
                          ) : (
                            <View key={id} style={[styles.stackAvatar, styles.stackAvatarFallback, { backgroundColor: modeAccent }, idx > 0 && styles.stackAvatarOverlap]}>
                              <AppText weight="bold" style={styles.stackAvatarInitial}>{name.charAt(0).toUpperCase()}</AppText>
                            </View>
                          );
                        })}
                        {overflow > 0 && (
                          <View style={[styles.stackAvatar, styles.stackAvatarMore, styles.stackAvatarOverlap]}>
                            <AppText weight="bold" style={styles.stackAvatarInitial}>+{overflow}</AppText>
                          </View>
                        )}
                      </View>
                    );
                  })()}

                  {/* Info — middle */}
                  <View style={[styles.carouselCardInfo, { alignItems: rtl ? 'flex-end' : 'flex-start' }]}>
                    <AppText weight="semiBold" style={[styles.missionTitle, { textAlign: rtl ? 'right' : 'left' }]} numberOfLines={2}>
                      {mission.status === 'done' ? `${mission.title} - ${t('project_details.tap_to_close')}` : mission.title}
                    </AppText>
                    <View style={styles.cardDivider} />
                    <View style={[styles.missionDatesRow, { flexDirection: rowDirection }]}>
                      {/* Upload date — first in JSX → right in RTL */}
                      {mission.createdAt && (() => {
                        const d = new Date(mission.createdAt.seconds * 1000);
                        const dd = String(d.getDate()).padStart(2, '0');
                        const mm = String(d.getMonth() + 1).padStart(2, '0');
                        const yy = String(d.getFullYear()).slice(2);
                        return (
                          <View style={[styles.missionDueRow, { flexDirection: rowDirection }]}>
                            <Calendar size={12} color={modeAccent} strokeWidth={1.5} />
                            <AppText weight="regular" style={styles.missionDue}>
                              {t('project_details.mission_uploaded')}{dd}/{mm}/{yy}
                            </AppText>
                          </View>
                        );
                      })()}
                      {/* Due date — second in JSX → left in RTL */}
                      {mission.dueDate && (() => {
                        const parts = mission.dueDate!.split('-');
                        const dueFmt = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0].slice(2)}` : mission.dueDate!;
                        return (
                          <View style={[styles.missionDueRow, { flexDirection: rowDirection }]}>
                            <CalendarDays size={12} color={modeAccent} strokeWidth={1.5} />
                            <AppText weight="regular" style={styles.missionDue}>
                              {t('project_details.due')}{dueFmt}
                            </AppText>
                          </View>
                        );
                      })()}
                    </View>
                  </View>

                  {/* Status pill + optional trash — trailing (left in RTL) */}
                  <View style={styles.carouselStatusCol}>
                    <TouchableOpacity
                      style={[
                        styles.carouselStatusPill,
                        mission.status === 'done' ? styles.carouselStatusDone : { borderColor: missionOutline, borderWidth: 1.5 },
                        !isAssigned && { opacity: 0.5 },
                      ]}
                      onPress={isAssigned ? () => handleCycleMissionStatus(mission) : undefined}
                      activeOpacity={isAssigned ? 0.8 : 1}
                    >
                      <AppText weight="bold" style={[styles.carouselStatusText, { color: '#000000' }]}>
                        {mission.status === 'done' ? `✓ ${missionLabel(mission.status)}` : missionLabel(mission.status)}
                      </AppText>
                    </TouchableOpacity>
                  </View>
                </View>
                </TouchableOpacity>
              );
            })()}

            {missions.length > 1 && (
              <View style={styles.carouselNavRow}>
                <TouchableOpacity onPress={rtl ? nextMission : prevMission} style={styles.carouselNavBtn} activeOpacity={0.7}>
                  <ChevronLeft size={20} color={modeAccent} strokeWidth={2.5} />
                </TouchableOpacity>
                <AppText weight="semiBold" style={styles.carouselCounter}>
                  {Math.min(missionIndex, missions.length - 1) + 1} / {missions.length}
                </AppText>
                <TouchableOpacity onPress={rtl ? prevMission : nextMission} style={styles.carouselNavBtn} activeOpacity={0.7}>
                  <ChevronRight size={20} color={modeAccent} strokeWidth={2.5} />
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {/* SECTION 4 — Meetings */}
        {(() => (
          <View onLayout={onSectionLayout('meetings')} style={[styles.sectionHeaderRow, { flexDirection: rowDirection }]}>
            <View style={[styles.sectionTitleGroup, { flexDirection: rowDirection }]}>
              <AppText weight="bold" style={styles.sectionTitle}>{t('project_details.meetings')}</AppText>
              {meetings.length > 0 && (
                <AppText weight="regular" style={styles.sectionCount}>{meetings.length}</AppText>
              )}
            </View>
            {(isClient || isTeamMember) && !isReadOnly && (
              <TouchableOpacity style={[styles.addPill, { backgroundColor: modeAccent }]} onPress={() => setShowAddMeeting(true)} activeOpacity={0.8} testID="add-meeting-pill">
                <AppText weight="semiBold" style={styles.addPillText}>{t('project_details.add')}</AppText>
              </TouchableOpacity>
            )}
          </View>
        ))()}

        {meetings.length === 0 ? (
          <AppText weight="regular" style={styles.emptyNote}>
            {t('project_details.no_meetings')}
          </AppText>
        ) : (
          <>
            {(() => {
              const meeting = sortedMeetings[Math.min(meetingIndex, sortedMeetings.length - 1)];
              const urgency = getMeetingUrgency(meeting.date, meeting.time);
              // The date block carries the urgency, and only by its outline:
              // today or tomorrow (imminent, ≤2d) is red, later this week
              // (soon, ≤7d) takes the mode accent, a past meeting is green, and
              // anything further out is black. The date text itself is black
              // throughout (green on a past meeting, which is done).
              const dateTextColor = urgency === 'past' ? '#1c9d63' : '#000000';
              const dateBorderColor =
                urgency === 'past'     ? '#1c9d63' :
                urgency === 'imminent' ? '#ef4444' :
                urgency === 'soon'     ? modeAccent :
                '#000000';
              const { monthAbbr, day } = getMeetingDateParts(meeting.date);
              return (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setDetailMeeting(meeting)}
                >
                <View style={[styles.carouselCard, { flexDirection: rowDirection }]}>
                  {/* Avatar stack — leading (right in RTL) */}
                  {(() => {
                    const MAX_STACK = 3;
                    const ids = meeting.invitedIds.slice(0, MAX_STACK);
                    const overflow = meeting.invitedIds.length - MAX_STACK;
                    return (
                      <View style={styles.avatarStack}>
                        {ids.map((id, idx) => {
                          const info = memberUsers[id];
                          const name = allMemberNames[id] ?? id;
                          return info?.photoURL ? (
                            <Image key={id} source={{ uri: info.photoURL }} style={[styles.stackAvatar, idx > 0 && styles.stackAvatarOverlap]} />
                          ) : name ? (
                            <View key={id} style={[styles.stackAvatar, styles.stackAvatarFallback, { backgroundColor: modeAccent }, idx > 0 && styles.stackAvatarOverlap]}>
                              <AppText weight="bold" style={styles.stackAvatarInitial}>{name.charAt(0).toUpperCase()}</AppText>
                            </View>
                          ) : null;
                        })}
                        {overflow > 0 && (
                          <View style={[styles.stackAvatar, styles.stackAvatarMore, styles.stackAvatarOverlap]}>
                            <AppText weight="bold" style={styles.stackAvatarInitial}>+{overflow}</AppText>
                          </View>
                        )}
                      </View>
                    );
                  })()}

                  {/* Info — middle */}
                  <View style={[styles.carouselCardInfo, { alignItems: rtl ? 'flex-end' : 'flex-start' }]}>
                    <AppText weight="semiBold" style={[styles.missionTitle, { textAlign: rtl ? 'right' : 'left' }]} numberOfLines={2}>
                      {urgency === 'past' ? `${meeting.title} - ${t('project_details.tap_to_close')}` : meeting.title}
                    </AppText>
                    <View style={styles.cardDivider} />
                    {!!meeting.time && (
                      <View style={[styles.missionDueRow, { flexDirection: rowDirection }]} testID="meeting-time-row">
                        <Clock size={12} color={modeAccent} strokeWidth={1.5} />
                        <AppText weight="regular" style={styles.missionDue}>{meeting.time}</AppText>
                      </View>
                    )}
                    {!!meeting.location && (
                      <View style={[styles.missionDueRow, { flexDirection: rowDirection }]} testID="meeting-location-row">
                        <MapPin size={12} color={modeAccent} strokeWidth={1.5} />
                        <AppText weight="regular" style={styles.missionDue} numberOfLines={1}>{meeting.location}</AppText>
                      </View>
                    )}
                  </View>

                  {/* Date block — trailing (left in RTL) */}
                  <View style={[styles.meetingDateBlock, { borderColor: dateBorderColor }]}>
                    <AppText weight="semiBold" style={[styles.meetingDateMonth, { color: dateTextColor }]}>{monthAbbr}</AppText>
                    <AppText weight="bold" style={[styles.meetingDateDay, { color: dateTextColor }]}>{day}</AppText>
                  </View>
                </View>
                </TouchableOpacity>
              );
            })()}

            {sortedMeetings.length > 1 && (
              <View style={styles.carouselNavRow}>
                <TouchableOpacity onPress={rtl ? nextMeeting : prevMeeting} style={styles.carouselNavBtn} activeOpacity={0.7}>
                  <ChevronLeft size={20} color={modeAccent} strokeWidth={2.5} />
                </TouchableOpacity>
                <AppText weight="semiBold" style={styles.carouselCounter}>
                  {Math.min(meetingIndex, sortedMeetings.length - 1) + 1} / {sortedMeetings.length}
                </AppText>
                <TouchableOpacity onPress={rtl ? prevMeeting : nextMeeting} style={styles.carouselNavBtn} activeOpacity={0.7}>
                  <ChevronRight size={20} color={modeAccent} strokeWidth={2.5} />
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        <View style={styles.bottomPad} />
      </ScrollView>

      {/* Mark as Complete / Completed badge */}
      {isClient && !isCancelled && (
        <View style={styles.completeBar}>
          {isCompleted ? (
            <View style={styles.completedBadge}>
              <Text style={[styles.completedBadgeText, { ...font.bold }]}>{t('project_details.completed')}</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.completeBtn, { backgroundColor: modeAccent }, isCalculatingFee && styles.completeBtnDisabled]}
              onPress={handleMarkComplete}
              disabled={isCalculatingFee}
              activeOpacity={0.8}
            >
              {isCalculatingFee ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={[styles.completeBtnText, { ...font.bold }]}>{t('project_details.mark_complete')}</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* The professional's "finish my part": the same full-width button as the
          client's close-project button, for their own engagement only. */}
      {!isClient && !isCancelled && canMarkComplete(myFee) && (
        <View style={styles.completeBar} testID="pro-complete-bar">
          <TouchableOpacity
            style={[styles.completeBtn, { backgroundColor: modeAccent }]}
            onPress={() => setCompleteSheetOpen(true)}
            activeOpacity={0.8}
            accessibilityRole="button"
            testID="pro-complete-btn"
          >
            <Text style={[styles.completeBtnText, { ...font.bold }]}>{t('engagement.mark_complete')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Mounted only for a professional. A client has no engagement to complete,
          and mounting it anyway would subscribe them to the pricing config for a
          sheet they can never open. */}
      {!isClient && (
      <CompleteEngagementSheet
        visible={completeSheetOpen}
        projectTitle={project.title ?? ''}
        fee={myFee}
        submitting={proActionBusy}
        onConfirm={handleMarkEngagementComplete}
        onClose={() => setCompleteSheetOpen(false)}
      />
      )}

      {!isClient && (
      <ContestEngagementSheet
        visible={contestSheetOpen}
        projectTitle={project.title ?? ''}
        submitting={proActionBusy}
        onConfirm={handleContest}
        onClose={() => setContestSheetOpen(false)}
      />
      )}

      {/* Add Mission Modal */}
      <BottomSheet visible={showAddMission} onClose={() => setShowAddMission(false)}>
        <View style={[styles.sheetHeader, { flexDirection: rowDirection }]}>
          <LinearGradient colors={SHEET_TILE_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.sheetTile}>
            <CheckSquare size={20} color="#FFFFFF" strokeWidth={2} />
          </LinearGradient>
          <View style={styles.sheetTitleCol}>
            <Text style={[styles.sheetTitle, { textAlign: rtl ? 'right' : 'left', ...font.bold }]} numberOfLines={2}>
              {t('project_details.add_mission_title')}
            </Text>
          </View>
        </View>

        <ScrollView
          style={styles.sheetBody}
          contentContainerStyle={styles.sheetBodyContent}
          automaticallyAdjustKeyboardInsets
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View>
            <Text style={[styles.sheetFieldLabel, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}>
              {t('project_details.mission_title')}
            </Text>
            <TextInput
              style={[styles.sheetInput, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}
              value={newMissionTitle}
              onChangeText={setNewMissionTitle}
              placeholder={t('project_details.mission_placeholder')}
              placeholderTextColor="#9C99AD"
            />
          </View>

          <View>
            <Text style={[styles.sheetFieldLabel, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}>
              {t('project_details.description_optional')}
            </Text>
            <TextInput
              style={[styles.sheetInput, styles.sheetInputMultiline, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}
              value={newMissionDescription}
              onChangeText={setNewMissionDescription}
              placeholder={t('project_details.description_placeholder')}
              placeholderTextColor="#9C99AD"
              multiline
              numberOfLines={3}
            />
          </View>

          <View>
            <Text style={[styles.sheetFieldLabel, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}>
              {t('project_details.assign_to')}
            </Text>
            {assignableMembers.map((m) => {
              const selected = newMissionAssignedTo.includes(m.id);
              return (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.sheetPersonRow, { flexDirection: rowDirection }, selected && { borderColor: modeAccent, backgroundColor: '#F8F6FC' }]}
                  onPress={() => toggleAssignee(m.id)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.sheetPersonName, { textAlign: rtl ? 'right' : 'left', ...font.medium }]}>
                    {m.displayName}
                  </Text>
                  <View style={[styles.sheetCheck, { borderColor: selected ? modeAccent : '#DDD7EC', backgroundColor: selected ? modeAccent : 'transparent' }]}>
                    {selected && <Text style={[styles.sheetCheckTick, { ...font.bold }]}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <View>
            <Text style={[styles.sheetFieldLabel, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}>
              {t('project_details.due_date')}
            </Text>
            {newMissionDueDate ? (
              <View style={[styles.sheetPickRow, styles.sheetOutlined, { borderColor: modeAccent, flexDirection: rowDirection }]}>
                <View style={styles.sheetRowTile}>
                  <Calendar size={16} color="#6D28D9" strokeWidth={2} />
                </View>
                <Text style={[styles.sheetPickValue, { textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>
                  {formatDueDate(newMissionDueDate, t('project_details.due'))}
                </Text>
                <TouchableOpacity onPress={() => setNewMissionDueDate('')} hitSlop={12} activeOpacity={0.7}>
                  <Text style={[styles.sheetPickClear, { ...font.bold }]}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.sheetPickRow, styles.sheetOutlined, { borderColor: modeAccent, flexDirection: rowDirection }]}
                onPress={() => setShowDueDatePicker(true)}
                activeOpacity={0.8}
              >
                <View style={styles.sheetRowTile}>
                  <Calendar size={16} color="#6D28D9" strokeWidth={2} />
                </View>
                <Text style={[styles.sheetPickPlaceholder, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}>
                  {t('project_details.add_due_date')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>

        <View style={[styles.sheetActions, { flexDirection: rowDirection }]}>
          <TouchableOpacity
            style={[styles.sheetDismissBtn, styles.sheetSecondaryBtn]}
            onPress={() => setShowAddMission(false)}
            activeOpacity={0.8}
          >
            <Text style={[styles.sheetDismissText, { ...font.semiBold }]}>{t('project_details.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.sheetPrimaryBtn,
              { backgroundColor: modeAccent },
              (!newMissionTitle.trim() || newMissionAssignedTo.length === 0 || isAddingMission) && styles.completeBtnDisabled,
            ]}
            onPress={handleAddMission}
            disabled={!newMissionTitle.trim() || newMissionAssignedTo.length === 0 || isAddingMission}
            activeOpacity={0.8}
          >
            {isAddingMission ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={[styles.sheetPrimaryText, { ...font.bold }]}>{t('project_details.add')}</Text>
            )}
          </TouchableOpacity>
        </View>

        {showDueDatePicker && (
          <MiniCalendar
            value={newMissionDueDate}
            onSelect={(iso) => { setNewMissionDueDate(iso); setShowDueDatePicker(false); }}
            onClose={() => setShowDueDatePicker(false)}
            minDate={todayISO}
            maxDate={projectEndDate}
          />
        )}
      </BottomSheet>

      {/* Add Meeting Modal */}
      <BottomSheet visible={showAddMeeting} onClose={() => setShowAddMeeting(false)}>
        <View style={[styles.sheetHeader, { flexDirection: rowDirection }]}>
          <LinearGradient colors={SHEET_TILE_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.sheetTile}>
            <Calendar size={20} color="#FFFFFF" strokeWidth={2} />
          </LinearGradient>
          <View style={styles.sheetTitleCol}>
            <Text style={[styles.sheetTitle, { textAlign: rtl ? 'right' : 'left', ...font.bold }]} numberOfLines={2}>
              {t('project_details.add_meeting_title')}
            </Text>
          </View>
        </View>

        <ScrollView
          style={styles.sheetBody}
          contentContainerStyle={styles.sheetBodyContent}
          automaticallyAdjustKeyboardInsets
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View>
            <Text style={[styles.sheetFieldLabel, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}>
              {t('project_details.meeting_title_label')}
            </Text>
            <TextInput
              style={[styles.sheetInput, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}
              value={newMeetingTitle}
              onChangeText={setNewMeetingTitle}
              placeholder={t('project_details.meeting_title_placeholder')}
              placeholderTextColor="#9C99AD"
            />
          </View>

          <View>
            <Text style={[styles.sheetFieldLabel, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}>
              {t('project_details.description_optional')}
            </Text>
            <TextInput
              style={[styles.sheetInput, styles.sheetInputMultiline, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}
              value={newMeetingDescription}
              onChangeText={setNewMeetingDescription}
              placeholder={t('project_details.description_placeholder')}
              placeholderTextColor="#9C99AD"
              multiline
              numberOfLines={3}
            />
          </View>

          <View>
            <Text style={[styles.sheetFieldLabel, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}>
              {t('project_details.meeting_date')}
            </Text>
            {newMeetingDate ? (
              <View style={[styles.sheetPickRow, styles.sheetOutlined, { borderColor: modeAccent, flexDirection: rowDirection }]}>
                <View style={styles.sheetRowTile}>
                  <Calendar size={16} color="#6D28D9" strokeWidth={2} />
                </View>
                <Text style={[styles.sheetPickValue, { textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>
                  {formatDueDate(newMeetingDate, '')}
                </Text>
                <TouchableOpacity onPress={() => setNewMeetingDate('')} hitSlop={12} activeOpacity={0.7}>
                  <Text style={[styles.sheetPickClear, { ...font.bold }]}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.sheetPickRow, styles.sheetOutlined, { borderColor: modeAccent, flexDirection: rowDirection }]}
                onPress={() => setShowMeetingDatePicker(true)}
                activeOpacity={0.8}
              >
                <View style={styles.sheetRowTile}>
                  <Calendar size={16} color="#6D28D9" strokeWidth={2} />
                </View>
                <Text style={[styles.sheetPickPlaceholder, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}>
                  {t('project_details.meeting_date')}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <View>
            <Text style={[styles.sheetFieldLabel, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}>
              {t('project_details.meeting_time_optional')}
            </Text>
            {newMeetingTime ? (
              <View style={[styles.sheetPickRow, styles.sheetOutlined, { borderColor: modeAccent, flexDirection: rowDirection }]}>
                <View style={styles.sheetRowTile}>
                  <Clock size={16} color="#6D28D9" strokeWidth={2} />
                </View>
                <Text style={[styles.sheetPickValue, { textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>
                  {newMeetingTime}
                </Text>
                <TouchableOpacity onPress={() => setNewMeetingTime('')} hitSlop={12} activeOpacity={0.7}>
                  <Text style={[styles.sheetPickClear, { ...font.bold }]}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.sheetPickRow, styles.sheetOutlined, { borderColor: modeAccent, flexDirection: rowDirection }]}
                onPress={() => setShowMeetingTimePicker(true)}
                activeOpacity={0.8}
              >
                <View style={styles.sheetRowTile}>
                  <Clock size={16} color="#6D28D9" strokeWidth={2} />
                </View>
                <Text style={[styles.sheetPickPlaceholder, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}>
                  {t('project_details.meeting_time_placeholder')}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <View>
            <Text style={[styles.sheetFieldLabel, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}>
              {t('project_details.meeting_location_optional')}
            </Text>
            <TextInput
              style={[styles.sheetInput, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}
              value={newMeetingLocation}
              onChangeText={setNewMeetingLocation}
              placeholder={t('project_details.meeting_location_placeholder')}
              placeholderTextColor="#9C99AD"
            />
          </View>

          <View>
            <Text style={[styles.sheetFieldLabel, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}>
              {t('project_details.meeting_invitees')}
            </Text>
            {assignableMembers.map((m) => {
              const selected = newMeetingInvitedIds.includes(m.id);
              return (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.sheetPersonRow, { flexDirection: rowDirection }, selected && { borderColor: modeAccent, backgroundColor: '#F8F6FC' }]}
                  onPress={() => toggleInvitee(m.id)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.sheetPersonName, { textAlign: rtl ? 'right' : 'left', ...font.medium }]}>
                    {m.displayName}
                  </Text>
                  <View style={[styles.sheetCheck, { borderColor: selected ? modeAccent : '#DDD7EC', backgroundColor: selected ? modeAccent : 'transparent' }]}>
                    {selected && <Text style={[styles.sheetCheckTick, { ...font.bold }]}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        <View style={[styles.sheetActions, { flexDirection: rowDirection }]}>
          <TouchableOpacity
            style={[styles.sheetDismissBtn, styles.sheetSecondaryBtn]}
            onPress={() => setShowAddMeeting(false)}
            activeOpacity={0.8}
          >
            <Text style={[styles.sheetDismissText, { ...font.semiBold }]}>{t('project_details.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.sheetPrimaryBtn,
              { backgroundColor: modeAccent },
              (!newMeetingTitle.trim() || !newMeetingDate || newMeetingInvitedIds.length === 0 || isAddingMeeting) && styles.completeBtnDisabled,
            ]}
            onPress={handleAddMeeting}
            disabled={!newMeetingTitle.trim() || !newMeetingDate || newMeetingInvitedIds.length === 0 || isAddingMeeting}
            accessibilityState={{ disabled: !newMeetingTitle.trim() || !newMeetingDate || newMeetingInvitedIds.length === 0 || isAddingMeeting }}
            testID="add-meeting-confirm"
            activeOpacity={0.8}
          >
            {isAddingMeeting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={[styles.sheetPrimaryText, { ...font.bold }]}>{t('project_details.add')}</Text>
            )}
          </TouchableOpacity>
        </View>

        {showMeetingDatePicker && (
          <MiniCalendar
            value={newMeetingDate}
            onSelect={(iso) => { setNewMeetingDate(iso); setShowMeetingDatePicker(false); }}
            onClose={() => setShowMeetingDatePicker(false)}
            minDate={todayISO}
            maxDate={projectEndDate}
          />
        )}
        {showMeetingTimePicker && (
          <MiniTimePicker
            value={newMeetingTime}
            onSelect={(t) => setNewMeetingTime(t)}
            onClose={() => setShowMeetingTimePicker(false)}
          />
        )}
      </BottomSheet>

      {/* Edit project deadline (client only) */}
      {showDeadlinePicker && (
        <MiniCalendar
          value={project.deadline === 'flexible' ? '' : project.deadline}
          onSelect={handleEditDeadline}
          onClose={() => setShowDeadlinePicker(false)}
          minDate={deadlineMinDate}
          // "Flexible" is no longer offered. A project that already has it still
          // shows it, and picking a date here replaces it.
        />
      )}

      {/* Mission detail popup */}
      <BottomSheet visible={!!detailMission} onClose={() => setDetailMission(null)}>
        {detailMission && (
          <>
            {/* Header — stays put while the body scrolls */}
            <View style={[styles.sheetHeader, { flexDirection: rowDirection }]}>
              <LinearGradient colors={SHEET_TILE_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.sheetTile}>
                <CheckSquare size={20} color="#FFFFFF" strokeWidth={2} />
              </LinearGradient>
              <View style={styles.sheetTitleCol}>
                <Text style={[styles.sheetTitle, { textAlign: rtl ? 'right' : 'left', ...font.bold }]} numberOfLines={2}>
                  {detailMission.title}
                </Text>
                <View style={[styles.sheetBadgeRow, { flexDirection: rowDirection }]}>
                  <View style={[styles.sheetBadge, { backgroundColor: MISSION_BADGE[detailMission.status].bg }]}>
                    <AppText weight="semiBold" style={[styles.sheetBadgeText, { color: MISSION_BADGE[detailMission.status].text }]}>
                      {missionLabel(detailMission.status)}
                    </AppText>
                  </View>
                </View>
              </View>
              {/* A mission can be removed once it is done — or at any time by
                  whoever added it. */}
              {(detailMission.status === 'done'
                || detailMission.createdBy === auth.currentUser?.uid) && (
                <TouchableOpacity
                  style={styles.sheetTrashBtn}
                  onPress={() => void handleDeleteMission(detailMission)}
                  activeOpacity={0.7}
                  hitSlop={6}
                  accessibilityRole="button"
                  testID="mission-close"
                >
                  <Trash2 size={15} color="#B4232A" strokeWidth={1.9} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.sheetCloseBtn}
                onPress={() => setDetailMission(null)}
                activeOpacity={0.7}
                hitSlop={7}
                accessibilityRole="button"
              >
                <X size={14} color="#5A5768" strokeWidth={2.4} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.sheetBody} contentContainerStyle={styles.sheetBodyContent} showsVerticalScrollIndicator={false}>
              {!!detailMission.description && (
                <View style={styles.sheetDescPanel}>
                  <AppText weight="regular" style={[styles.sheetDescText, { textAlign: rtl ? 'right' : 'left' }]}>
                    {detailMission.description}
                  </AppText>
                </View>
              )}

              <View>
                {renderSheetRow(Users, t('project_details.assign_to'), renderPeopleChips(detailMission.assignedTo))}
                {!!detailMission.dueDate && (
                  <>
                    <View style={styles.sheetRowDivider} />
                    {renderSheetRow(Calendar, t('project_details.due_date'), formatDueDate(detailMission.dueDate, ''), true)}
                  </>
                )}
              </View>
            </ScrollView>

            <TouchableOpacity style={styles.sheetDismissBtn} onPress={() => setDetailMission(null)} activeOpacity={0.8}>
              <Text style={[styles.sheetDismissText, { ...font.semiBold }]}>{t('project_details.close')}</Text>
            </TouchableOpacity>
          </>
        )}
      </BottomSheet>

      {/* Meeting detail popup */}
      <BottomSheet visible={!!detailMeeting} onClose={() => setDetailMeeting(null)}>
        {detailMeeting && (
          <>
            <View style={[styles.sheetHeader, { flexDirection: rowDirection }]}>
              <LinearGradient colors={SHEET_TILE_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.sheetTile}>
                <Calendar size={20} color="#FFFFFF" strokeWidth={2} />
              </LinearGradient>
              <View style={styles.sheetTitleCol}>
                <Text style={[styles.sheetTitle, { textAlign: rtl ? 'right' : 'left', ...font.bold }]} numberOfLines={2}>
                  {detailMeeting.title}
                </Text>
              </View>
              {/* A meeting can be removed once it has happened — or at any
                  time by whoever added it. */}
              {(getMeetingUrgency(detailMeeting.date, detailMeeting.time) === 'past'
                || detailMeeting.createdBy === auth.currentUser?.uid) && (
                <TouchableOpacity
                  style={styles.sheetTrashBtn}
                  onPress={() => void handleDeleteMeeting(detailMeeting)}
                  activeOpacity={0.7}
                  hitSlop={6}
                  accessibilityRole="button"
                  testID="meeting-close"
                >
                  <Trash2 size={15} color="#B4232A" strokeWidth={1.9} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.sheetCloseBtn}
                onPress={() => setDetailMeeting(null)}
                activeOpacity={0.7}
                hitSlop={7}
                accessibilityRole="button"
              >
                <X size={14} color="#5A5768" strokeWidth={2.4} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.sheetBody} contentContainerStyle={styles.sheetBodyContent} showsVerticalScrollIndicator={false}>
              {!!detailMeeting.description && (
                <View style={styles.sheetDescPanel}>
                  <AppText weight="regular" style={[styles.sheetDescText, { textAlign: rtl ? 'right' : 'left' }]}>
                    {detailMeeting.description}
                  </AppText>
                </View>
              )}

              <View>
                {/* Date and time are one fact, so they share a row. */}
                {renderSheetRow(
                  CalendarDays,
                  t('project_details.meeting_date'),
                  detailMeeting.time
                    ? `${formatDueDate(detailMeeting.date, '')} · ${detailMeeting.time}`
                    : formatDueDate(detailMeeting.date, ''),
                  true,
                )}
                {!!detailMeeting.location && (
                  <>
                    <View style={styles.sheetRowDivider} />
                    {renderSheetRow(MapPin, t('project_details.meeting_location'), detailMeeting.location)}
                  </>
                )}
                <View style={styles.sheetRowDivider} />
                {renderSheetRow(Users, t('project_details.meeting_invitees'), renderPeopleChips(detailMeeting.invitedIds))}
              </View>
            </ScrollView>

            <TouchableOpacity style={styles.sheetDismissBtn} onPress={() => setDetailMeeting(null)} activeOpacity={0.8}>
              <Text style={[styles.sheetDismissText, { ...font.semiBold }]}>{t('project_details.close')}</Text>
            </TouchableOpacity>
          </>
        )}
      </BottomSheet>

      {/* Payment Summary Modal */}
      <Modal
        visible={showPaymentSummary}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPaymentSummary(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: '#000000', textAlign: rtl ? 'right' : 'left', ...font.bold }]}>
              {t('project_details.payment_summary_title')}
            </Text>

            {/* THIS IS AN ACCELERATOR, NOT A GATE, and it has to say so before
                the client reads a list of amounts and concludes they are being
                asked to approve something. Since the Phase 4 inversion each
                professional closes their own part and the end date closes the
                rest; the client pressing this only brings that forward.

                The flexible variant is a different sentence, not the same one
                with a blank in it: with no end date nothing closes by itself, so
                "anything still open closes on {{date}}" would be a promise the
                project cannot keep. */}
            <AppText
              weight="regular"
              style={[styles.closeNowBody, { textAlign: rtl ? 'right' : 'left' }]}
            >
              {projectEndDate
                ? t('project_details.close_now_body', { date: formatShortDate(projectEndDate) })
                : t('project_details.close_now_body_flexible')}
            </AppText>

            {feeData && (
              <>
                <Text style={[styles.modalSectionLabel, { color: '#00000099', textAlign: rtl ? 'right' : 'left', ...font.bold }]}>
                  {t('project_details.pay_crew')}
                </Text>

                {feeData.slots.map((slot) => (
                  <View key={slot.professionalId} style={styles.feeRow}>
                    <Text style={[styles.feeName, { color: '#000000', textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>{slot.displayName}</Text>
                    <Text style={[styles.feeAmount, { color: '#000000', ...font.medium }]}>
                      ₪{slot.amount.toLocaleString()}
                    </Text>
                  </View>
                ))}

                <View style={styles.feeRow}>
                  <Text style={[styles.feeLabel, { color: '#00000099', textAlign: rtl ? 'right' : 'left', ...font.medium }]}>
                    {t('project_details.subtotal')}
                  </Text>
                  <Text style={[styles.feeAmountBold, { color: '#000000', ...font.bold }]}>
                    ₪{feeData.subtotal.toLocaleString()}
                  </Text>
                </View>

              </>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel, { borderColor: colors.border }]}
                onPress={() => setShowPaymentSummary(false)}
                activeOpacity={0.8}
              >
                <Text style={[styles.modalBtnCancelText, { color: '#000000', ...font.semiBold }]}>{t('project_details.cancel')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnConfirm, isConfirming && styles.completeBtnDisabled]}
                onPress={handleConfirmComplete}
                disabled={isConfirming}
                activeOpacity={0.8}
              >
                {isConfirming ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={[styles.modalBtnConfirmText, { ...font.bold }]}>{t('project_details.confirm_complete')}</Text>
                )}
              </TouchableOpacity>
            </View>

          </View>
        </View>
      </Modal>

      {/* Payment Request Modal */}
      <Modal
        visible={showPaymentRequestModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPaymentRequestModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.modalSheet, { backgroundColor: colors.card, maxHeight: '85%' }]}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={[styles.modalTitle, { color: '#000000', textAlign: rtl ? 'right' : 'left', ...font.bold }]}>
              {t('project_details.request_payment_update')}
            </Text>

            {selectedPrice && (
              <>
                <View style={styles.requestModalInfoRow}>
                  <Text style={[styles.requestModalLabel, { color: '#00000099', textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>
                    {t('project_details.professional')}
                  </Text>
                  <Text style={[styles.requestModalValue, { color: '#000000', textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>
                    {memberUsers[selectedPrice.professionalId]?.displayName ?? selectedPrice.professionalId}
                  </Text>
                </View>
                <View style={styles.requestModalInfoRow}>
                  <Text style={[styles.requestModalLabel, { color: '#00000099', textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>
                    {t('project_details.current_amount')}
                  </Text>
                  <Text style={[styles.requestModalValue, { color: '#000000', textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>
                    ₪{selectedPrice.currentAmount.toLocaleString()}
                  </Text>
                </View>
              </>
            )}

            <Text style={[styles.missionInputLabel, { color: '#00000099', textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>
              {t('project_details.proposed_amount')}
            </Text>
            <TextInput
              style={[styles.missionInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: '#000000', textAlign: rtl ? 'right' : 'left', ...font.regular }]}
              value={proposedAmount}
              onChangeText={setProposedAmount}
              placeholder={t('project_details.enter_amount')}
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
            />

            <Text style={[styles.missionInputLabel, { color: '#00000099', textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>
              {t('project_details.note_optional')}
            </Text>
            <TextInput
              style={[styles.missionInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: '#000000', textAlign: rtl ? 'right' : 'left', ...font.regular }]}
              value={requestNote}
              onChangeText={setRequestNote}
              placeholder={t('project_details.reason_placeholder')}
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={2}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel, { borderColor: colors.border }]}
                onPress={() => setShowPaymentRequestModal(false)}
                activeOpacity={0.8}
              >
                <Text style={[styles.modalBtnCancelText, { color: '#000000', ...font.semiBold }]}>{t('project_details.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  styles.modalBtnConfirm,
                  { backgroundColor: modeAccent },
                  (isSendingRequest || !proposedAmount.trim() || parseFloat(proposedAmount) <= 0) && styles.completeBtnDisabled,
                ]}
                onPress={handleSendPaymentRequest}
                disabled={isSendingRequest || !proposedAmount.trim() || parseFloat(proposedAmount) <= 0}
                activeOpacity={0.8}
              >
                {isSendingRequest ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={[styles.modalBtnConfirmText, { ...font.bold }]}>{t('project_details.send_request')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <RolePickerModal
        visible={showRolePicker}
        onDismiss={() => setShowRolePicker(false)}
        onPost={handlePostRoles}
        isPosting={isPostingRoles}
      />

      <ReviewFlow
        visible={showReviewFlow}
        projectId={projectId ?? ''}
        clientId={currentUserId}
        clientDisplayName={auth.currentUser?.displayName ?? clientUser?.displayName ?? ''}
        professionals={reviewProfessionals}
        onComplete={handleReviewsComplete}
      />

      <Modal visible={reportVisible} transparent animationType="fade" onRequestClose={closeReport}>
        {/* Marketplace-filter shell: plain overlay View, absolute-fill dismiss
            layer BEHIND a centred white card. The card must not be nested inside
            a touchable — `width: '100%'` would resolve against a content-sized
            parent and collapse. */}
        <View style={styles.reportBackdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeReport} />
          <View style={styles.reportSheet}>
            <View style={[styles.reportHeader, { flexDirection: rowDirection }]}>
              <AppText weight="bold" style={[styles.reportTitle, { textAlign: rtl ? 'right' : 'left' }]}>{t('report.title')}</AppText>
              <TouchableOpacity onPress={closeReport} hitSlop={8} activeOpacity={0.7}>
                <AppText weight="regular" style={{ color: '#000000', fontSize: 20 }}>✕</AppText>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.reportScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <AppText weight="regular" style={[styles.reportSubtitle, { textAlign: rtl ? 'right' : 'left' }]}>
              {t('report.reporting', { name: reportedUserName })}
            </AppText>
            <AppText weight="semiBold" style={[styles.reportLabel, { textAlign: rtl ? 'right' : 'left' }]}>
              {t('report.reason_label')}
            </AppText>
            <TextInput
              style={[styles.reportInput, { ...font.regular, textAlign: rtl ? 'right' : 'left' }]}
              multiline
              value={reportReason}
              onChangeText={setReportReason}
              placeholder={t('report.reason_placeholder')}
              placeholderTextColor="#00000066"
              textAlignVertical="top"
            />
            {reportReason.length > 0 && reportReason.length < 20 && (
              <AppText weight="regular" style={[styles.reportHint, { textAlign: rtl ? 'right' : 'left' }]}>
                {t('report.min_chars')}
              </AppText>
            )}

            {/* Evidence screenshots (optional) */}
            <TouchableOpacity
              style={[styles.reportEvidenceBtn, { flexDirection: rowDirection, opacity: reportEvidence.length >= MAX_EVIDENCE ? 0.4 : 1 }]}
              onPress={pickEvidence}
              disabled={reportEvidence.length >= MAX_EVIDENCE}
              activeOpacity={0.7}
            >
              <AppText weight="semiBold" style={styles.reportEvidenceBtnText}>{t('report.add_evidence')}</AppText>
            </TouchableOpacity>
            {reportEvidence.length > 0 && (
              <View style={styles.reportThumbRow}>
                {reportEvidence.map((uri, idx) => (
                  <View key={idx} style={styles.reportThumbWrap}>
                    <Image source={{ uri }} style={styles.reportThumb} resizeMode="cover" />
                    <TouchableOpacity style={styles.reportThumbRemove} onPress={() => removeEvidence(idx)} hitSlop={4} activeOpacity={0.8}>
                      <AppText weight="bold" style={{ color: '#fff', fontSize: 11 }}>✕</AppText>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            </ScrollView>
            <TouchableOpacity
              style={[styles.reportSubmitBtn, { backgroundColor: modeAccent, opacity: reportReason.trim().length >= 20 && !reportSubmitting ? 1 : 0.45 }]}
              onPress={submitReport}
              disabled={reportReason.trim().length < 20 || reportSubmitting}
              activeOpacity={0.8}
            >
              {reportSubmitting
                ? <ActivityIndicator size="small" color="#ffffff" />
                : <AppText weight="bold" style={styles.reportSubmitText}>{t('report.submit')}</AppText>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}


function MemberRow({
  displayName,
  photoURL,
  roles,
  badge,
  rtl,
  isPendingRemoval = false,
  isRemoving = false,
  onRemove,
  onReport,
  payment,
  onUpdate,
  engagementStatus,
  onContest,
  contestWindowEndsAt,
}: {
  displayName: string;
  photoURL: string | null;
  roles: string[];
  badge?: string;
  rtl: boolean;
  isPendingRemoval?: boolean;
  isRemoving?: boolean;
  onRemove?: () => void;
  onReport?: () => void;
  payment?: { price: number; hasBundle: boolean; individualOffer: PriceOffer | null; bundleId: string | null };
  onUpdate?: () => void;
  /** THIS engagement's status. Absent on every row but the viewing
   *  professional's own — the client must never see it (spec §6). */
  engagementStatus?: ProjectFee['engagementStatus'];
  /** Opens the contest sheet. Same scoping, and only inside the window that ends
   *  when the fee is charged. */
  onContest?: () => void;
  /** When that window closes, in ms. Read from the engagement's own `chargeDueAt`
   *  — the field the server enforces against — so the deadline shown is the
   *  deadline applied. Same scoping again. */
  contestWindowEndsAt?: number;
}) {
  const { accent: modeAccent } = useModeAccent();
  const font = useAppFont();
  const language = useSettingsStore((s) => s.language);
  const lang: 'he' | 'en' = language === 'he' ? 'he' : 'en';
  const t = makeT(language === 'he' ? he : en);
  const rowDir: 'row' | 'row-reverse' = rtl ? 'row-reverse' : 'row';
  const isClient = badge !== undefined;
  const canUpdate = !!onUpdate && (!!payment?.individualOffer || !!payment?.bundleId);
  const canContest = !!onContest;
  const awaitingClient = engagementStatus === 'end_requested_by_pro';
  const isEngagementDone = engagementStatus === 'completed';
  const isContested = engagementStatus === 'disputed';
  // Report lives in the action bar, under the separator line, so it keeps the bar
  // alive on its own (the client's view of a professional often has nothing else).
  // A card with no action and no report still renders no bar and no line.
  const showActions = canUpdate || canContest || awaitingClient
    || isEngagementDone || isContested || !!onRemove || isPendingRemoval || !!onReport;
  return (
    <View style={styles.memberCard}>
      {/* Top row: avatar + name/role + price */}
      <View style={[styles.memberTopRow, { flexDirection: rowDir }]}>
        {photoURL ? (
          <Image source={{ uri: photoURL }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: modeAccent }]}>
            <AppText weight="bold" style={styles.avatarInitial}>{displayName.charAt(0).toUpperCase()}</AppText>
          </View>
        )}

        <View style={{ flex: 1, gap: 3 }}>
          <View style={[styles.memberNameRow, { flexDirection: rowDir }]}>
            <AppText weight="bold" style={[styles.memberName, { textAlign: rtl ? 'right' : 'left' }]}>{displayName}</AppText>
            {badge !== undefined && (
              <View style={[styles.clientBadge, { backgroundColor: modeAccent }]}>
                <AppText weight="bold" style={styles.clientBadgeText}>{badge}</AppText>
              </View>
            )}
          </View>
          {isClient ? (
            <AppText weight="regular" numberOfLines={1} style={[styles.memberSubtitle, { textAlign: rtl ? 'right' : 'left' }]}>
              {roles.map((r) => categoryLabel(r, lang)).join(' · ')}
            </AppText>
          ) : (
            <View style={[styles.rolePillsRow, { flexDirection: rowDir }]}>
              {roles.map((r) => (
                <View key={r} style={styles.rolePill}>
                  <AppText weight="regular" style={styles.rolePillText}>{categoryLabel(r, lang)}</AppText>
                </View>
              ))}
            </View>
          )}
        </View>

        {payment !== undefined && (
          <View style={{ alignItems: rtl ? 'flex-start' : 'flex-end', gap: 2 }}>
            <View style={[styles.memberPriceGroup, { flexDirection: rowDir }]}>
              <AppText weight="bold" style={styles.memberPrice}>₪{payment.price.toLocaleString()}</AppText>
              {payment.hasBundle && (
                <View style={styles.bundlePayBadge}>
                  <AppText weight="bold" style={styles.bundlePayBadgeText}>{t('offers.bundle_badge')}</AppText>
                </View>
              )}
            </View>
          </View>
        )}

      </View>

      {/* Action bar */}
      {showActions && (
        <View style={[styles.memberActionBar, { flexDirection: rowDir }]}>
          {/* The professional's own engagement state, only ever on their own row.
              The action that ends it ("finish my part") is the full-width button
              in the bottom bar, like the client's close-project button. */}
          {awaitingClient ? (
            <View style={styles.engagementChip}>
              <AppText weight="semiBold" style={styles.engagementChipText}>
                {t('engagement.awaiting_client')}
              </AppText>
            </View>
          ) : isContested ? (
            <View style={styles.engagementContestedChip}>
              <AppText weight="semiBold" style={styles.engagementContestedText}>
                {t('engagement.contest_open')}
              </AppText>
            </View>
          ) : isEngagementDone ? (
            <View style={styles.engagementDoneChip}>
              <AppText weight="semiBold" style={styles.engagementDoneText}>
                {t('project_details.completed')}
              </AppText>
            </View>
          ) : null}
          {/* Beside the done chip, not instead of it: the engagement IS complete
              and the contest does not undo that — it only puts the fee in front
              of a human before it is charged. */}
          {canContest && (
            <TouchableOpacity style={styles.contestPill} onPress={onContest} activeOpacity={0.85}>
              <AppText weight="semiBold" style={styles.contestPillText}>
                {t('engagement.contest')}
              </AppText>
            </TouchableOpacity>
          )}
          {canUpdate && (
            <TouchableOpacity style={[styles.updatePill, { backgroundColor: modeAccent }]} onPress={() => onUpdate!()} activeOpacity={0.85}>
              <Pencil size={13} color="#ffffff" strokeWidth={2.2} />
              <AppText weight="semiBold" style={styles.updatePillText}>{t('project_details.update')}</AppText>
            </TouchableOpacity>
          )}
          {isPendingRemoval ? (
            <View style={styles.pendingRemovalChip}>
              <AppText weight="semiBold" style={styles.pendingRemovalText}>{t('project_details.pending_removal')}</AppText>
            </View>
          ) : onRemove ? (
            <TouchableOpacity style={styles.removePill} onPress={onRemove} disabled={isRemoving} activeOpacity={0.85}>
              {isRemoving ? (
                <ActivityIndicator size="small" color="#e05656" />
              ) : (
                <>
                  <Trash2 size={13} color="#e05656" strokeWidth={2.2} />
                  <AppText weight="semiBold" style={styles.removePillText}>{t('project_details.remove_member')}</AppText>
                </>
              )}
            </TouchableOpacity>
          ) : null}

          {/* Report, under the separator line, pushed to the far end of the row:
              left in Hebrew (row-reverse), right in English. */}
          {onReport && (
            <TouchableOpacity
              onPress={onReport}
              hitSlop={6}
              activeOpacity={0.7}
              style={[styles.reportSquare, { alignSelf: 'center', [rtl ? 'marginRight' : 'marginLeft']: 'auto' }]}
              accessibilityRole="button"
              testID="member-report"
            >
              <Flag size={15} color={modeAccent} strokeWidth={1.9} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* The deadline, spelled out rather than left to be inferred from a button
          that will quietly stop appearing. It is the engagement's own
          `chargeDueAt` — the same value the callable refuses past — so what the
          row promises and what the server allows cannot drift apart. */}
      {canContest && contestWindowEndsAt !== undefined && (
        <AppText
          weight="regular"
          style={[styles.contestWindow, { textAlign: rtl ? 'right' : 'left' }]}
        >
          {t('engagement.contest_window', {
            date: new Date(contestWindowEndsAt).toLocaleDateString(
              lang === 'he' ? 'he-IL' : 'en-US',
              { day: 'numeric', month: 'short' },
            ),
          })}
        </AppText>
      )}
    </View>
  );
}

/** Raising an issue is the one destructive-feeling action here; soft red marks
 *  it without borrowing the removal palette's weight. */
const DISPUTE_RED = '#b4453c';

/** The engagement pill's green. Distinct from the pay pill's blue and the
 *  removal red: finishing your own part is neither a payment nor a loss. */
const COMPLETE_GREEN = '#2f8f62';

const CARD_SHADOW = {
  shadowColor: '#1e4fa3' as const,
  shadowOpacity: 0.06,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 3,
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 16 },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: HEADER_TOP,
    paddingBottom: 20,
    paddingHorizontal: 8,
  },
  headerBack: { width: 40, alignItems: 'center', justifyContent: 'center', paddingTop: 4 },
  headerBackText: { fontSize: 36, lineHeight: 44 },
  headerRight: { width: 40 },
  headerCenter: { flex: 1, alignItems: 'center', gap: 4 },
  headerLabel: {
    fontSize: 11,
    color: '#000000',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  headerProjectTitle: {
    fontSize: 20,
    color: '#000000',
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 26,
  },

  content: { padding: 16, gap: 14, paddingBottom: 100 },

  // ── Status badge ─────────────────────────────────────────────────────────────
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontWeight: '700' },

  // ── Three meta cards ─────────────────────────────────────────────────────────
  metaCardsRow: { flexDirection: 'row', gap: 10 },
  metaCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(30,79,163,0.07)',
    ...CARD_SHADOW,
  },
  editDeadlineBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0,74,173,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaCardLabel: {
    fontSize: 10,
    color: '#000000',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  metaCardValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000000',
    textAlign: 'center',
  },

  // ── Description card ─────────────────────────────────────────────────────────
  descriptionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(30,79,163,0.07)',
    ...CARD_SHADOW,
  },
  descriptionText: { fontSize: 14, lineHeight: 20, color: '#000000' },

  // ── Section headers ───────────────────────────────────────────────────────────
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  sectionTitleGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#000000' },
  sectionCount: { fontSize: 13, color: '#000000' },
  addPill: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  addPillText: { fontSize: 13, color: '#FFFFFF' },
  addButtonText: { fontSize: 14, fontWeight: '600', color: '#000000' },
  emptyNote: { fontSize: 14, fontStyle: 'italic', color: '#000000', textAlign: 'center' },

  // ── Member cards ──────────────────────────────────────────────────────────────
  memberCard: {
    padding: 13,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(30,79,163,0.07)',
    ...CARD_SHADOW,
  },
  memberTopRow: { alignItems: 'center', gap: 12 },
  memberActionBar: {
    // WRAPS. The professional's own row can carry four pills at once — mark
    // complete, contest, pay and update — and on a narrow screen in Hebrew that
    // ran off the edge and squeezed every label. Shorter labels alone only
    // postpone it: the COUNT is what varies, and a longer translation or a larger
    // font setting brings the overflow straight back. rowGap keeps a wrapped
    // second line off the first.
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    rowGap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f1f7',
  },
  memberSubtitle: { fontSize: 12, color: '#000000' },
  updatePill: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 15,
    paddingVertical: 7,
    borderRadius: 10,
  },
  updatePillText: { fontSize: 13, color: '#ffffff' },
  removePill: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#fdecec',
    paddingHorizontal: 15,
    paddingVertical: 7,
    borderRadius: 10,
  },
  removePillText: { fontSize: 13, color: '#e05656' },
  // alignSelf pins it to the card's top corner rather than letting the row's
  // alignItems:'center' float it against the 48px avatar.
  reportSquare: { width: 32, height: 32, borderRadius: 9, backgroundColor: '#f4f5f9', alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#fff', fontSize: 18, fontWeight: '700' },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  memberName: { fontSize: 15, fontWeight: '600', color: '#000000' },
  rolePillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  rolePill: {
    backgroundColor: '#f0f0f7',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  rolePillText: { fontSize: 12, color: '#000000' },
  memberPriceGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  engagementChip: {
    backgroundColor: 'rgba(30,79,163,0.08)', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  engagementChipText: { color: '#000000', fontSize: 11 },
  engagementDoneChip: {
    backgroundColor: 'rgba(47,143,98,0.11)', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  engagementDoneText: { color: COMPLETE_GREEN, fontSize: 11 },
  engagementContestedChip: {
    backgroundColor: 'rgba(180,69,60,0.1)', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  engagementContestedText: { color: DISPUTE_RED, fontSize: 11 },
  // Outlined rather than filled: raising an issue is a quieter act than the two
  // filled pills beside it, and must not compete with them for the tap.
  contestPill: {
    flexShrink: 0,
    borderWidth: 1, borderColor: DISPUTE_RED, borderRadius: 10,
    paddingHorizontal: 15, paddingVertical: 6,
  },
  contestPillText: { fontSize: 13, color: DISPUTE_RED },
  contestWindow: { fontSize: 11, color: '#000000', paddingHorizontal: 14, paddingBottom: 10 },
  dateConsequence: { fontSize: 12, color: '#000000', lineHeight: 17, paddingHorizontal: 4 },
  closeNowBody: { fontSize: 13, color: '#00000099', lineHeight: 19, marginBottom: 4 },
  /** Amber, as in the builder: "no end date" is the answer with a consequence
   *  worth noticing, not the neutral one. */
  dateConsequenceFlexible: { color: '#8a6100' },
  memberPrice: { fontSize: 16, fontWeight: '700', color: '#000000' },
  clientBadge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  clientBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  bundlePayBadge: { backgroundColor: '#cb6ce6', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  bundlePayBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },


  // ── Mission rows ──────────────────────────────────────────────────────────────
  missionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarStack: { flexDirection: 'row', alignItems: 'center' },
  stackAvatar: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: '#fff' },
  stackAvatarOverlap: { marginLeft: -8 },
  stackAvatarFallback: { alignItems: 'center', justifyContent: 'center' },
  stackAvatarMore: { backgroundColor: '#8890b0', alignItems: 'center', justifyContent: 'center' },
  stackAvatarInitial: { color: '#fff', fontSize: 9, fontWeight: '700' },
  missionTitleCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 10,
    alignItems: 'flex-start',
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(30,79,163,0.07)',
    ...CARD_SHADOW,
  },
  missionTitle: { fontSize: 14, color: '#000000', lineHeight: 18 },
  missionDueRow: { alignItems: 'center', gap: 4 },
  missionDue: { fontSize: 11, color: '#000000' },
  missionDonePill: {
    backgroundColor: 'rgba(28,157,99,0.1)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 72,
    alignItems: 'center',
  },
  missionDonePillText: { fontSize: 11, color: '#1c9d63' },
  missionActivePill: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 72,
    alignItems: 'center',
    borderWidth: 1.5,
    ...CARD_SHADOW,
  },
  missionActivePillText: { fontSize: 11 },

  // ── Meeting rows ──────────────────────────────────────────────────────────────
  meetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  meetingDateBlock: {
    width: 44,
    height: 52,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    backgroundColor: '#ffffff',
    ...CARD_SHADOW,
  },
  meetingDateMonth: { fontSize: 10, textTransform: 'uppercase' },
  meetingDateDay: { fontSize: 20, lineHeight: 24 },

  // ── Carousel shared ───────────────────────────────────────────────────────────
  carouselCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    gap: 10,
    shadowColor: '#1e4fa3',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  carouselCardInfo: {
    flex: 1,
    gap: 6,
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#eef0f6',
    alignSelf: 'stretch',
  },
  descPanel: {
    backgroundColor: '#f5f6fb',
    borderRadius: 12,
    padding: 12,
    marginTop: 6,
  },
  descText: {
    fontSize: 14,
    color: '#000000',
    lineHeight: 20,
  },
  detailHeaderRow: {
    alignItems: 'center',
    gap: 10,
  },
  detailLabel: {
    fontSize: 12,
    color: '#000000',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 15,
    color: '#000000',
  },
  detailInlineRow: {
    gap: 12,
  },
  carouselNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginTop: 6,
  },
  carouselNavBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(30,79,163,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  carouselCounter: {
    fontSize: 13,
    color: '#000000',
    minWidth: 40,
    textAlign: 'center',
  },
  carouselStatusPill: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 64,
    alignItems: 'center',
    backgroundColor: '#ffffff',
    flexShrink: 0,
  },
  carouselStatusDone: {
    backgroundColor: 'rgba(28,157,99,0.1)',
  },
  carouselStatusText: {
    fontSize: 11,
    textAlign: 'center',
  },
  carouselStatusCol: {
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  missionTrashBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(224,75,75,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  missionDatesRow: {
    alignSelf: 'stretch',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  // ── Mission modal inputs ───────────────────────────────────────────────────────
  missionInputLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 4,
  },
  missionInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  missionAssignName: { fontSize: 14, fontWeight: '500', flex: 1 },

  // ── Complete bar ──────────────────────────────────────────────────────────────
  completeBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: BOTTOM_BAR_PAD,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  completeBtn: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  completeBtnDisabled: { opacity: 0.6 },
  completeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  completedBadge: {
    backgroundColor: '#22c55e22',
    borderWidth: 1,
    borderColor: '#22c55e',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  completedBadgeText: { color: '#16a34a', fontSize: 16, fontWeight: '700' },
  // Outlined, not filled: raising an issue is a secondary action next to the
  // project's primary flow, and it must not read as "undo completion".

  // ── Modals ─────────────────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
  },
  // ── Add sheets (meeting / task) share the detail sheets' language ───────
  sheetFieldLabel: { fontSize: 11.5, color: '#000000', marginBottom: 6 },
  sheetInput: {
    backgroundColor: '#F8F6FC',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 14,
    color: '#1A1626',
  },
  sheetInputMultiline: { minHeight: 76, textAlignVertical: 'top' },
  /** Picker row (date / time): the detail sheets' row, made tappable. */
  sheetPickRow: { alignItems: 'center', gap: 11, paddingVertical: 11 },
  /** Dates and hours are outlined in the mode's colour, on both sheet kinds. */
  sheetOutlined: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12 },
  sheetPickValue: { flex: 1, fontSize: 14, fontWeight: '600', color: '#1A1626' },
  sheetPickPlaceholder: { flex: 1, fontSize: 14, color: '#8B8898' },
  sheetPickClear: { fontSize: 13, color: '#8B8898', paddingHorizontal: 4 },
  /** One selectable member. */
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
  sheetPrimaryBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetPrimaryText: { fontSize: 14.5, fontWeight: '700', color: '#FFFFFF' },
  sheetSecondaryBtn: { flex: 1 },

  // ── Detail sheets (meeting / task) ──────────────────────────────────────
  sheetHeader: { alignItems: 'flex-start', gap: 11 },
  sheetTile: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  sheetTitleCol: { flex: 1, gap: 6 },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: '#000000', letterSpacing: -0.2, lineHeight: 26 },
  sheetBadgeRow: { alignItems: 'center' },
  sheetBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  sheetBadgeText: { fontSize: 10, fontWeight: '600' },
  sheetTrashBtn: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: '#FDECEC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: '#F1EFF7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** flexShrink so the body scrolls inside the sheet instead of growing it. */
  sheetBody: { flexShrink: 1 },
  sheetBodyContent: { gap: 14 },
  sheetDescPanel: { backgroundColor: '#F8F6FC', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 },
  sheetDescText: { fontSize: 13.5, color: '#4C4859', lineHeight: 21 },
  sheetRow: { alignItems: 'center', gap: 11, paddingVertical: 11 },
  sheetRowTile: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#F3EEFE', alignItems: 'center', justifyContent: 'center' },
  sheetRowCol: { flex: 1, gap: 3 },
  sheetRowLabel: { fontSize: 11.5, color: '#000000' },
  sheetRowValue: { fontSize: 14, fontWeight: '600', color: '#1A1626', lineHeight: 20 },
  sheetRowDivider: { height: 1, backgroundColor: '#F2F0F7' },
  sheetChipsWrap: { flexWrap: 'wrap', gap: 6, marginTop: 2 },
  sheetChip: {
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F4F2F9',
    borderRadius: 999,
    paddingVertical: 3,
    paddingStart: 4,
    paddingEnd: 11,
    maxWidth: '100%',
  },
  sheetChipAvatar: { width: 20, height: 20, borderRadius: 999 },
  sheetChipAvatarFallback: { backgroundColor: '#EDE4FB', alignItems: 'center', justifyContent: 'center' },
  sheetChipInitial: { fontSize: 10, color: '#6D28D9' },
  sheetChipName: { fontSize: 12.5, fontWeight: '500', color: '#4C4859', flexShrink: 1 },
  sheetDismissBtn: {
    height: 48,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDD7EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetDismissText: { fontSize: 14.5, fontWeight: '600', color: '#4C1D95' },

  /** Centred card — the same shape as the marketplace filter popup. */
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 4 },
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  feeName: { fontSize: 15, fontWeight: '600' },
  feeLabel: { fontSize: 14, fontWeight: '500' },
  feeAmount: { fontSize: 15, fontWeight: '500' },
  feeAmountBold: { fontSize: 15, fontWeight: '700' },
  modalSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 4,
    marginBottom: 2,
  },
  requestModalInfoRow: { gap: 2 },
  requestModalLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  requestModalValue: { fontSize: 16, fontWeight: '600' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  modalBtnCancel: { borderWidth: 1 },
  modalBtnCancelText: { fontSize: 15, fontWeight: '600' },
  modalBtnConfirm: {},
  modalBtnConfirmText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // ── Removal banner ────────────────────────────────────────────────────────────
  removalBanner: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    alignItems: 'center',
    marginBottom: 4,
  },
  removalBannerText: { fontSize: 14, lineHeight: 20, color: '#991b1b', flex: 1 },
  removalAcceptBtn: {
    backgroundColor: '#ef4444',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 9,
    alignItems: 'center',
  },
  removalAcceptBtnBusy: { opacity: 0.7 },
  removalAcceptText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // ── Pending removal chip & remove button ──────────────────────────────────────
  pendingRemovalChip: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pendingRemovalText: { color: '#ef4444', fontSize: 11, fontWeight: '600' },
  // ── Pending payment request cards ─────────────────────────────────────────────
  // The memberCard idiom, so these read as the page's own cards: same radius,
  // padding, hairline border and shadow. They were radius 12 with no shadow and
  // an amber border, which made them look pasted in from another screen.
  pendingRequestCard: {
    padding: 13,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(30,79,163,0.07)',
    gap: 8,
    ...CARD_SHADOW,
  },
  /** Incoming requests still need to stand out — but in the page's blue, as a
   *  left/right accent rather than a full amber outline. */
  pendingRequestCardIncoming: { borderColor: 'rgba(30,79,163,0.28)' },
  pendingRequestText: { fontSize: 14, lineHeight: 20, color: '#000000' },
  pendingRequestBold: { fontWeight: '700' },
  pendingRequestNote: { fontSize: 13, fontStyle: 'italic', color: '#000000' },
  pendingRequestActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  pendingActionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
  },
  // Accept is the page's solid blue; reject borrows removePill's soft red.
  // The raw #22c55e / #ef4444 pair appeared nowhere else on this page.
  pendingActionAccept: {},
  pendingActionReject: { backgroundColor: '#fdecec' },
  pendingActionBtnText: { fontSize: 13, fontWeight: '700' },
  pendingActionAcceptText: { color: '#ffffff' },
  pendingActionRejectText: { color: '#e05656' },
  pendingOutgoingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  // Same shape as pendingRemovalChip, the page's other "waiting" marker, in blue
  // rather than the grey that matched nothing here.
  pendingBadge: {
    backgroundColor: 'rgba(30,79,163,0.10)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pendingBadgeText: { color: '#000000', fontSize: 11, fontWeight: '600' },

  bottomPad: { height: 32 },

  // ── Report modal ──────────────────────────────────────────────────────────────
  // Matches the marketplace filter popup: white card, radius 24, maxWidth 440,
  // maxHeight 85%, 20/20/24 padding, soft shadow, black title.
  reportBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  reportSheet: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '85%',
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 20,
  },
  /** flexShrink, not flex:1 — the card is auto-height capped at maxHeight. */
  reportScroll: { flexShrink: 1 },
  reportHeader: { alignItems: 'center', justifyContent: 'space-between' },
  reportTitle: { flex: 1, color: '#000000', fontSize: 18 },
  reportSubtitle: { color: '#000000', fontSize: 14 },
  reportLabel: { color: '#000000', fontSize: 14 },
  reportInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(0,74,173,0.15)',
    borderRadius: 10,
    padding: 12,
    color: '#000000',
    height: 120,
    textAlignVertical: 'top',
  },
  reportHint: { color: '#000000', fontSize: 12 },
  reportSubmitBtn: { borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  reportSubmitText: { color: '#ffffff', fontSize: 15 },
  reportEvidenceBtn: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(0,74,173,0.2)', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, marginTop: 12, marginBottom: 12, gap: 6 },
  reportEvidenceBtnText: { color: '#000000', fontSize: 14 },
  reportThumbRow: { flexDirection: 'row', gap: 10, marginBottom: 16, flexWrap: 'wrap' },
  reportThumbWrap: { position: 'relative' },
  reportThumb: { width: 72, height: 72, borderRadius: 8 },
  reportThumbRemove: { position: 'absolute', top: -6, right: -6, backgroundColor: '#ff4d6d', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
});
