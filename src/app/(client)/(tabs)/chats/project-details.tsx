import { useEffect, useState } from 'react';
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
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { doc, updateDoc, arrayUnion, serverTimestamp, addDoc, collection } from 'firebase/firestore';
import { db } from '@core/firebase/config';
import { getDocument, queryDocuments, where } from '@core/firebase/firestore';
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
  markProjectComplete,
  listenToPaymentRequests,
  createPaymentRequest,
  respondToPaymentRequest,
  type ProjectFee,
} from '@features/chat/services/paymentService';
import {
  listenToMissions,
  addMission,
  updateMissionStatus,
  deleteMission,
} from '@features/chat/services/missionService';
import {
  listenToMeetings,
  addMeeting,
} from '@features/chat/services/meetingService';
import { MiniCalendar, MiniTimePicker, RolePickerModal } from '@features/crew/components';
import { categoryLabel } from '@features/crew/data/categories';
import { ReviewFlow, type ReviewProfessional } from '@features/reviews/components/ReviewFlow';
import { requestRemoval, acceptRemoval, listenToRemovalRequests } from '@features/chat/services/removalService';
import { sendMessage } from '@features/chat/services/chatService';
import { Calendar, CalendarDays, ChevronLeft, ChevronRight, Clapperboard, Clock, Flag, MapPin, Pencil, Trash2 } from 'lucide-react-native';
import { AppText } from '@components/ui/AppText';

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

const MISSION_STATUS_CONFIG: Record<MissionStatus, { color: string }> = {
  todo:        { color: '#6b7280' },
  in_progress: { color: '#f59e0b' },
  done:        { color: '#22c55e' },
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

const STATUS_COLORS: Record<ProjectRequest['status'], string> = {
  open: '#1c9d63',
  in_progress: '#3b82f6',
  completed: '#8b5cf6',
  cancelled: '#ef4444',
};

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(2);
  return `${dd}/${mm}/${yy}`;
}

export default function ProjectDetailsScreen() {
  const { projectId, chatId: chatIdParam } = useLocalSearchParams<{ projectId: string; chatId: string }>();
  const router = useRouter();
  const colors = useTheme();
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
  const [feeData, setFeeData] = useState<ProjectFee | null>(null);
  const [isCalculatingFee, setIsCalculatingFee] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
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
      await updateDoc(doc(db, 'projects', projectId), { deadline: iso });
      setProject((prev) => (prev ? { ...prev, deadline: iso } : prev));
    } catch (err) {
      console.error('[ProjectDetails] edit deadline failed:', err);
    }
  }

  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>([]);
  const [showPaymentRequestModal, setShowPaymentRequestModal] = useState(false);
  const [selectedPrice, setSelectedPrice] = useState<
    { professionalId: string; currentAmount: number; bundleId?: string } | null
  >(null);
  const [proposedAmount, setProposedAmount] = useState('');
  const [requestNote, setRequestNote] = useState('');
  const [isSendingRequest, setIsSendingRequest] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  // Feature A: removal requests
  const [removalRequests, setRemovalRequests] = useState<RemovalRequest[]>([]);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Report user
  const [reportVisible, setReportVisible] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportedUserId, setReportedUserId] = useState('');
  const [reportedUserName, setReportedUserName] = useState('');

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

  useEffect(() => {
    if (!projectId) return;
    return listenToRemovalRequests(projectId, setRemovalRequests);
  }, [projectId]);

  async function handleMarkComplete() {
    if (!projectId) return;
    setIsCalculatingFee(true);
    try {
      const fee = await calculateProjectFee(projectId);
      setFeeData(fee);
      setShowPaymentSummary(true);
    } catch {
      Alert.alert('Error', t('project_details.error_payment'));
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
        await markProjectComplete(projectId);
        setProject((prev) => (prev ? { ...prev, status: 'completed' } : prev));
        setShowPaymentSummary(false);
        Alert.alert(t('project_details.success_complete'));
      } catch {
        Alert.alert('Error', t('project_details.error_complete'));
      } finally {
        setIsConfirming(false);
      }
      return;
    }

    // Mark complete and require reviews
    const uniqueProfIds = [...new Set((project.filledSlots ?? []).map((s) => s.professionalId))];
    console.log('[ReviewFlow] uniqueProfIds:', uniqueProfIds);
    setIsConfirming(true);
    try {
      await updateDoc(doc(db, 'projects', projectId), {
        status: 'completed',
        completedAt: serverTimestamp(),
        reviewsCompleted: false,
        reviewsPending: uniqueProfIds,
      });
      console.log('[ReviewFlow] Firestore updated — setting showReviewFlow=true');
      setProject((prev) =>
        prev
          ? { ...prev, status: 'completed', reviewsCompleted: false, reviewsPending: uniqueProfIds }
          : prev,
      );
      setShowPaymentSummary(false);
      setShowReviewFlow(true);
    } catch (err) {
      console.error('[ReviewFlow] updateDoc failed:', err);
      Alert.alert('Error', t('project_details.error_complete'));
    } finally {
      setIsConfirming(false);
    }
  }

  function handleReviewsComplete() {
    setShowReviewFlow(false);
    setProject((prev) => (prev ? { ...prev, reviewsCompleted: true } : prev));
    Alert.alert(t('project_details.success_complete'));
  }

  async function handleSendPaymentRequest() {
    if (!projectId || !selectedPrice) return;
    const currentUserId = auth.currentUser?.uid;
    if (!currentUserId) return;
    const parsed = parseFloat(proposedAmount);
    if (isNaN(parsed) || parsed <= 0) return;

    setIsSendingRequest(true);
    try {
      const isClient = project?.clientId === currentUserId;
      const toUserId = isClient ? selectedPrice.professionalId : (project?.clientId ?? '');
      // Name of the party who needs to accept the price change (the recipient).
      const toName = (isClient
        ? memberUsers[selectedPrice.professionalId]?.displayName
        : clientUser?.displayName) ?? '';
      await createPaymentRequest(projectId, {
        fromUserId: currentUserId,
        toUserId,
        professionalId: selectedPrice.professionalId,
        bundleId: selectedPrice.bundleId,
        currentAmount: selectedPrice.currentAmount,
        proposedAmount: parsed,
        note: requestNote.trim() || undefined,
      });
      // Post a chat notice (like a new mission/meeting) — no amounts, just a heads-up.
      if (project?.chatId) {
        try {
          // Sender name from the loaded member maps (auth.currentUser.displayName is
          // often empty — names live in Firestore, not the Firebase Auth profile).
          const fromName = (isClient
            ? clientUser?.displayName
            : memberUsers[currentUserId]?.displayName) ?? '';
          const parts: string[] = [];
          if (fromName) parts.push(`מאת ${fromName}`);
          if (toName) parts.push(`ממתין לאישור ${toName}`);
          const noticeText = parts.length
            ? `💰 בקשת שינוי מחיר: ${parts.join(' · ')}`
            : '💰 בקשת שינוי מחיר';
          await sendMessage(project.chatId, currentUserId, noticeText, { system: true });
        } catch { /* notice is non-critical; the request was already created */ }
      }
      setShowPaymentRequestModal(false);
      setSelectedPrice(null);
      setProposedAmount('');
      setRequestNote('');
    } catch {
      Alert.alert('Error', t('project_details.error_payment_request'));
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
    } catch {
      Alert.alert('Error', t('project_details.error_accept_reject', {
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
    } catch {
      Alert.alert('Error', t('project_details.error_remove'));
    } finally {
      setRemovingId(null);
    }
  }

  function closeReport() {
    setReportVisible(false);
    setReportReason('');
  }

  async function submitReport() {
    if (reportReason.trim().length < 20 || !currentUserId || !reportedUserId) return;
    setReportSubmitting(true);
    try {
      await addDoc(collection(db, 'reports'), {
        reporterId: currentUserId,
        reportedUserId,
        reportedUserName,
        reason: reportReason.trim(),
        evidenceURLs: [],
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      closeReport();
      showToast(t('report.success'), 'success');
    } catch {
      Alert.alert('Error', 'Failed to submit report. Please try again.');
    } finally {
      setReportSubmitting(false);
    }
  }

  async function handleAcceptRemoval() {
    if (!projectId || !project) return;
    const chatId = project.chatId;
    if (!chatId) return;
    try {
      const name = memberUsers[currentUserId]?.displayName ?? currentUserId;
      await acceptRemoval(
        projectId,
        chatId,
        currentUserId,
        project.filledSlots,
        t('project_details.member_left').replace('{{name}}', name),
      );
      router.back();
    } catch {
      Alert.alert('Error', t('project_details.error_accept_removal'));
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
        <ActivityIndicator size="large" color="#004aad" />
      </LinearGradient>
    );
  }

  if (!project) {
    return (
      <LinearGradient colors={colors.bgGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.centered}>
        <Stack.Screen options={{ headerShown: false, gestureEnabled: true, fullScreenGestureEnabled: true }} />
        <Text style={[styles.errorText, { color: '#004aad', textAlign: rtl ? 'right' : 'left', ...font.regular }]}>
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
    const meetingAt = new Date(`${date}T${time}`);
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
      !newMeetingTime.trim() ||
      !newMeetingLocation.trim() ||
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

  async function handleDeleteMission(mission: Mission) {
    if (!projectId) return;
    try {
      await deleteMission(projectId, mission.id);
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

  const statusColor = STATUS_COLORS[project.status];
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

  const removalMap = Object.fromEntries(
    removalRequests.map((r) => [r.professionalId, r.status]),
  );
  const myRemovalRequest = !isClient
    ? removalRequests.find((r) => r.professionalId === currentUserId && r.status === 'pending')
    : undefined;

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

      <ScrollView style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Header — scrolls with content; negative margins cancel contentContainerStyle padding */}
        <View style={[styles.header, { marginHorizontal: -16, marginTop: -16 }]}>
          <TouchableOpacity onPress={() => chatIdParam ? router.push(`/(client)/(tabs)/chats/${chatIdParam}` as never) : router.back()} style={styles.headerBack} activeOpacity={0.7}>
            <AppText weight="regular" style={styles.headerBackText}>{'‹'}</AppText>
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
              style={styles.removalAcceptBtn}
              onPress={handleAcceptRemoval}
              activeOpacity={0.8}
            >
              <Text style={[styles.removalAcceptText, { ...font.bold }]}>
                {t('project_details.accept_removal')}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Status badge — centered */}
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '22', borderColor: statusColor, flexDirection: rowDirection, alignSelf: 'center' }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor, ...font.bold }]}>{projectStatusLabel(project.status)}</Text>
        </View>

        {/* Three meta cards side-by-side */}
        <View style={[styles.metaCardsRow, { flexDirection: rowDirection }]}>
          <View style={styles.metaCard}>
            <Clapperboard size={16} color="#8890b0" strokeWidth={1.5} />
            <AppText weight="semiBold" style={styles.metaCardLabel}>{t('project_details.execution')}</AppText>
            <AppText weight="bold" style={styles.metaCardValue} numberOfLines={2}>{project.exec ? formatShortDate(project.exec) : t('project_details.tbd')}</AppText>
          </View>
          <TouchableOpacity
            style={styles.metaCard}
            activeOpacity={isProjectClient ? 0.7 : 1}
            onPress={isProjectClient ? () => setShowDeadlinePicker(true) : undefined}
            disabled={!isProjectClient}
          >
            <CalendarDays size={16} color="#8890b0" strokeWidth={1.5} />
            <AppText weight="semiBold" style={styles.metaCardLabel}>{t('project_details.deadline')}</AppText>
            <AppText weight="bold" style={styles.metaCardValue} numberOfLines={2}>
              {project.deadline === 'flexible' ? t('builder.flexible') : formatShortDate(project.deadline)}
            </AppText>
            {isProjectClient && (
              <View style={styles.editDeadlineBadge}>
                <Pencil size={10} color="#004aad" strokeWidth={2} />
              </View>
            )}
          </TouchableOpacity>
          <View style={styles.metaCard}>
            <MapPin size={16} color="#8890b0" strokeWidth={1.5} />
            <AppText weight="semiBold" style={styles.metaCardLabel}>{t('project_details.location')}</AppText>
            <AppText weight="bold" style={styles.metaCardValue} numberOfLines={2}>{project.location}</AppText>
          </View>
        </View>

        {/* Description card */}
        <View style={styles.descriptionCard}>
          <AppText weight="semiBold" style={styles.metaCardLabel}>{t('project_details.description')}</AppText>
          <AppText weight="regular" style={[styles.descriptionText, { textAlign: rtl ? 'right' : 'left' }]}>
            {project.description}
          </AppText>
        </View>

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
                <TouchableOpacity style={styles.addPill} onPress={() => setShowRolePicker(true)} activeOpacity={0.8}>
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
              onReport={professionalId !== currentUserId ? () => { setReportedUserId(professionalId); setReportedUserName(member?.displayName ?? professionalId); setReportVisible(true); } : undefined}
              payment={(isClient || professionalId === currentUserId) ? payment : undefined}
              onUpdate={(isClient || professionalId === currentUserId) && !isReadOnly && (payment?.individualOffer || payment?.bundleId)
                ? () => {
                    if (!payment) return;
                    setSelectedPrice(
                      payment.bundleId
                        ? { professionalId, currentAmount: payment.price, bundleId: payment.bundleId }
                        : { professionalId, currentAmount: payment.individualOffer?.price ?? payment.price },
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
          <View style={[styles.sectionHeaderRow, { flexDirection: rowDirection }]}>
            <View style={[styles.sectionTitleGroup, { flexDirection: rowDirection }]}>
              <AppText weight="bold" style={styles.sectionTitle}>{t('project_details.missions')}</AppText>
              {missions.length > 0 && (
                <AppText weight="regular" style={styles.sectionCount}>{missions.length}</AppText>
              )}
            </View>
            {(isClient || isTeamMember) && !isReadOnly && (
              <TouchableOpacity style={styles.addPill} onPress={() => setShowAddMission(true)} activeOpacity={0.8}>
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
              const cfg = MISSION_STATUS_CONFIG[mission.status] ?? { color: '#6b7280' };
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
                            <View key={id} style={[styles.stackAvatar, styles.stackAvatarFallback, idx > 0 && styles.stackAvatarOverlap]}>
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
                      {mission.title}
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
                            <Calendar size={12} color="#8890b0" strokeWidth={1.5} />
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
                            <CalendarDays size={12} color="#8890b0" strokeWidth={1.5} />
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
                        mission.status === 'done' ? styles.carouselStatusDone : { borderColor: cfg.color, borderWidth: 1.5 },
                        !isAssigned && { opacity: 0.5 },
                      ]}
                      onPress={isAssigned ? () => handleCycleMissionStatus(mission) : undefined}
                      activeOpacity={isAssigned ? 0.8 : 1}
                    >
                      <AppText weight="bold" style={[styles.carouselStatusText, { color: mission.status === 'done' ? '#1c9d63' : cfg.color }]}>
                        {mission.status === 'done' ? `✓ ${missionLabel(mission.status)}` : missionLabel(mission.status)}
                      </AppText>
                    </TouchableOpacity>
                    {mission.status === 'done' && (
                      <TouchableOpacity
                        style={styles.missionTrashBtn}
                        onPress={() => handleDeleteMission(mission)}
                        activeOpacity={0.7}
                      >
                        <Trash2 size={15} color="#e04b4b" strokeWidth={1.8} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                </TouchableOpacity>
              );
            })()}

            {missions.length > 1 && (
              <View style={styles.carouselNavRow}>
                <TouchableOpacity onPress={rtl ? nextMission : prevMission} style={styles.carouselNavBtn} activeOpacity={0.7}>
                  <ChevronLeft size={20} color="#1e4fa3" strokeWidth={2.5} />
                </TouchableOpacity>
                <AppText weight="semiBold" style={styles.carouselCounter}>
                  {Math.min(missionIndex, missions.length - 1) + 1} / {missions.length}
                </AppText>
                <TouchableOpacity onPress={rtl ? prevMission : nextMission} style={styles.carouselNavBtn} activeOpacity={0.7}>
                  <ChevronRight size={20} color="#1e4fa3" strokeWidth={2.5} />
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {/* SECTION 4 — Meetings */}
        {(() => (
          <View style={[styles.sectionHeaderRow, { flexDirection: rowDirection }]}>
            <View style={[styles.sectionTitleGroup, { flexDirection: rowDirection }]}>
              <AppText weight="bold" style={styles.sectionTitle}>{t('project_details.meetings')}</AppText>
              {meetings.length > 0 && (
                <AppText weight="regular" style={styles.sectionCount}>{meetings.length}</AppText>
              )}
            </View>
            {(isClient || isTeamMember) && !isReadOnly && (
              <TouchableOpacity style={styles.addPill} onPress={() => setShowAddMeeting(true)} activeOpacity={0.8}>
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
              const titleColor =
                urgency === 'past'     ? '#1c9d63' :
                urgency === 'imminent' ? '#ef4444' :
                urgency === 'soon'     ? '#f59e0b' :
                '#1e4fa3';
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
                            <View key={id} style={[styles.stackAvatar, styles.stackAvatarFallback, idx > 0 && styles.stackAvatarOverlap]}>
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
                    <AppText weight="semiBold" style={[styles.missionTitle, { textAlign: rtl ? 'right' : 'left', color: titleColor }]} numberOfLines={2}>
                      {meeting.title}
                    </AppText>
                    <View style={styles.cardDivider} />
                    <View style={[styles.missionDueRow, { flexDirection: rowDirection }]}>
                      <Clock size={12} color="#8890b0" strokeWidth={1.5} />
                      <AppText weight="regular" style={styles.missionDue}>{meeting.time}</AppText>
                    </View>
                    {!!meeting.location && (
                      <View style={[styles.missionDueRow, { flexDirection: rowDirection }]}>
                        <MapPin size={12} color="#8890b0" strokeWidth={1.5} />
                        <AppText weight="regular" style={styles.missionDue} numberOfLines={1}>{meeting.location}</AppText>
                      </View>
                    )}
                  </View>

                  {/* Date block — trailing (left in RTL) */}
                  <View style={[styles.meetingDateBlock, { borderColor: titleColor }]}>
                    <AppText weight="semiBold" style={[styles.meetingDateMonth, { color: titleColor }]}>{monthAbbr}</AppText>
                    <AppText weight="bold" style={[styles.meetingDateDay, { color: titleColor }]}>{day}</AppText>
                  </View>
                </View>
                </TouchableOpacity>
              );
            })()}

            {sortedMeetings.length > 1 && (
              <View style={styles.carouselNavRow}>
                <TouchableOpacity onPress={rtl ? nextMeeting : prevMeeting} style={styles.carouselNavBtn} activeOpacity={0.7}>
                  <ChevronLeft size={20} color="#1e4fa3" strokeWidth={2.5} />
                </TouchableOpacity>
                <AppText weight="semiBold" style={styles.carouselCounter}>
                  {Math.min(meetingIndex, sortedMeetings.length - 1) + 1} / {sortedMeetings.length}
                </AppText>
                <TouchableOpacity onPress={rtl ? prevMeeting : nextMeeting} style={styles.carouselNavBtn} activeOpacity={0.7}>
                  <ChevronRight size={20} color="#1e4fa3" strokeWidth={2.5} />
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {/* Pending payment-update requests */}
        {paymentRequests.length > 0 && (
          <>
            <AppText weight="bold" style={[styles.sectionTitle, { textAlign: rtl ? 'right' : 'left', marginTop: 8, marginBottom: 4 }]}>
              {t('project_details.price_requests')}
            </AppText>
            {incomingRequests.map((req) => {
              const fromName = allMemberNames[req.fromUserId] ?? req.fromUserId;
              const isResponding = respondingId === req.id;
              return (
                <View
                  key={req.id}
                  style={[styles.pendingRequestCard, { backgroundColor: '#ffffff', borderColor: '#f59e0b' }]}
                >
                  <Text style={[styles.pendingRequestText, { color: '#004aad', textAlign: rtl ? 'right' : 'left', ...font.regular }]}>
                    <Text style={[styles.pendingRequestBold, { ...font.bold }]}>{fromName}</Text>
                    {' ' + t('project_details.requests_to_change', {
                      from: req.currentAmount.toLocaleString(),
                      to: req.proposedAmount.toLocaleString(),
                    })}
                  </Text>
                  {req.note ? (
                    <Text style={[styles.pendingRequestNote, { color: '#004aad99', textAlign: rtl ? 'right' : 'left', ...font.regular }]}>
                      "{req.note}"
                    </Text>
                  ) : null}
                  <View style={[styles.pendingRequestActions, { flexDirection: rowDirection }]}>
                    <TouchableOpacity
                      style={[styles.pendingActionBtn, styles.pendingActionAccept, isResponding && styles.completeBtnDisabled]}
                      onPress={() => handleRespondToRequest(req, true)}
                      disabled={isResponding}
                      activeOpacity={0.8}
                    >
                      {isResponding ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={[styles.pendingActionBtnText, { ...font.bold }]}>{t('project_details.accept')}</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.pendingActionBtn, styles.pendingActionReject, isResponding && styles.completeBtnDisabled]}
                      onPress={() => handleRespondToRequest(req, false)}
                      disabled={isResponding}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.pendingActionBtnText, { ...font.bold }]}>{t('project_details.reject')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}

            {outgoingRequests.map((req) => (
              <View
                key={req.id}
                style={[styles.pendingRequestCard, { backgroundColor: '#ffffff', borderColor: colors.border }]}
              >
                <View style={[styles.pendingOutgoingRow, { flexDirection: rowDirection }]}>
                  <Text style={[styles.pendingRequestText, { color: '#004aad', textAlign: rtl ? 'right' : 'left', ...font.regular }]}>
                    {t('project_details.awaiting', {
                      from: req.currentAmount.toLocaleString(),
                      to: req.proposedAmount.toLocaleString(),
                    })}
                  </Text>
                  <View style={styles.pendingBadge}>
                    <Text style={[styles.pendingBadgeText, { ...font.semiBold, color: '#004aad99' }]}>{t('project_details.pending')}</Text>
                  </View>
                </View>
              </View>
            ))}
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
              style={[styles.completeBtn, isCalculatingFee && styles.completeBtnDisabled]}
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

      {/* Add Mission Modal */}
      <Modal
        visible={showAddMission}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddMission(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card, maxHeight: '85%' }]}>
          <ScrollView automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
            <Text style={[styles.modalTitle, { color: '#004aad', textAlign: rtl ? 'right' : 'left', ...font.bold }]}>
              {t('project_details.add_mission_title')}
            </Text>

            <Text style={[styles.missionInputLabel, { color: '#004aad99', textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>
              {t('project_details.mission_title')}
            </Text>
            <TextInput
              style={[styles.missionInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: '#004aad', textAlign: rtl ? 'right' : 'left', ...font.regular }]}
              value={newMissionTitle}
              onChangeText={setNewMissionTitle}
              placeholder={t('project_details.mission_placeholder')}
              placeholderTextColor={colors.textMuted}
            />

            <Text style={[styles.missionInputLabel, { color: '#004aad99', textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>
              {t('project_details.description_optional')}
            </Text>
            <TextInput
              style={[styles.missionInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: '#004aad', textAlign: rtl ? 'right' : 'left', ...font.regular }]}
              value={newMissionDescription}
              onChangeText={setNewMissionDescription}
              placeholder={t('project_details.description_placeholder')}
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={3}
            />

            <Text style={[styles.missionInputLabel, { color: '#004aad99', textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>
              {t('project_details.assign_to')}
            </Text>
            {assignableMembers.map((m) => {
              const selected = newMissionAssignedTo.includes(m.id);
              return (
                <TouchableOpacity
                  key={m.id}
                  style={[
                    styles.missionAssignRow,
                    { borderColor: selected ? '#004aad' : colors.border },
                    selected && styles.missionAssignRowSelected,
                  ]}
                  onPress={() => toggleAssignee(m.id)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.missionAssignName, { color: '#004aad', textAlign: rtl ? 'right' : 'left', ...font.medium }]}>
                    {m.displayName}
                  </Text>
                  <View style={[styles.missionCheckbox, { borderColor: selected ? '#004aad' : colors.border, backgroundColor: selected ? '#004aad' : 'transparent' }]}>
                    {selected && <Text style={[styles.missionCheckboxTick, { ...font.bold }]}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}

            <Text style={[styles.missionInputLabel, { color: '#004aad99', textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>
              {t('project_details.due_date')}
            </Text>
            {newMissionDueDate ? (
              <View style={[styles.missionDateRow, { borderColor: '#004aad', backgroundColor: '#004aad18' }]}>
                <Calendar size={15} color="#004aad" strokeWidth={2} />
                <Text style={[styles.missionDateText, { color: '#004aad', textAlign: rtl ? 'right' : 'left', ...font.medium }]}>
                  {formatDueDate(newMissionDueDate, t('project_details.due'))}
                </Text>
                <TouchableOpacity onPress={() => setNewMissionDueDate('')} hitSlop={10} activeOpacity={0.7}>
                  <Text style={[styles.missionDateClear, { ...font.bold }]}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.missionDateRow, { borderColor: colors.border }]}
                onPress={() => setShowDueDatePicker(true)}
                activeOpacity={0.8}
              >
                <Calendar size={15} color={colors.textMuted} strokeWidth={2} />
                <Text style={[styles.missionDatePlaceholder, { color: '#004aad99', textAlign: rtl ? 'right' : 'left', ...font.regular }]}>
                  {t('project_details.add_due_date')}
                </Text>
              </TouchableOpacity>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel, { borderColor: colors.border }]}
                onPress={() => setShowAddMission(false)}
                activeOpacity={0.8}
              >
                <Text style={[styles.modalBtnCancelText, { color: '#004aad', ...font.semiBold }]}>{t('project_details.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  styles.modalBtnConfirm,
                  (!newMissionTitle.trim() || newMissionAssignedTo.length === 0 || isAddingMission) && styles.completeBtnDisabled,
                ]}
                onPress={handleAddMission}
                disabled={!newMissionTitle.trim() || newMissionAssignedTo.length === 0 || isAddingMission}
                activeOpacity={0.8}
              >
                {isAddingMission ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={[styles.modalBtnConfirmText, { ...font.bold }]}>{t('project_details.add')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
          {showDueDatePicker && (
            <MiniCalendar
              value={newMissionDueDate}
              onSelect={(iso) => { setNewMissionDueDate(iso); setShowDueDatePicker(false); }}
              onClose={() => setShowDueDatePicker(false)}
              minDate={todayISO}
              maxDate={projectEndDate}
            />
          )}
          </View>
        </View>
      </Modal>

      {/* Add Meeting Modal */}
      <Modal
        visible={showAddMeeting}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddMeeting(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card, maxHeight: '85%' }]}>
          <ScrollView automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
            <Text style={[styles.modalTitle, { color: '#004aad', textAlign: rtl ? 'right' : 'left', ...font.bold }]}>
              {t('project_details.add_meeting_title')}
            </Text>

            <Text style={[styles.missionInputLabel, { color: '#004aad99', textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>
              {t('project_details.meeting_title_label')}
            </Text>
            <TextInput
              style={[styles.missionInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: '#004aad', textAlign: rtl ? 'right' : 'left', ...font.regular }]}
              value={newMeetingTitle}
              onChangeText={setNewMeetingTitle}
              placeholder={t('project_details.meeting_title_placeholder')}
              placeholderTextColor={colors.textMuted}
            />

            <Text style={[styles.missionInputLabel, { color: '#004aad99', textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>
              {t('project_details.description_optional')}
            </Text>
            <TextInput
              style={[styles.missionInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: '#004aad', textAlign: rtl ? 'right' : 'left', ...font.regular }]}
              value={newMeetingDescription}
              onChangeText={setNewMeetingDescription}
              placeholder={t('project_details.description_placeholder')}
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={3}
            />

            <Text style={[styles.missionInputLabel, { color: '#004aad99', textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>
              {t('project_details.meeting_date')}
            </Text>
            {newMeetingDate ? (
              <View style={[styles.missionDateRow, { borderColor: '#004aad', backgroundColor: '#004aad18' }]}>
                <Calendar size={15} color="#004aad" strokeWidth={2} />
                <Text style={[styles.missionDateText, { color: '#004aad', textAlign: rtl ? 'right' : 'left', ...font.medium }]}>
                  {formatDueDate(newMeetingDate, '')}
                </Text>
                <TouchableOpacity onPress={() => setNewMeetingDate('')} hitSlop={10} activeOpacity={0.7}>
                  <Text style={[styles.missionDateClear, { ...font.bold }]}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.missionDateRow, { borderColor: colors.border }]}
                onPress={() => setShowMeetingDatePicker(true)}
                activeOpacity={0.8}
              >
                <Calendar size={15} color={colors.textMuted} strokeWidth={2} />
                <Text style={[styles.missionDatePlaceholder, { color: '#004aad99', textAlign: rtl ? 'right' : 'left', ...font.regular }]}>
                  {t('project_details.meeting_date')}
                </Text>
              </TouchableOpacity>
            )}

            <Text style={[styles.missionInputLabel, { color: '#004aad99', textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>
              {t('project_details.meeting_time')}
            </Text>
            {newMeetingTime ? (
              <View style={[styles.missionDateRow, { borderColor: '#004aad', backgroundColor: '#004aad18' }]}>
                <Clock size={15} color="#004aad" strokeWidth={2} />
                <Text style={[styles.missionDateText, { color: '#004aad', textAlign: rtl ? 'right' : 'left', ...font.medium }]}>
                  {newMeetingTime}
                </Text>
                <TouchableOpacity onPress={() => setNewMeetingTime('')} hitSlop={10} activeOpacity={0.7}>
                  <Text style={[styles.missionDateClear, { ...font.bold }]}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.missionDateRow, { borderColor: colors.border }]}
                onPress={() => setShowMeetingTimePicker(true)}
                activeOpacity={0.8}
              >
                <Clock size={15} color={colors.textMuted} strokeWidth={2} />
                <Text style={[styles.missionDatePlaceholder, { color: '#004aad99', textAlign: rtl ? 'right' : 'left', ...font.regular }]}>
                  {t('project_details.meeting_time_placeholder')}
                </Text>
              </TouchableOpacity>
            )}

            <Text style={[styles.missionInputLabel, { color: '#004aad99', textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>
              {t('project_details.meeting_location')}
            </Text>
            <TextInput
              style={[styles.missionInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: '#004aad', textAlign: rtl ? 'right' : 'left', ...font.regular }]}
              value={newMeetingLocation}
              onChangeText={setNewMeetingLocation}
              placeholder={t('project_details.meeting_location_placeholder')}
              placeholderTextColor={colors.textMuted}
            />

            <Text style={[styles.missionInputLabel, { color: '#004aad99', textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>
              {t('project_details.meeting_invitees')}
            </Text>
            {assignableMembers.map((m) => {
              const selected = newMeetingInvitedIds.includes(m.id);
              return (
                <TouchableOpacity
                  key={m.id}
                  style={[
                    styles.missionAssignRow,
                    { borderColor: selected ? '#004aad' : colors.border },
                    selected && styles.missionAssignRowSelected,
                  ]}
                  onPress={() => toggleInvitee(m.id)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.missionAssignName, { color: '#004aad', textAlign: rtl ? 'right' : 'left', ...font.medium }]}>
                    {m.displayName}
                  </Text>
                  <View style={[styles.missionCheckbox, { borderColor: selected ? '#004aad' : colors.border, backgroundColor: selected ? '#004aad' : 'transparent' }]}>
                    {selected && <Text style={[styles.missionCheckboxTick, { ...font.bold }]}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel, { borderColor: colors.border }]}
                onPress={() => setShowAddMeeting(false)}
                activeOpacity={0.8}
              >
                <Text style={[styles.modalBtnCancelText, { color: '#004aad', ...font.semiBold }]}>{t('project_details.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  styles.modalBtnConfirm,
                  (!newMeetingTitle.trim() || !newMeetingDate || !newMeetingTime.trim() || !newMeetingLocation.trim() || newMeetingInvitedIds.length === 0 || isAddingMeeting) && styles.completeBtnDisabled,
                ]}
                onPress={handleAddMeeting}
                disabled={!newMeetingTitle.trim() || !newMeetingDate || !newMeetingTime.trim() || !newMeetingLocation.trim() || newMeetingInvitedIds.length === 0 || isAddingMeeting}
                activeOpacity={0.8}
              >
                {isAddingMeeting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={[styles.modalBtnConfirmText, { ...font.bold }]}>{t('project_details.add')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
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
          </View>
        </View>
      </Modal>

      {/* Edit project deadline (client only) */}
      {showDeadlinePicker && (
        <MiniCalendar
          value={project.deadline === 'flexible' ? '' : project.deadline}
          onSelect={handleEditDeadline}
          onClose={() => setShowDeadlinePicker(false)}
          minDate={deadlineMinDate}
          showFlexible
          isFlexible={project.deadline === 'flexible'}
          onFlexible={() => handleEditDeadline('flexible')}
          flexibleLabel={t('builder.flexible')}
        />
      )}

      {/* Mission detail popup */}
      <Modal
        visible={!!detailMission}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailMission(null)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setDetailMission(null)} />
          {detailMission && (
            <View style={[styles.modalSheet, { backgroundColor: colors.card, maxHeight: '85%' }]}>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
                <View style={[styles.detailHeaderRow, { flexDirection: rowDirection }]}>
                  <Text style={[styles.modalTitle, { color: '#004aad', flex: 1, textAlign: rtl ? 'right' : 'left', ...font.bold }]}>
                    {detailMission.title}
                  </Text>
                  <View style={[
                    styles.carouselStatusPill,
                    detailMission.status === 'done' ? styles.carouselStatusDone : { borderColor: MISSION_STATUS_CONFIG[detailMission.status]?.color ?? '#6b7280', borderWidth: 1.5 },
                  ]}>
                    <AppText weight="bold" style={[styles.carouselStatusText, { color: detailMission.status === 'done' ? '#1c9d63' : (MISSION_STATUS_CONFIG[detailMission.status]?.color ?? '#6b7280') }]}>
                      {detailMission.status === 'done' ? `✓ ${missionLabel(detailMission.status)}` : missionLabel(detailMission.status)}
                    </AppText>
                  </View>
                </View>

                {!!detailMission.description && (
                  <View>
                    <Text style={[styles.detailLabel, { textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>{t('project_details.description')}</Text>
                    <View style={styles.descPanel}>
                      <AppText weight="regular" style={[styles.descText, { textAlign: rtl ? 'right' : 'left' }]}>{detailMission.description}</AppText>
                    </View>
                  </View>
                )}

                <View>
                  <Text style={[styles.detailLabel, { textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>{t('project_details.assign_to')}</Text>
                  <Text style={[styles.detailValue, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}>
                    {detailMission.assignedTo.map((id) => allMemberNames[id] ?? id).join(', ') || '—'}
                  </Text>
                </View>

                {!!detailMission.dueDate && (
                  <View>
                    <Text style={[styles.detailLabel, { textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>{t('project_details.due_date')}</Text>
                    <Text style={[styles.detailValue, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}>{formatDueDate(detailMission.dueDate, '')}</Text>
                  </View>
                )}

                <TouchableOpacity style={[styles.modalBtn, styles.modalBtnCancel, { borderColor: colors.border }]} onPress={() => setDetailMission(null)} activeOpacity={0.8}>
                  <Text style={[styles.modalBtnCancelText, { color: '#004aad', ...font.semiBold }]}>{t('project_details.close')}</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>

      {/* Meeting detail popup */}
      <Modal
        visible={!!detailMeeting}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailMeeting(null)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setDetailMeeting(null)} />
          {detailMeeting && (
            <View style={[styles.modalSheet, { backgroundColor: colors.card, maxHeight: '85%' }]}>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
                <Text style={[styles.modalTitle, { color: '#004aad', textAlign: rtl ? 'right' : 'left', ...font.bold }]}>
                  {detailMeeting.title}
                </Text>

                {!!detailMeeting.description && (
                  <View>
                    <Text style={[styles.detailLabel, { textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>{t('project_details.description')}</Text>
                    <View style={styles.descPanel}>
                      <AppText weight="regular" style={[styles.descText, { textAlign: rtl ? 'right' : 'left' }]}>{detailMeeting.description}</AppText>
                    </View>
                  </View>
                )}

                <View style={[styles.detailInlineRow, { flexDirection: rowDirection }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.detailLabel, { textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>{t('project_details.meeting_date')}</Text>
                    <Text style={[styles.detailValue, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}>{formatDueDate(detailMeeting.date, '')}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.detailLabel, { textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>{t('project_details.meeting_time')}</Text>
                    <Text style={[styles.detailValue, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}>{detailMeeting.time}</Text>
                  </View>
                </View>

                {!!detailMeeting.location && (
                  <View>
                    <Text style={[styles.detailLabel, { textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>{t('project_details.meeting_location')}</Text>
                    <Text style={[styles.detailValue, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}>{detailMeeting.location}</Text>
                  </View>
                )}

                <View>
                  <Text style={[styles.detailLabel, { textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>{t('project_details.meeting_invitees')}</Text>
                  <Text style={[styles.detailValue, { textAlign: rtl ? 'right' : 'left', ...font.regular }]}>
                    {detailMeeting.invitedIds.map((id) => allMemberNames[id] ?? id).join(', ') || '—'}
                  </Text>
                </View>

                <TouchableOpacity style={[styles.modalBtn, styles.modalBtnCancel, { borderColor: colors.border }]} onPress={() => setDetailMeeting(null)} activeOpacity={0.8}>
                  <Text style={[styles.modalBtnCancelText, { color: '#004aad', ...font.semiBold }]}>{t('project_details.close')}</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>

      {/* Payment Summary Modal */}
      <Modal
        visible={showPaymentSummary}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPaymentSummary(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: '#004aad', textAlign: rtl ? 'right' : 'left', ...font.bold }]}>
              {t('project_details.payment_summary_title')}
            </Text>

            {feeData && (
              <>
                <Text style={[styles.modalSectionLabel, { color: '#004aad99', textAlign: rtl ? 'right' : 'left', ...font.bold }]}>
                  {t('project_details.pay_crew')}
                </Text>

                {feeData.slots.map((slot) => (
                  <View key={slot.professionalId} style={styles.feeRow}>
                    <Text style={[styles.feeName, { color: '#004aad', textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>{slot.displayName}</Text>
                    <Text style={[styles.feeAmount, { color: '#004aad', ...font.medium }]}>
                      ₪{slot.amount.toLocaleString()}
                    </Text>
                  </View>
                ))}

                <View style={styles.feeRow}>
                  <Text style={[styles.feeLabel, { color: '#004aad99', textAlign: rtl ? 'right' : 'left', ...font.medium }]}>
                    {t('project_details.subtotal')}
                  </Text>
                  <Text style={[styles.feeAmountBold, { color: '#004aad', ...font.bold }]}>
                    ₪{feeData.subtotal.toLocaleString()}
                  </Text>
                </View>

                <View style={[styles.feeDivider, { backgroundColor: colors.border }]} />

                <Text style={[styles.modalSectionLabel, { color: '#004aad99', textAlign: rtl ? 'right' : 'left', ...font.bold }]}>
                  {t('project_details.platform_fee')}
                </Text>

                <View style={styles.feeRow}>
                  <Text style={[styles.feeName, { color: '#004aad', textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>
                    {t('project_details.fee_percent')}
                  </Text>
                  <Text style={[styles.feeAmountBold, { color: '#004aad', ...font.bold }]}>
                    ₪{feeData.platformFee.toLocaleString()}
                  </Text>
                </View>
                <Text style={[styles.feePlatformNote, { color: '#004aad99', textAlign: rtl ? 'right' : 'left', ...font.regular }]}>
                  {t('project_details.paid_to_bama')}
                </Text>
              </>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel, { borderColor: colors.border }]}
                onPress={() => setShowPaymentSummary(false)}
                activeOpacity={0.8}
              >
                <Text style={[styles.modalBtnCancelText, { color: '#004aad', ...font.semiBold }]}>{t('project_details.cancel')}</Text>
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

            {feeData && (
              <Text style={[styles.feeAgreementNote, { color: '#004aad99', textAlign: 'center', ...font.regular }]}>
                {t('project_details.agreement', { amount: feeData.platformFee.toLocaleString() })}
              </Text>
            )}
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
            <Text style={[styles.modalTitle, { color: '#004aad', textAlign: rtl ? 'right' : 'left', ...font.bold }]}>
              {t('project_details.request_payment_update')}
            </Text>

            {selectedPrice && (
              <>
                <View style={styles.requestModalInfoRow}>
                  <Text style={[styles.requestModalLabel, { color: '#004aad99', textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>
                    {t('project_details.professional')}
                  </Text>
                  <Text style={[styles.requestModalValue, { color: '#004aad', textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>
                    {memberUsers[selectedPrice.professionalId]?.displayName ?? selectedPrice.professionalId}
                  </Text>
                </View>
                <View style={styles.requestModalInfoRow}>
                  <Text style={[styles.requestModalLabel, { color: '#004aad99', textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>
                    {t('project_details.current_amount')}
                  </Text>
                  <Text style={[styles.requestModalValue, { color: '#004aad', textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>
                    ${selectedPrice.currentAmount.toLocaleString()}
                  </Text>
                </View>
              </>
            )}

            <Text style={[styles.missionInputLabel, { color: '#004aad99', textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>
              {t('project_details.proposed_amount')}
            </Text>
            <TextInput
              style={[styles.missionInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: '#004aad', textAlign: rtl ? 'right' : 'left', ...font.regular }]}
              value={proposedAmount}
              onChangeText={setProposedAmount}
              placeholder={t('project_details.enter_amount')}
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
            />

            <Text style={[styles.missionInputLabel, { color: '#004aad99', textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>
              {t('project_details.note_optional')}
            </Text>
            <TextInput
              style={[styles.missionInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: '#004aad', textAlign: rtl ? 'right' : 'left', ...font.regular }]}
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
                <Text style={[styles.modalBtnCancelText, { color: '#004aad', ...font.semiBold }]}>{t('project_details.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  styles.modalBtnConfirm,
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

      <Modal visible={reportVisible} transparent animationType="slide" onRequestClose={closeReport}>
        <View style={styles.reportBackdrop}>
          <LinearGradient colors={['#1a237e', '#004aad']} style={styles.reportSheet}>
            <View style={[styles.reportHeader, { flexDirection: rowDirection }]}>
              <AppText weight="bold" style={styles.reportTitle}>{t('report.title')}</AppText>
              <TouchableOpacity onPress={closeReport} hitSlop={8} activeOpacity={0.7}>
                <AppText weight="regular" style={{ color: '#fff', fontSize: 20 }}>✕</AppText>
              </TouchableOpacity>
            </View>
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
              placeholderTextColor="rgba(255,255,255,0.45)"
              textAlignVertical="top"
            />
            {reportReason.length > 0 && reportReason.length < 20 && (
              <AppText weight="regular" style={[styles.reportHint, { textAlign: rtl ? 'right' : 'left' }]}>
                {t('report.min_chars')}
              </AppText>
            )}
            <TouchableOpacity
              style={[styles.reportSubmitBtn, { opacity: reportReason.trim().length >= 20 && !reportSubmitting ? 1 : 0.45 }]}
              onPress={submitReport}
              disabled={reportReason.trim().length < 20 || reportSubmitting}
              activeOpacity={0.8}
            >
              {reportSubmitting
                ? <ActivityIndicator size="small" color="#004aad" />
                : <AppText weight="bold" style={styles.reportSubmitText}>{t('report.submit')}</AppText>}
            </TouchableOpacity>
          </LinearGradient>
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
}) {
  const font = useAppFont();
  const language = useSettingsStore((s) => s.language);
  const lang: 'he' | 'en' = language === 'he' ? 'he' : 'en';
  const t = makeT(language === 'he' ? he : en);
  const rowDir: 'row' | 'row-reverse' = rtl ? 'row-reverse' : 'row';
  const isClient = badge !== undefined;
  const canUpdate = !!onUpdate && (!!payment?.individualOffer || !!payment?.bundleId);
  const showActions = canUpdate || !!onRemove || isPendingRemoval || !!onReport;
  return (
    <View style={styles.memberCard}>
      {/* Top row: avatar + name/role + price */}
      <View style={[styles.memberTopRow, { flexDirection: rowDir }]}>
        {photoURL ? (
          <Image source={{ uri: photoURL }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <AppText weight="bold" style={styles.avatarInitial}>{displayName.charAt(0).toUpperCase()}</AppText>
          </View>
        )}

        <View style={{ flex: 1, gap: 3 }}>
          <View style={[styles.memberNameRow, { flexDirection: rowDir }]}>
            <AppText weight="bold" style={[styles.memberName, { textAlign: rtl ? 'right' : 'left' }]}>{displayName}</AppText>
            {badge !== undefined && (
              <View style={styles.clientBadge}>
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
          <View style={[styles.memberPriceGroup, { flexDirection: rowDir }]}>
            <AppText weight="bold" style={styles.memberPrice}>₪{payment.price.toLocaleString()}</AppText>
            {payment.hasBundle && (
              <View style={styles.bundlePayBadge}>
                <AppText weight="bold" style={styles.bundlePayBadgeText}>{t('offers.bundle_badge')}</AppText>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Action bar */}
      {showActions && (
        <View style={[styles.memberActionBar, { flexDirection: rowDir }]}>
          {canUpdate && (
            <TouchableOpacity style={styles.updatePill} onPress={() => onUpdate!()} activeOpacity={0.85}>
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
          <View style={{ flex: 1 }} />
          {onReport && (
            <TouchableOpacity onPress={onReport} hitSlop={6} activeOpacity={0.7} style={styles.reportSquare}>
              <Flag size={15} color="#9aa0b8" strokeWidth={1.9} />
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

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
    paddingTop: 52,
    paddingBottom: 20,
    paddingHorizontal: 8,
  },
  headerBack: { width: 40, alignItems: 'center', justifyContent: 'center', paddingTop: 4 },
  headerBackText: { fontSize: 36, color: '#1e4fa3', lineHeight: 44 },
  headerRight: { width: 40 },
  headerCenter: { flex: 1, alignItems: 'center', gap: 4 },
  headerLabel: {
    fontSize: 11,
    color: '#8890b0',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  headerProjectTitle: {
    fontSize: 20,
    color: '#1e4fa3',
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
    color: '#8890b0',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  metaCardValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e4fa3',
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
  descriptionText: { fontSize: 14, lineHeight: 20, color: '#3a4266' },

  // ── Section headers ───────────────────────────────────────────────────────────
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  sectionTitleGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1e4fa3' },
  sectionCount: { fontSize: 13, color: '#8890b0' },
  addPill: {
    backgroundColor: 'rgba(30,79,163,0.08)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  addPillText: { fontSize: 13, color: '#1e4fa3' },
  addButtonText: { fontSize: 14, fontWeight: '600', color: '#1e4fa3' },
  emptyNote: { fontSize: 14, fontStyle: 'italic', color: '#004aad', textAlign: 'center' },

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
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f1f7',
  },
  memberSubtitle: { fontSize: 12, color: '#9aa0b8' },
  updatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#3d5cc0',
    paddingHorizontal: 15,
    paddingVertical: 7,
    borderRadius: 10,
  },
  updatePillText: { fontSize: 13, color: '#ffffff' },
  removePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#fdecec',
    paddingHorizontal: 15,
    paddingVertical: 7,
    borderRadius: 10,
  },
  removePillText: { fontSize: 13, color: '#e05656' },
  reportSquare: { width: 32, height: 32, borderRadius: 9, backgroundColor: '#f4f5f9', alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: { backgroundColor: '#1e4fa3', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#fff', fontSize: 18, fontWeight: '700' },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  memberName: { fontSize: 15, fontWeight: '600', color: '#1e4fa3' },
  rolePillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  rolePill: {
    backgroundColor: '#f0f0f7',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  rolePillText: { fontSize: 12, color: '#5c6180' },
  memberPriceGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  memberPrice: { fontSize: 16, fontWeight: '700', color: '#7d5fd0' },
  clientBadge: {
    backgroundColor: '#1e4fa3',
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
  stackAvatarFallback: { backgroundColor: '#1e4fa3', alignItems: 'center', justifyContent: 'center' },
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
  missionTitle: { fontSize: 14, color: '#1e4fa3', lineHeight: 18 },
  missionDueRow: { alignItems: 'center', gap: 4 },
  missionDue: { fontSize: 11, color: '#8890b0' },
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
    color: '#4a5578',
    lineHeight: 20,
  },
  detailHeaderRow: {
    alignItems: 'center',
    gap: 10,
  },
  detailLabel: {
    fontSize: 12,
    color: '#8890b0',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 15,
    color: '#1e4fa3',
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
    color: 'rgba(30,79,163,0.5)',
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
  missionAssignRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
  },
  missionAssignRowSelected: { backgroundColor: '#004aad18' },
  missionAssignName: { fontSize: 14, fontWeight: '500', flex: 1 },
  missionCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  missionCheckboxTick: { color: '#fff', fontSize: 12, fontWeight: '700', lineHeight: 14 },
  missionDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  missionDateText: { flex: 1, fontSize: 14, fontWeight: '500' },
  missionDatePlaceholder: { flex: 1, fontSize: 14 },
  missionDateClear: { color: '#ef4444', fontSize: 14, fontWeight: '700', paddingHorizontal: 4 },

  // ── Complete bar ──────────────────────────────────────────────────────────────
  completeBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 90,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  completeBtn: {
    backgroundColor: '#004aad',
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
  feeDivider: { height: StyleSheet.hairlineWidth, marginVertical: 8 },
  modalSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 4,
    marginBottom: 2,
  },
  feePlatformNote: { fontSize: 12, marginTop: -6, marginBottom: 4 },
  feeAgreementNote: { fontSize: 12, marginTop: 4 },
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
  modalBtnConfirm: { backgroundColor: '#004aad' },
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
  pendingRequestCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  pendingRequestText: { fontSize: 14, lineHeight: 20 },
  pendingRequestBold: { fontWeight: '700' },
  pendingRequestNote: { fontSize: 13, fontStyle: 'italic' },
  pendingRequestActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  pendingActionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
  },
  pendingActionAccept: { backgroundColor: '#22c55e' },
  pendingActionReject: { backgroundColor: '#ef4444' },
  pendingActionBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  pendingOutgoingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  pendingBadge: {
    backgroundColor: 'rgba(107,114,128,0.15)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pendingBadgeText: { color: '#6b7280', fontSize: 12, fontWeight: '600' },

  bottomPad: { height: 32 },

  // ── Report modal ──────────────────────────────────────────────────────────────
  reportBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  reportSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, gap: 12 },
  reportHeader: { alignItems: 'center', justifyContent: 'space-between' },
  reportTitle: { color: '#fff', fontSize: 20 },
  reportSubtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 14 },
  reportLabel: { color: '#fff', fontSize: 14 },
  reportInput: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: 12, color: '#fff', height: 120, textAlignVertical: 'top' },
  reportHint: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
  reportSubmitBtn: { backgroundColor: '#fff', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  reportSubmitText: { color: '#004aad', fontSize: 15 },
});
