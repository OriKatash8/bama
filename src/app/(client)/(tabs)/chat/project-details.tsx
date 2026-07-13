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
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { getDocument, queryDocuments, where } from '@core/firebase/firestore';
import { auth } from '@core/firebase/config';
import { useTheme, type AppColors } from '@core/hooks/useTheme';
import { useSettingsStore } from '@core/stores/settingsStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import type { BundleOffer, FilledSlot, Mission, MissionStatus, PaymentRequest, PriceOffer, ProjectRequest } from '@core/types/project';
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
import { MiniCalendar } from '@features/crew/components';
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
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';

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

  const [missions, setMissions] = useState<Mission[]>([]);
  const [showAddMission, setShowAddMission] = useState(false);
  const [newMissionTitle, setNewMissionTitle] = useState('');
  const [newMissionAssignedTo, setNewMissionAssignedTo] = useState<string[]>([]);
  const [newMissionDueDate, setNewMissionDueDate] = useState('');
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);
  const [isAddingMission, setIsAddingMission] = useState(false);

  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>([]);
  const [showPaymentRequestModal, setShowPaymentRequestModal] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<PriceOffer | null>(null);
  const [proposedAmount, setProposedAmount] = useState('');
  const [requestNote, setRequestNote] = useState('');
  const [isSendingRequest, setIsSendingRequest] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);

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
    return listenToMissions(projectId, setMissions);
  }, [projectId]);

  useEffect(() => {
    const userId = auth.currentUser?.uid;
    if (!projectId || !userId) return;
    return listenToPaymentRequests(projectId, userId, setPaymentRequests);
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
    if (!projectId) return;
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
        <Text style={[styles.errorText, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}>
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

  async function handleAddMission() {
    if (!projectId || !newMissionTitle.trim() || newMissionAssignedTo.length === 0) return;
    const currentUserId = auth.currentUser?.uid;
    if (!currentUserId) return;
    setIsAddingMission(true);
    try {
      await addMission(projectId, currentUserId, {
        title: newMissionTitle.trim(),
        assignedTo: newMissionAssignedTo,
        dueDate: newMissionDueDate || undefined,
      });
      setNewMissionTitle('');
      setNewMissionAssignedTo([]);
      setNewMissionDueDate('');
      setShowAddMission(false);
    } catch {
      Alert.alert('Error', t('project_details.error_add_mission'));
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

  // Build grouped payment entries (bundles collapse to one row at bundlePrice)
  type PaymentEntry =
    | { kind: 'individual'; offer: PriceOffer }
    | { kind: 'bundle'; bundleId: string; bundle: BundleOffer; offers: PriceOffer[] };

  const paymentEntries: PaymentEntry[] = [];
  const seenBundleIds = new Set<string>();
  for (const offer of acceptedOffers) {
    if (offer.bundleId) {
      if (!seenBundleIds.has(offer.bundleId)) {
        seenBundleIds.add(offer.bundleId);
        const bundle = bundleMap.get(offer.bundleId);
        if (bundle) {
          paymentEntries.push({
            kind: 'bundle',
            bundleId: offer.bundleId,
            bundle,
            offers: acceptedOffers.filter((o) => o.bundleId === offer.bundleId),
          });
        }
      }
    } else {
      paymentEntries.push({ kind: 'individual', offer });
    }
  }
  const total = paymentEntries.reduce(
    (sum, e) => sum + (e.kind === 'bundle' ? e.bundle.bundlePrice : e.offer.price),
    0,
  );
  const currentUserId = auth.currentUser?.uid ?? '';
  const isClient = currentUserId === project.clientId;
  const isCompleted = project.status === 'completed';

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

  return (
    <LinearGradient colors={colors.bgGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBack} activeOpacity={0.7}>
          <Text style={styles.headerBackText}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { textAlign: rtl ? 'right' : 'center' }]} numberOfLines={1}>
          {t('project_details.header')}
        </Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* SECTION 1 — Project Info */}
        <Text style={[styles.projectTitle, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}>
          {project.title}
        </Text>

        <View style={[styles.statusBadge, { backgroundColor: statusColor + '22', borderColor: statusColor }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>{projectStatusLabel(project.status)}</Text>
        </View>

        <View style={[styles.metaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <MetaRow label={t('project_details.execution')} value={project.exec ?? t('project_details.tbd')} colors={colors} rtl={rtl} />
          <RowDivider colors={colors} />
          <MetaRow label={t('project_details.deadline')} value={project.deadline} colors={colors} rtl={rtl} />
          <RowDivider colors={colors} />
          <MetaRow label={t('project_details.location')} value={project.location} colors={colors} rtl={rtl} />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
            {t('project_details.description')}
          </Text>
          <Text style={[styles.descriptionText, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}>
            {project.description}
          </Text>
        </View>

        {/* SECTION 2 — Team Members */}
        <Text style={[styles.sectionLabel, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
          {t('project_details.team_members')}
        </Text>

        {clientUser && (
          <MemberRow
            displayName={clientUser.displayName}
            photoURL={clientUser.photoURL}
            role={t('project_details.project_client')}
            badge={t('project_details.client')}
            colors={colors}
            rtl={rtl}
          />
        )}

        {Object.values(
          filledSlots.reduce<Record<string, { professionalId: string; roles: string[] }>>(
            (acc, slot) => {
              const role = `${slot.subcategory} · ${slot.category}`;
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
          return (
            <MemberRow
              key={professionalId}
              displayName={member?.displayName ?? professionalId}
              photoURL={member?.photoURL ?? null}
              role={roles.join(' | ')}
              colors={colors}
              rtl={rtl}
            />
          );
        })}

        {filledSlots.length === 0 && !clientUser && (
          <Text style={[styles.emptyNote, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
            {t('project_details.no_team_members')}
          </Text>
        )}

        {/* SECTION 3 — Missions */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
            {t('project_details.missions')}
          </Text>
          <TouchableOpacity onPress={() => setShowAddMission(true)} activeOpacity={0.8}>
            <Text style={styles.addButtonText}>{t('project_details.add')}</Text>
          </TouchableOpacity>
        </View>

        {missions.length === 0 ? (
          <Text style={[styles.emptyNote, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
            {t('project_details.no_missions')}
          </Text>
        ) : (
          missions.map((mission) => {
            const cfg = MISSION_STATUS_CONFIG[mission.status];
            const assigneeNames = mission.assignedTo
              .map((id) => allMemberNames[id] ?? id)
              .join(', ');
            return (
              <View
                key={mission.id}
                style={[styles.missionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={styles.missionTop}>
                  <Text style={[styles.missionTitle, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]} numberOfLines={2}>
                    {mission.title}
                  </Text>
                  <TouchableOpacity
                    style={[styles.missionStatusPill, { backgroundColor: cfg.color }]}
                    onPress={() => handleCycleMissionStatus(mission)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.missionStatusText}>{missionLabel(mission.status)}</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.missionMeta}>
                  <Text style={[styles.missionMetaText, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
                    {assigneeNames}
                  </Text>
                  {mission.dueDate ? (
                    <Text style={[styles.missionMetaText, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
                      {formatDueDate(mission.dueDate, t('project_details.due'))}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })
        )}

        {/* SECTION 4 — Payment */}
        <Text style={[styles.sectionLabel, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
          {t('project_details.payment')}
        </Text>

        {/* Pending payment requests */}
        {paymentRequests.length > 0 && (
          <>
            {incomingRequests.map((req) => {
              const fromName = allMemberNames[req.fromUserId] ?? req.fromUserId;
              const isResponding = respondingId === req.id;
              return (
                <View
                  key={req.id}
                  style={[styles.pendingRequestCard, { backgroundColor: colors.card, borderColor: '#f59e0b' }]}
                >
                  <Text style={[styles.pendingRequestText, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}>
                    <Text style={styles.pendingRequestBold}>{fromName}</Text>
                    {' ' + t('project_details.requests_to_change', {
                      from: req.currentAmount.toLocaleString(),
                      to: req.proposedAmount.toLocaleString(),
                    })}
                  </Text>
                  {req.note ? (
                    <Text style={[styles.pendingRequestNote, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
                      "{req.note}"
                    </Text>
                  ) : null}
                  <View style={styles.pendingRequestActions}>
                    <TouchableOpacity
                      style={[
                        styles.pendingActionBtn,
                        styles.pendingActionAccept,
                        isResponding && styles.completeBtnDisabled,
                      ]}
                      onPress={() => handleRespondToRequest(req, true)}
                      disabled={isResponding}
                      activeOpacity={0.8}
                    >
                      {isResponding ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.pendingActionBtnText}>{t('project_details.accept')}</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.pendingActionBtn,
                        styles.pendingActionReject,
                        isResponding && styles.completeBtnDisabled,
                      ]}
                      onPress={() => handleRespondToRequest(req, false)}
                      disabled={isResponding}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.pendingActionBtnText}>{t('project_details.reject')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}

            {outgoingRequests.map((req) => (
              <View
                key={req.id}
                style={[styles.pendingRequestCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={styles.pendingOutgoingRow}>
                  <Text style={[styles.pendingRequestText, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}>
                    {t('project_details.awaiting', {
                      from: req.currentAmount.toLocaleString(),
                      to: req.proposedAmount.toLocaleString(),
                    })}
                  </Text>
                  <View style={styles.pendingBadge}>
                    <Text style={styles.pendingBadgeText}>{t('project_details.pending')}</Text>
                  </View>
                </View>
              </View>
            ))}
          </>
        )}

        {/* Payment list */}
        {paymentEntries.length === 0 ? (
          <Text style={[styles.emptyNote, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
            {t('project_details.no_offers')}
          </Text>
        ) : (
          <View style={[styles.metaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {paymentEntries.map((entry, i) => {
              const isLast = i === paymentEntries.length - 1;
              if (entry.kind === 'bundle') {
                const member = memberUsers[entry.bundle.professionalId];
                const name = member?.displayName ?? entry.bundle.professionalId;
                const roles = entry.offers.map((o) => o.subcategory).join(' | ');
                return (
                  <View key={entry.bundleId}>
                    <View style={styles.paymentRow}>
                      <View style={styles.paymentLeft}>
                        <View style={styles.paymentNameRow}>
                          <Text style={[styles.paymentName, { color: colors.text }]}>{name}</Text>
                          <View style={styles.bundlePayBadge}>
                            <Text style={styles.bundlePayBadgeText}>{t('offers.bundle_badge')}</Text>
                          </View>
                        </View>
                        <Text style={[styles.paymentRole, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
                          {roles}
                        </Text>
                      </View>
                      <Text style={[styles.paymentAmount, { color: colors.text }]}>
                        ₪{entry.bundle.bundlePrice.toLocaleString()}
                      </Text>
                    </View>
                    {!isLast && <RowDivider colors={colors} />}
                  </View>
                );
              }
              const { offer } = entry;
              const member = memberUsers[offer.professionalId];
              const name = member?.displayName ?? offer.professionalId;
              return (
                <View key={offer.id}>
                  <View style={styles.paymentRow}>
                    <View style={styles.paymentLeft}>
                      <Text style={[styles.paymentName, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}>{name}</Text>
                      <Text style={[styles.paymentRole, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
                        {offer.subcategory} · {offer.category}
                      </Text>
                    </View>
                    <View style={styles.paymentRight}>
                      <Text style={[styles.paymentAmount, { color: colors.text }]}>
                        ₪{offer.price.toLocaleString()}
                      </Text>
                      <TouchableOpacity
                        style={styles.requestUpdateBtn}
                        onPress={() => {
                          setSelectedOffer(offer);
                          setProposedAmount('');
                          setRequestNote('');
                          setShowPaymentRequestModal(true);
                        }}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.requestUpdateText}>{t('project_details.update')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  {!isLast && <RowDivider colors={colors} />}
                </View>
              );
            })}
            <RowDivider colors={colors} />
            <View style={styles.paymentRow}>
              <Text style={[styles.paymentTotalLabel, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}>
                {t('project_details.total')}
              </Text>
              <Text style={[styles.paymentTotalAmount, { color: colors.primary }]}>
                ₪{total.toLocaleString()}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.bottomPad} />
      </ScrollView>

      {/* Mark as Complete / Completed badge */}
      {isClient && (
        <View style={styles.completeBar}>
          {isCompleted ? (
            <View style={styles.completedBadge}>
              <Text style={styles.completedBadgeText}>{t('project_details.completed')}</Text>
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
                <Text style={styles.completeBtnText}>{t('project_details.mark_complete')}</Text>
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
            <Text style={[styles.modalTitle, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}>
              {t('project_details.add_mission_title')}
            </Text>

            <Text style={[styles.missionInputLabel, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
              {t('project_details.mission_title')}
            </Text>
            <TextInput
              style={[styles.missionInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text, textAlign: rtl ? 'right' : 'left' }]}
              value={newMissionTitle}
              onChangeText={setNewMissionTitle}
              placeholder={t('project_details.mission_placeholder')}
              placeholderTextColor={colors.textMuted}
            />

            <Text style={[styles.missionInputLabel, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
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
                  <Text style={[styles.missionAssignName, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}>
                    {m.displayName}
                  </Text>
                  <View style={[styles.missionCheckbox, { borderColor: selected ? '#004aad' : colors.border, backgroundColor: selected ? '#004aad' : 'transparent' }]}>
                    {selected && <Text style={styles.missionCheckboxTick}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}

            <Text style={[styles.missionInputLabel, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
              {t('project_details.due_date')}
            </Text>
            {newMissionDueDate ? (
              <View style={[styles.missionDateRow, { borderColor: '#004aad', backgroundColor: '#004aad18' }]}>
                <Calendar size={15} color="#004aad" strokeWidth={2} />
                <Text style={[styles.missionDateText, { color: '#004aad', textAlign: rtl ? 'right' : 'left' }]}>
                  {formatDueDate(newMissionDueDate, t('project_details.due'))}
                </Text>
                <TouchableOpacity onPress={() => setNewMissionDueDate('')} hitSlop={10} activeOpacity={0.7}>
                  <Text style={styles.missionDateClear}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.missionDateRow, { borderColor: colors.border }]}
                onPress={() => setShowDueDatePicker(true)}
                activeOpacity={0.8}
              >
                <Calendar size={15} color={colors.textMuted} strokeWidth={2} />
                <Text style={[styles.missionDatePlaceholder, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
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
                <Text style={[styles.modalBtnCancelText, { color: colors.text }]}>{t('project_details.cancel')}</Text>
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
                  <Text style={styles.modalBtnConfirmText}>{t('project_details.add')}</Text>
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

      {/* Payment Summary Modal */}
      <Modal
        visible={showPaymentSummary}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPaymentSummary(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}>
              {t('project_details.payment_summary_title')}
            </Text>

            {feeData && (
              <>
                <Text style={[styles.modalSectionLabel, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
                  {t('project_details.pay_crew')}
                </Text>

                {feeData.slots.map((slot) => (
                  <View key={slot.professionalId} style={styles.feeRow}>
                    <Text style={[styles.feeName, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}>{slot.displayName}</Text>
                    <Text style={[styles.feeAmount, { color: colors.text }]}>
                      ${slot.amount.toLocaleString()}
                    </Text>
                  </View>
                ))}

                <View style={styles.feeRow}>
                  <Text style={[styles.feeLabel, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
                    {t('project_details.subtotal')}
                  </Text>
                  <Text style={[styles.feeAmountBold, { color: colors.text }]}>
                    ${feeData.subtotal.toLocaleString()}
                  </Text>
                </View>

                <View style={[styles.feeDivider, { backgroundColor: colors.border }]} />

                <Text style={[styles.modalSectionLabel, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
                  {t('project_details.platform_fee')}
                </Text>

                <View style={styles.feeRow}>
                  <Text style={[styles.feeName, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}>
                    {t('project_details.fee_percent')}
                  </Text>
                  <Text style={[styles.feeAmountBold, { color: '#004aad' }]}>
                    ${feeData.platformFee.toLocaleString()}
                  </Text>
                </View>
                <Text style={[styles.feePlatformNote, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
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
                <Text style={[styles.modalBtnCancelText, { color: colors.text }]}>{t('project_details.cancel')}</Text>
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
                  <Text style={styles.modalBtnConfirmText}>{t('project_details.confirm_complete')}</Text>
                )}
              </TouchableOpacity>
            </View>

            {feeData && (
              <Text style={[styles.feeAgreementNote, { color: colors.textMuted, textAlign: 'center' }]}>
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
            <Text style={[styles.modalTitle, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}>
              {t('project_details.request_payment_update')}
            </Text>

            {selectedOffer && (
              <>
                <View style={styles.requestModalInfoRow}>
                  <Text style={[styles.requestModalLabel, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
                    {t('project_details.professional')}
                  </Text>
                  <Text style={[styles.requestModalValue, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}>
                    {memberUsers[selectedOffer.professionalId]?.displayName ?? selectedOffer.professionalId}
                  </Text>
                </View>
                <View style={styles.requestModalInfoRow}>
                  <Text style={[styles.requestModalLabel, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
                    {t('project_details.current_amount')}
                  </Text>
                  <Text style={[styles.requestModalValue, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}>
                    ${selectedOffer.price.toLocaleString()}
                  </Text>
                </View>
              </>
            )}

            <Text style={[styles.missionInputLabel, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
              {t('project_details.proposed_amount')}
            </Text>
            <TextInput
              style={[styles.missionInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text, textAlign: rtl ? 'right' : 'left' }]}
              value={proposedAmount}
              onChangeText={setProposedAmount}
              placeholder={t('project_details.enter_amount')}
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
            />

            <Text style={[styles.missionInputLabel, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
              {t('project_details.note_optional')}
            </Text>
            <TextInput
              style={[styles.missionInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text, textAlign: rtl ? 'right' : 'left' }]}
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
                <Text style={[styles.modalBtnCancelText, { color: colors.text }]}>{t('project_details.cancel')}</Text>
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
                  <Text style={styles.modalBtnConfirmText}>{t('project_details.send_request')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

function MetaRow({ label, value, colors, rtl }: { label: string; value: string; colors: AppColors; rtl: boolean }) {
  return (
    <View style={styles.metaRow}>
      <Text style={[styles.metaLabel, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>{label}</Text>
      <Text style={[styles.metaValue, { color: colors.text, textAlign: rtl ? 'left' : 'right' }]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function RowDivider({ colors }: { colors: AppColors }) {
  return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
}

function MemberRow({
  displayName,
  photoURL,
  role,
  badge,
  colors,
  rtl,
}: {
  displayName: string;
  photoURL: string | null;
  role: string;
  badge?: string;
  colors: AppColors;
  rtl: boolean;
}) {
  return (
    <View style={[styles.memberRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {photoURL ? (
        <Image source={{ uri: photoURL }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={styles.avatarInitial}>{displayName.charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.memberInfo}>
        <View style={styles.memberNameRow}>
          <Text style={[styles.memberName, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}>{displayName}</Text>
          {badge !== undefined && (
            <View style={styles.clientBadge}>
              <Text style={styles.clientBadgeText}>{badge}</Text>
            </View>
          )}
        </View>
        <Text style={[styles.memberRole, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>{role}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 16 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 3,
    paddingHorizontal: 8,
  },
  headerBack: { width: 40, height: 56, alignItems: 'center', justifyContent: 'center' },
  headerBackText: { fontSize: 36, color: '#004aad', lineHeight: 44 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#111' },
  headerRight: { width: 40 },

  content: { padding: 16, gap: 12, paddingBottom: 100 },

  projectTitle: { fontSize: 26, fontWeight: '800', lineHeight: 32 },

  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontWeight: '700' },

  metaCard: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  metaLabel: { fontSize: 13, fontWeight: '600' },
  metaValue: { fontSize: 14, fontWeight: '500', flex: 1 },

  section: { gap: 6 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  descriptionText: { fontSize: 15, lineHeight: 22 },
  addButtonText: { fontSize: 14, fontWeight: '600', color: '#004aad' },
  emptyNote: { fontSize: 14, fontStyle: 'italic' },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: { backgroundColor: '#004aad', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#fff', fontSize: 18, fontWeight: '700' },
  memberInfo: { flex: 1, gap: 2 },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  memberName: { fontSize: 15, fontWeight: '600' },
  memberRole: { fontSize: 13 },
  clientBadge: {
    backgroundColor: '#004aad',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  clientBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 14 },

  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  paymentLeft: { flex: 1, gap: 2 },
  paymentRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  paymentNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  paymentName: { fontSize: 14, fontWeight: '600' },
  paymentRole: { fontSize: 12 },
  paymentAmount: { fontSize: 15, fontWeight: '600' },
  bundlePayBadge: { backgroundColor: '#cb6ce6', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  bundlePayBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  paymentTotalLabel: { fontSize: 15, fontWeight: '700' },
  paymentTotalAmount: { fontSize: 17, fontWeight: '800' },

  requestUpdateBtn: {
    backgroundColor: 'rgba(0,74,173,0.1)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  requestUpdateText: { fontSize: 12, fontWeight: '600', color: '#004aad' },

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

  missionCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  missionTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  missionTitle: { flex: 1, fontSize: 15, fontWeight: '600', lineHeight: 20 },
  missionStatusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  missionStatusText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  missionMeta: { flexDirection: 'row', gap: 12 },
  missionMetaText: { fontSize: 12 },

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

  completeBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 90,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
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
});
