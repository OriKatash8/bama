import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
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
import { doc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { db } from '@core/firebase/config';
import { getDocument, queryDocuments, where } from '@core/firebase/firestore';
import { auth } from '@core/firebase/config';
import { useTheme } from '@core/hooks/useTheme';
import { useSettingsStore } from '@core/stores/settingsStore';
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
} from '@features/chat/services/missionService';
import {
  listenToMeetings,
  addMeeting,
} from '@features/chat/services/meetingService';
import { MiniCalendar, RolePickerModal } from '@features/crew/components';
import { ReviewFlow, type ReviewProfessional } from '@features/reviews/components/ReviewFlow';
import { requestRemoval, acceptRemoval, listenToRemovalRequests } from '@features/chat/services/removalService';
import { Calendar } from 'lucide-react-native';

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
  return `${prefix}${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

type MemberInfo = Pick<User, 'displayName' | 'photoURL'>;

const STATUS_COLORS: Record<ProjectRequest['status'], string> = {
  open: '#22c55e',
  in_progress: '#3b82f6',
  completed: '#8b5cf6',
  cancelled: '#ef4444',
};

export default function ProjectDetailsScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const router = useRouter();
  const colors = useTheme();
  const font = useAppFont();
  const language = useSettingsStore((s) => s.language);
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
  const [newMissionAssignedTo, setNewMissionAssignedTo] = useState<string[]>([]);
  const [newMissionDueDate, setNewMissionDueDate] = useState('');
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);
  const [isAddingMission, setIsAddingMission] = useState(false);

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [showAddMeeting, setShowAddMeeting] = useState(false);
  const [newMeetingTitle, setNewMeetingTitle] = useState('');
  const [newMeetingDate, setNewMeetingDate] = useState('');
  const [newMeetingTime, setNewMeetingTime] = useState('');
  const [newMeetingLocation, setNewMeetingLocation] = useState('');
  const [newMeetingInvitedIds, setNewMeetingInvitedIds] = useState<string[]>([]);
  const [showMeetingDatePicker, setShowMeetingDatePicker] = useState(false);
  const [isAddingMeeting, setIsAddingMeeting] = useState(false);

  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>([]);
  const [showPaymentRequestModal, setShowPaymentRequestModal] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<PriceOffer | null>(null);
  const [proposedAmount, setProposedAmount] = useState('');
  const [requestNote, setRequestNote] = useState('');
  const [isSendingRequest, setIsSendingRequest] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  // Feature A: removal requests
  const [removalRequests, setRemovalRequests] = useState<RemovalRequest[]>([]);
  const [removingId, setRemovingId] = useState<string | null>(null);

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

      const [client, offers] = await Promise.all([
        getDocument<MemberInfo>(`users/${projectData.clientId}`),
        queryDocuments<PriceOffer>(
          'priceOffers',
          where('projectId', '==', projectId),
          where('status', '==', 'accepted')
        ),
      ]);

      if (client) setClientUser(client);
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

      const uniqueProfessionalIds = [
        ...new Set((projectData.filledSlots ?? []).map((s) => s.professionalId)),
      ];
      if (uniqueProfessionalIds.length > 0) {
        const entries = await Promise.all(
          uniqueProfessionalIds.map(async (id) => {
            const user = await getDocument<MemberInfo>(`users/${id}`);
            return [id, user] as const;
          })
        );
        setMemberUsers(
          Object.fromEntries(
            entries.filter((e): e is [string, MemberInfo] => e[1] !== null)
          )
        );
      }

      setIsLoading(false);
    }

    fetchAll();
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
    if (!projectId || !selectedOffer) return;
    const currentUserId = auth.currentUser?.uid;
    if (!currentUserId) return;
    const parsed = parseFloat(proposedAmount);
    if (isNaN(parsed) || parsed <= 0) return;

    setIsSendingRequest(true);
    try {
      const isClient = project?.clientId === currentUserId;
      const toUserId = isClient ? selectedOffer.professionalId : (project?.clientId ?? '');
      await createPaymentRequest(projectId, {
        fromUserId: currentUserId,
        toUserId,
        professionalId: selectedOffer.professionalId,
        currentAmount: selectedOffer.price,
        proposedAmount: parsed,
        note: requestNote.trim() || undefined,
      });
      setShowPaymentRequestModal(false);
      setSelectedOffer(null);
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
      );
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
          ? { ...prev, crewSlots: [...prev.crewSlots, ...newSlots], status: 'open' }
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
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color="#004aad" />
      </LinearGradient>
    );
  }

  if (!project) {
    return (
      <LinearGradient colors={colors.bgGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.centered}>
        <Stack.Screen options={{ headerShown: false }} />
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
        date: newMeetingDate,
        time: newMeetingTime.trim(),
        location: newMeetingLocation.trim(),
        invitedIds: newMeetingInvitedIds,
      });
      setNewMeetingTitle('');
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
      assignedTo: newMissionAssignedTo,
      dueDate: newMissionDueDate || undefined,
    };
    console.log('[handleAddMission] submitting', { projectId, currentUserId, missionData });
    setIsAddingMission(true);
    try {
      await addMission(projectId, currentUserId, missionData);
      console.log('[handleAddMission] success');
      setNewMissionTitle('');
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

  async function handleCycleMissionStatus(mission: Mission) {
    if (!projectId) return;
    const next = MISSION_STATUS_CYCLE[mission.status];
    try {
      await updateMissionStatus(projectId, mission.id, next);
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
        if (entry) entry.roles.push(role);
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
  type MemberPaymentInfo = { price: number; hasBundle: boolean; individualOffer: PriceOffer | null };
  const memberPaymentMap: Record<string, MemberPaymentInfo> = {};
  const seenBundleIds = new Set<string>();
  for (const offer of acceptedOffers) {
    const profId = offer.professionalId;
    if (!memberPaymentMap[profId]) {
      memberPaymentMap[profId] = { price: 0, hasBundle: false, individualOffer: null };
    }
    const info = memberPaymentMap[profId];
    if (offer.bundleId) {
      if (!seenBundleIds.has(offer.bundleId)) {
        seenBundleIds.add(offer.bundleId);
        const bundle = bundleMap.get(offer.bundleId);
        if (bundle) {
          info.price += bundle.bundlePrice;
          info.hasBundle = true;
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
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header — small label + large project title, centered; back button kept */}
      <View style={[styles.header, { flexDirection: rowDirection }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBack} activeOpacity={0.7}>
          <Text style={[styles.headerBackText, { ...font.regular }]}>{rtl ? '›' : '‹'}</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter} pointerEvents="none">
          <Text style={[styles.headerLabel, { ...font.semiBold }]}>
            {t('project_details.header')}
          </Text>
          <Text style={[styles.headerProjectTitle, { ...font.bold }]} numberOfLines={2}>
            {project.title}
          </Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Removal banner — shown to the professional who is pending removal */}
        {myRemovalRequest && !isCompleted && (
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
            <Text style={[styles.metaCardLabel, { ...font.semiBold }]}>{t('project_details.execution')}</Text>
            <Text style={[styles.metaCardValue, { ...font.bold }]} numberOfLines={2}>{project.exec ?? t('project_details.tbd')}</Text>
          </View>
          <View style={styles.metaCard}>
            <Text style={[styles.metaCardLabel, { ...font.semiBold }]}>{t('project_details.deadline')}</Text>
            <Text style={[styles.metaCardValue, { ...font.bold }]} numberOfLines={2}>{project.deadline}</Text>
          </View>
          <View style={styles.metaCard}>
            <Text style={[styles.metaCardLabel, { ...font.semiBold }]}>{t('project_details.location')}</Text>
            <Text style={[styles.metaCardValue, { ...font.bold }]} numberOfLines={2}>{project.location}</Text>
          </View>
        </View>

        {/* Description card */}
        <View style={styles.descriptionCard}>
          <Text style={[styles.metaCardLabel, { ...font.semiBold }]}>{t('project_details.description')}</Text>
          <Text style={[styles.descriptionText, { color: '#004aad', textAlign: rtl ? 'right' : 'left', ...font.regular }]}>
            {project.description}
          </Text>
        </View>

        {/* SECTION 2 — Team Members */}
        <View style={[styles.sectionHeaderRow, { flexDirection: rowDirection }]}>
          <Text style={[styles.sectionTitle, { ...font.bold }]}>
            {t('project_details.team_members')}
          </Text>
          {isClient && !isCompleted && (
            <TouchableOpacity onPress={() => setShowRolePicker(true)} activeOpacity={0.8}>
              <Text style={[styles.addButtonText, { ...font.semiBold }]}>
                {t('project_details.add_professional')}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {clientUser && (
          <MemberRow
            displayName={clientUser.displayName}
            photoURL={clientUser.photoURL}
            role={t('project_details.project_client')}
            badge={t('project_details.client')}
            rtl={rtl}
          />
        )}

        {Object.values(
          filledSlots.reduce<Record<string, { professionalId: string; roles: string[] }>>(
            (acc, slot) => {
              const role = slot.category;
              const entry = acc[slot.professionalId];
              if (entry) {
                entry.roles.push(role);
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
              role={roles.join(' | ')}
              rtl={rtl}
              isPendingRemoval={isClient && isPendingRemoval}
              isRemoving={removingId === professionalId}
              onRemove={isClient && !isCompleted ? () => handleRequestRemoval(professionalId) : undefined}
              payment={isClient ? payment : undefined}
              onUpdate={isClient && !isCompleted && payment?.individualOffer
                ? (offer) => {
                    setSelectedOffer(offer);
                    setProposedAmount('');
                    setRequestNote('');
                    setShowPaymentRequestModal(true);
                  }
                : undefined}
            />
          );
        })}

        {filledSlots.length === 0 && !clientUser && (
          <Text style={[styles.emptyNote, { ...font.regular }]}>
            {t('project_details.no_team_members')}
          </Text>
        )}

        {/* SECTION 3 — Missions */}
        <View style={[styles.sectionHeaderRow, { flexDirection: rowDirection }]}>
          <Text style={[styles.sectionTitle, { ...font.bold }]}>
            {t('project_details.missions')}
          </Text>
          <TouchableOpacity onPress={() => setShowAddMission(true)} activeOpacity={0.8}>
            <Text style={[styles.addButtonText, { ...font.semiBold }]}>{t('project_details.add')}</Text>
          </TouchableOpacity>
        </View>

        {missions.length === 0 ? (
          <Text style={[styles.emptyNote, { ...font.regular }]}>
            {t('project_details.no_missions')}
          </Text>
        ) : (
          missions.map((mission) => {
            const cfg = MISSION_STATUS_CONFIG[mission.status];
            const firstAssigneeId = mission.assignedTo[0];
            const firstAssigneeName = firstAssigneeId ? (allMemberNames[firstAssigneeId] ?? firstAssigneeId) : '';
            const extraCount = mission.assignedTo.length - 1;
            const firstMemberInfo = firstAssigneeId ? memberUsers[firstAssigneeId] : undefined;
            return (
              <View key={mission.id} style={[styles.missionRow, { flexDirection: rowDirection }]}>
                <View style={styles.missionAvatarWrap}>
                  {firstMemberInfo?.photoURL ? (
                    <Image source={{ uri: firstMemberInfo.photoURL }} style={styles.missionAvatar} />
                  ) : (
                    <View style={[styles.missionAvatar, styles.missionAvatarFallback]}>
                      <Text style={[styles.missionAvatarInitial, { ...font.bold }]}>
                        {firstAssigneeName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  {extraCount > 0 && (
                    <View style={styles.missionAvatarExtra}>
                      <Text style={[styles.missionAvatarExtraText, { ...font.bold }]}>+{extraCount}</Text>
                    </View>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.missionTitleCard}
                  onPress={() => handleCycleMissionStatus(mission)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.missionTitle, { ...font.semiBold }]} numberOfLines={2}>
                    {mission.title}
                  </Text>
                  {mission.dueDate && (
                    <Text style={[styles.missionDue, { ...font.regular }]}>
                      {formatDueDate(mission.dueDate, t('project_details.due'))}
                    </Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.missionStatusCard}
                  onPress={() => handleCycleMissionStatus(mission)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.missionStatusText, { color: cfg.color, ...font.bold }]}>
                    {missionLabel(mission.status)}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })
        )}

        {/* SECTION 4 — Meetings */}
        <View style={[styles.sectionHeaderRow, { flexDirection: rowDirection }]}>
          <Text style={[styles.sectionTitle, { ...font.bold }]}>
            {t('project_details.meetings')}
          </Text>
          <TouchableOpacity onPress={() => setShowAddMeeting(true)} activeOpacity={0.8}>
            <Text style={[styles.addButtonText, { ...font.semiBold }]}>{t('project_details.add')}</Text>
          </TouchableOpacity>
        </View>

        {meetings.length === 0 ? (
          <Text style={[styles.emptyNote, { ...font.regular }]}>
            {t('project_details.no_meetings')}
          </Text>
        ) : (
          sortedMeetings.map((meeting) => {
            const urgency = getMeetingUrgency(meeting.date, meeting.time);
            const titleColor =
              urgency === 'past'     ? '#22c55e' :
              urgency === 'imminent' ? '#ef4444' :
              urgency === 'soon'     ? '#f59e0b' :
              colors.text;
            const firstInviteeId = meeting.invitedIds[0];
            const firstInviteeName = firstInviteeId ? (allMemberNames[firstInviteeId] ?? firstInviteeId) : '';
            const extraCount = meeting.invitedIds.length - 1;
            const firstMemberInfo = firstInviteeId ? memberUsers[firstInviteeId] : undefined;
            return (
              <View key={meeting.id} style={[styles.missionRow, { flexDirection: rowDirection }]}>
                <View style={styles.missionAvatarWrap}>
                  {firstMemberInfo?.photoURL ? (
                    <Image source={{ uri: firstMemberInfo.photoURL }} style={styles.missionAvatar} />
                  ) : (
                    <View style={[styles.missionAvatar, styles.missionAvatarFallback]}>
                      <Text style={[styles.missionAvatarInitial, { ...font.bold }]}>
                        {firstInviteeName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  {extraCount > 0 && (
                    <View style={styles.missionAvatarExtra}>
                      <Text style={[styles.missionAvatarExtraText, { ...font.bold }]}>+{extraCount}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.missionTitleCard}>
                  <Text style={[styles.missionTitle, { ...font.semiBold, color: titleColor }]} numberOfLines={2}>
                    {meeting.title}
                  </Text>
                  <Text style={[styles.missionDue, { ...font.regular }]}>
                    {formatMeetingDateTime(meeting.date, meeting.time)}
                  </Text>
                  <Text style={[styles.missionDue, { ...font.regular }]} numberOfLines={1}>
                    {meeting.location}
                  </Text>
                </View>
              </View>
            );
          })
        )}

        {/* Pending payment-update requests */}
        {paymentRequests.length > 0 && (
          <>
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
      {isClient && (
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
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
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
      <Modal
        visible={showAddMeeting}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddMeeting(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
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
            <TextInput
              style={[styles.missionInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: '#004aad', textAlign: rtl ? 'right' : 'left', ...font.regular }]}
              value={newMeetingTime}
              onChangeText={setNewMeetingTime}
              placeholder={t('project_details.meeting_time_placeholder')}
              placeholderTextColor={colors.textMuted}
              keyboardType="numbers-and-punctuation"
            />

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
                      ${slot.amount.toLocaleString()}
                    </Text>
                  </View>
                ))}

                <View style={styles.feeRow}>
                  <Text style={[styles.feeLabel, { color: '#004aad99', textAlign: rtl ? 'right' : 'left', ...font.medium }]}>
                    {t('project_details.subtotal')}
                  </Text>
                  <Text style={[styles.feeAmountBold, { color: '#004aad', ...font.bold }]}>
                    ${feeData.subtotal.toLocaleString()}
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
                    ${feeData.platformFee.toLocaleString()}
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
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: '#004aad', textAlign: rtl ? 'right' : 'left', ...font.bold }]}>
              {t('project_details.request_payment_update')}
            </Text>

            {selectedOffer && (
              <>
                <View style={styles.requestModalInfoRow}>
                  <Text style={[styles.requestModalLabel, { color: '#004aad99', textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>
                    {t('project_details.professional')}
                  </Text>
                  <Text style={[styles.requestModalValue, { color: '#004aad', textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>
                    {memberUsers[selectedOffer.professionalId]?.displayName ?? selectedOffer.professionalId}
                  </Text>
                </View>
                <View style={styles.requestModalInfoRow}>
                  <Text style={[styles.requestModalLabel, { color: '#004aad99', textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>
                    {t('project_details.current_amount')}
                  </Text>
                  <Text style={[styles.requestModalValue, { color: '#004aad', textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>
                    ${selectedOffer.price.toLocaleString()}
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
          </View>
        </View>
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
    </LinearGradient>
  );
}


function MemberRow({
  displayName,
  photoURL,
  role,
  badge,
  rtl,
  isPendingRemoval = false,
  isRemoving = false,
  onRemove,
  payment,
  onUpdate,
}: {
  displayName: string;
  photoURL: string | null;
  role: string;
  badge?: string;
  rtl: boolean;
  isPendingRemoval?: boolean;
  isRemoving?: boolean;
  onRemove?: () => void;
  payment?: { price: number; hasBundle: boolean; individualOffer: PriceOffer | null };
  onUpdate?: (offer: PriceOffer) => void;
}) {
  const font = useAppFont();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rowDir: 'row' | 'row-reverse' = rtl ? 'row-reverse' : 'row';
  const showBottomRow = payment !== undefined || isPendingRemoval || !!onRemove;
  return (
    <View style={[styles.memberCard, { flexDirection: rowDir }]}>
      {photoURL ? (
        <Image source={{ uri: photoURL }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={[styles.avatarInitial, { ...font.bold }]}>{displayName.charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.memberInfo}>
        {/* Line 1: name + client badge */}
        <View style={[styles.memberNameRow, { flexDirection: rowDir }]}>
          <Text style={[styles.memberName, { color: '#004aad', textAlign: rtl ? 'right' : 'left', ...font.semiBold }]}>{displayName}</Text>
          {badge !== undefined && (
            <View style={styles.clientBadge}>
              <Text style={[styles.clientBadgeText, { ...font.bold }]}>{badge}</Text>
            </View>
          )}
        </View>
        {/* Line 2: roles */}
        <Text style={[styles.memberRole, { color: '#004aad99', textAlign: rtl ? 'right' : 'left', ...font.regular }]}>{role}</Text>
        {/* Line 3: price + Update + Remove (only for professionals, not client row) */}
        {showBottomRow && (
          <View style={[styles.memberActionsRow, { flexDirection: rowDir }]}>
            {payment !== undefined && (
              <View style={[styles.memberPriceGroup, { flexDirection: rowDir }]}>
                <Text style={[styles.memberPrice, { ...font.semiBold }]}>
                  ₪{payment.price.toLocaleString()}
                </Text>
                {payment.hasBundle && (
                  <View style={styles.bundlePayBadge}>
                    <Text style={[styles.bundlePayBadgeText, { ...font.bold }]}>{t('offers.bundle_badge')}</Text>
                  </View>
                )}
                {payment.individualOffer && onUpdate && (
                  <TouchableOpacity
                    style={styles.requestUpdateBtn}
                    onPress={() => onUpdate(payment.individualOffer!)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.requestUpdateText, { ...font.semiBold }]}>{t('project_details.update')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            <View style={{ flex: 1 }} />
            {isPendingRemoval ? (
              <View style={styles.pendingRemovalChip}>
                <Text style={[styles.pendingRemovalText, { ...font.semiBold }]}>{t('project_details.pending_removal')}</Text>
              </View>
            ) : onRemove ? (
              <TouchableOpacity style={styles.removeBtn} onPress={onRemove} disabled={isRemoving} activeOpacity={0.7}>
                {isRemoving
                  ? <ActivityIndicator size="small" color="#ef4444" />
                  : <Text style={[styles.removeBtnText, { ...font.semiBold }]}>{t('project_details.remove_member')}</Text>}
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      </View>
    </View>
  );
}

const CARD_SHADOW = {
  shadowColor: '#000' as const,
  shadowOpacity: 0.08,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
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
  headerBackText: { fontSize: 36, color: '#ffffff', lineHeight: 44 },
  headerRight: { width: 40 },
  headerCenter: { flex: 1, alignItems: 'center', gap: 4 },
  headerLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  headerProjectTitle: {
    fontSize: 22,
    color: '#ffffff',
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 28,
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
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    gap: 4,
    ...CARD_SHADOW,
  },
  metaCardLabel: {
    fontSize: 11,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  metaCardValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#004aad',
    textAlign: 'center',
  },

  // ── Description card ─────────────────────────────────────────────────────────
  descriptionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    gap: 6,
    ...CARD_SHADOW,
  },
  descriptionText: { fontSize: 15, lineHeight: 22 },

  // ── Section headers ───────────────────────────────────────────────────────────
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
  },
  addButtonText: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  emptyNote: { fontSize: 14, fontStyle: 'italic', color: 'rgba(255,255,255,0.65)', textAlign: 'center' },

  // ── Member cards ──────────────────────────────────────────────────────────────
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    ...CARD_SHADOW,
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: { backgroundColor: '#004aad', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#fff', fontSize: 18, fontWeight: '700' },
  memberInfo: { flex: 1, gap: 2 },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  memberName: { fontSize: 15, fontWeight: '600' },
  memberRole: { fontSize: 13, color: '#6b7280' },
  memberActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  memberPriceGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  memberPrice: { fontSize: 14, fontWeight: '600', color: '#cb6ce6' },
  clientBadge: {
    backgroundColor: '#004aad',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  clientBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  bundlePayBadge: { backgroundColor: '#cb6ce6', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  bundlePayBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },

  requestUpdateBtn: {
    backgroundColor: 'rgba(0,74,173,0.1)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  requestUpdateText: { fontSize: 12, fontWeight: '600', color: '#004aad' },

  // ── Mission rows ──────────────────────────────────────────────────────────────
  missionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  missionAvatarWrap: { position: 'relative' },
  missionAvatar: { width: 38, height: 38, borderRadius: 19 },
  missionAvatarFallback: { backgroundColor: '#004aad', alignItems: 'center', justifyContent: 'center' },
  missionAvatarInitial: { color: '#fff', fontSize: 15, fontWeight: '700' },
  missionAvatarExtra: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: '#cb6ce6',
    borderRadius: 8,
    minWidth: 16,
    paddingHorizontal: 3,
    paddingVertical: 1,
    alignItems: 'center',
  },
  missionAvatarExtraText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  missionTitleCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 10,
    alignItems: 'center',
    gap: 2,
    ...CARD_SHADOW,
  },
  missionTitle: { fontSize: 14, fontWeight: '600', color: '#004aad', textAlign: 'center', lineHeight: 18 },
  missionDue: { fontSize: 11, color: '#6b7280', textAlign: 'center' },
  missionStatusCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 72,
    alignItems: 'center',
    ...CARD_SHADOW,
  },
  missionStatusText: { fontSize: 11, fontWeight: '700' },

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
    gap: 12,
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
  removeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
  },
  removeBtnText: { color: '#ef4444', fontSize: 12, fontWeight: '600' },

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
});
