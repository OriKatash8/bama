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
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { getDocument, queryDocuments, where } from '@core/firebase/firestore';
import { auth } from '@core/firebase/config';
import { useTheme, type AppColors } from '@core/hooks/useTheme';
import type { FilledSlot, Mission, MissionStatus, PriceOffer, ProjectRequest } from '@core/types/project';
import type { User } from '@core/types/user';
import {
  calculateProjectFee,
  markProjectComplete,
  type ProjectFee,
} from '@features/chat/services/paymentService';
import {
  listenToMissions,
  addMission,
  updateMissionStatus,
} from '@features/chat/services/missionService';
import { MiniCalendar } from '@features/crew/components';
import { Calendar } from 'lucide-react-native';

const MISSION_STATUS_CONFIG: Record<MissionStatus, { label: string; color: string }> = {
  todo:        { label: 'To Do',       color: '#6b7280' },
  in_progress: { label: 'In Progress', color: '#f59e0b' },
  done:        { label: 'Done',        color: '#22c55e' },
};

const MISSION_STATUS_CYCLE: Record<MissionStatus, MissionStatus> = {
  todo: 'in_progress',
  in_progress: 'done',
  done: 'todo',
};

function formatDueDate(iso: string): string {
  const d = new Date(iso);
  return `Due: ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

type MemberInfo = Pick<User, 'displayName' | 'photoURL'>;

const STATUS_COLORS: Record<ProjectRequest['status'], string> = {
  open: '#22c55e',
  in_progress: '#3b82f6',
  completed: '#8b5cf6',
  cancelled: '#ef4444',
};

const STATUS_LABELS: Record<ProjectRequest['status'], string> = {
  open: 'Open',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export default function ProjectDetailsScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const router = useRouter();
  const colors = useTheme();

  const [project, setProject] = useState<ProjectRequest | null>(null);
  const [clientUser, setClientUser] = useState<MemberInfo | null>(null);
  const [memberUsers, setMemberUsers] = useState<Record<string, MemberInfo>>({});
  const [acceptedOffers, setAcceptedOffers] = useState<PriceOffer[]>([]);
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

  async function handleMarkComplete() {
    if (!projectId) return;
    setIsCalculatingFee(true);
    try {
      const fee = await calculateProjectFee(projectId);
      setFeeData(fee);
      setShowPaymentSummary(true);
    } catch {
      Alert.alert('Error', 'Could not load payment details. Please try again.');
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
      Alert.alert('Project marked as complete!');
    } catch {
      Alert.alert('Error', 'Could not complete the project. Please try again.');
    } finally {
      setIsConfirming(false);
    }
  }

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color="#004aad" />
      </View>
    );
  }

  if (!project) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={[styles.errorText, { color: colors.text }]}>Project not found</Text>
      </View>
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
      Alert.alert('Error', 'Could not add mission. Please try again.');
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
      Alert.alert('Error', 'Could not update mission status.');
    }
  }

  const statusColor = STATUS_COLORS[project.status];
  const total = acceptedOffers.reduce((sum, o) => sum + o.price, 0);
  const filledSlots: FilledSlot[] = project.filledSlots ?? [];
  const isClient = auth.currentUser?.uid === project.clientId;
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

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBack} activeOpacity={0.7}>
          <Text style={styles.headerBackText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>Project Details</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* SECTION 1 — Project Info */}
        <Text style={[styles.projectTitle, { color: colors.text }]}>{project.title}</Text>

        <View style={[styles.statusBadge, { backgroundColor: statusColor + '22', borderColor: statusColor }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>{STATUS_LABELS[project.status]}</Text>
        </View>

        <View style={[styles.metaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <MetaRow label="Execution" value={project.exec ?? 'TBD'} colors={colors} />
          <RowDivider colors={colors} />
          <MetaRow label="Deadline" value={project.deadline} colors={colors} />
          <RowDivider colors={colors} />
          <MetaRow label="Location" value={project.location} colors={colors} />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Description</Text>
          <Text style={[styles.descriptionText, { color: colors.text }]}>{project.description}</Text>
        </View>

        {/* SECTION 2 — Team Members */}
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Team Members</Text>

        {clientUser && (
          <MemberRow
            displayName={clientUser.displayName}
            photoURL={clientUser.photoURL}
            role="Project Client"
            badge="Client"
            colors={colors}
          />
        )}

        {filledSlots.map((slot, i) => {
          const member = memberUsers[slot.professionalId];
          return (
            <MemberRow
              key={i}
              displayName={member?.displayName ?? slot.professionalId}
              photoURL={member?.photoURL ?? null}
              role={`${slot.subcategory} · ${slot.category}`}
              colors={colors}
            />
          );
        })}

        {filledSlots.length === 0 && !clientUser && (
          <Text style={[styles.emptyNote, { color: colors.textMuted }]}>No team members yet</Text>
        )}

        {/* SECTION 3 — Missions */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Missions</Text>
          <TouchableOpacity onPress={() => setShowAddMission(true)} activeOpacity={0.8}>
            <Text style={styles.addButtonText}>+ Add</Text>
          </TouchableOpacity>
        </View>

        {missions.length === 0 ? (
          <Text style={[styles.emptyNote, { color: colors.textMuted }]}>No missions yet</Text>
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
                  <Text style={[styles.missionTitle, { color: colors.text }]} numberOfLines={2}>
                    {mission.title}
                  </Text>
                  <TouchableOpacity
                    style={[styles.missionStatusPill, { backgroundColor: cfg.color }]}
                    onPress={() => handleCycleMissionStatus(mission)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.missionStatusText}>{cfg.label}</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.missionMeta}>
                  <Text style={[styles.missionMetaText, { color: colors.textMuted }]}>
                    {assigneeNames}
                  </Text>
                  {mission.dueDate ? (
                    <Text style={[styles.missionMetaText, { color: colors.textMuted }]}>
                      {formatDueDate(mission.dueDate)}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })
        )}

        {/* SECTION 4 — Payment Summary */}
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Payment</Text>

        {acceptedOffers.length === 0 ? (
          <Text style={[styles.emptyNote, { color: colors.textMuted }]}>No accepted offers yet</Text>
        ) : (
          <View style={[styles.metaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {acceptedOffers.map((offer, i) => {
              const member = memberUsers[offer.professionalId];
              const name = member?.displayName ?? offer.professionalId;
              return (
                <View key={offer.id}>
                  <View style={styles.paymentRow}>
                    <View style={styles.paymentLeft}>
                      <Text style={[styles.paymentName, { color: colors.text }]}>{name}</Text>
                      <Text style={[styles.paymentRole, { color: colors.textMuted }]}>
                        {offer.subcategory} · {offer.category}
                      </Text>
                    </View>
                    <Text style={[styles.paymentAmount, { color: colors.text }]}>
                      ${offer.price.toLocaleString()}
                    </Text>
                  </View>
                  {i < acceptedOffers.length - 1 && <RowDivider colors={colors} />}
                </View>
              );
            })}
            <RowDivider colors={colors} />
            <View style={styles.paymentRow}>
              <Text style={[styles.paymentTotalLabel, { color: colors.text }]}>Total</Text>
              <Text style={[styles.paymentTotalAmount, { color: colors.primary }]}>
                ${total.toLocaleString()}
              </Text>
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[styles.comingSoonBtn, { borderColor: colors.border }]}
          onPress={() => Alert.alert('Coming soon', 'Payment update requests are not available yet.')}
          activeOpacity={0.8}
        >
          <Text style={[styles.comingSoonText, { color: colors.textMuted }]}>
            Request Payment Update
          </Text>
        </TouchableOpacity>

        <View style={styles.bottomPad} />
      </ScrollView>

      {/* Mark as Complete / Completed badge */}
      {isClient && (
        <View style={styles.completeBar}>
          {isCompleted ? (
            <View style={styles.completedBadge}>
              <Text style={styles.completedBadgeText}>✓ Completed</Text>
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
                <Text style={styles.completeBtnText}>Mark as Complete</Text>
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
            <Text style={[styles.modalTitle, { color: colors.text }]}>Add Mission</Text>

            <Text style={[styles.missionInputLabel, { color: colors.textMuted }]}>Title</Text>
            <TextInput
              style={[styles.missionInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
              value={newMissionTitle}
              onChangeText={setNewMissionTitle}
              placeholder="e.g. Edit highlight reel"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={[styles.missionInputLabel, { color: colors.textMuted }]}>Assign to</Text>
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
                  <Text style={[styles.missionAssignName, { color: colors.text }]}>{m.displayName}</Text>
                  <View style={[styles.missionCheckbox, { borderColor: selected ? '#004aad' : colors.border, backgroundColor: selected ? '#004aad' : 'transparent' }]}>
                    {selected && <Text style={styles.missionCheckboxTick}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}

            <Text style={[styles.missionInputLabel, { color: colors.textMuted }]}>Due date</Text>
            {newMissionDueDate ? (
              <View style={[styles.missionDateRow, { borderColor: '#004aad', backgroundColor: '#004aad18' }]}>
                <Calendar size={15} color="#004aad" strokeWidth={2} />
                <Text style={[styles.missionDateText, { color: '#004aad' }]}>
                  {formatDueDate(newMissionDueDate)}
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
                <Text style={[styles.missionDatePlaceholder, { color: colors.textMuted }]}>Add due date (optional)</Text>
              </TouchableOpacity>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel, { borderColor: colors.border }]}
                onPress={() => setShowAddMission(false)}
                activeOpacity={0.8}
              >
                <Text style={[styles.modalBtnCancelText, { color: colors.text }]}>Cancel</Text>
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
                  <Text style={styles.modalBtnConfirmText}>Add</Text>
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
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Project Complete — Payment Summary
            </Text>

            {feeData && (
              <>
                {/* Section 1 — Crew payments */}
                <Text style={[styles.modalSectionLabel, { color: colors.textMuted }]}>
                  Pay directly to your crew
                </Text>

                {feeData.slots.map((slot) => (
                  <View key={slot.professionalId} style={styles.feeRow}>
                    <Text style={[styles.feeName, { color: colors.text }]}>{slot.displayName}</Text>
                    <Text style={[styles.feeAmount, { color: colors.text }]}>
                      ${slot.amount.toLocaleString()}
                    </Text>
                  </View>
                ))}

                <View style={styles.feeRow}>
                  <Text style={[styles.feeLabel, { color: colors.textMuted }]}>Subtotal</Text>
                  <Text style={[styles.feeAmountBold, { color: colors.text }]}>
                    ${feeData.subtotal.toLocaleString()}
                  </Text>
                </View>

                <View style={[styles.feeDivider, { backgroundColor: colors.border }]} />

                {/* Section 2 — Platform fee */}
                <Text style={[styles.modalSectionLabel, { color: colors.textMuted }]}>
                  Platform fee
                </Text>

                <View style={styles.feeRow}>
                  <Text style={[styles.feeName, { color: colors.text }]}>
                    5% of project value
                  </Text>
                  <Text style={[styles.feeAmountBold, { color: '#004aad' }]}>
                    ${feeData.platformFee.toLocaleString()}
                  </Text>
                </View>
                <Text style={[styles.feePlatformNote, { color: colors.textMuted }]}>
                  Paid to BAMA for platform services
                </Text>
              </>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel, { borderColor: colors.border }]}
                onPress={() => setShowPaymentSummary(false)}
                activeOpacity={0.8}
              >
                <Text style={[styles.modalBtnCancelText, { color: colors.text }]}>Cancel</Text>
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
                  <Text style={styles.modalBtnConfirmText}>Confirm & Complete Project</Text>
                )}
              </TouchableOpacity>
            </View>

            {feeData && (
              <Text style={[styles.feeAgreementNote, { color: colors.textMuted }]}>
                By confirming, you agree to pay the platform fee of ${feeData.platformFee.toLocaleString()}
              </Text>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function MetaRow({ label, value, colors }: { label: string; value: string; colors: AppColors }) {
  return (
    <View style={styles.metaRow}>
      <Text style={[styles.metaLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.metaValue, { color: colors.text }]} numberOfLines={2}>{value}</Text>
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
}: {
  displayName: string;
  photoURL: string | null;
  role: string;
  badge?: string;
  colors: AppColors;
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
          <Text style={[styles.memberName, { color: colors.text }]}>{displayName}</Text>
          {badge !== undefined && (
            <View style={styles.clientBadge}>
              <Text style={styles.clientBadgeText}>{badge}</Text>
            </View>
          )}
        </View>
        <Text style={[styles.memberRole, { color: colors.textMuted }]}>{role}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#111', textAlign: 'center' },
  headerRight: { width: 40 },

  content: { padding: 16, gap: 12 },

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
  metaValue: { fontSize: 14, fontWeight: '500', flex: 1, textAlign: 'right' },

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
  paymentName: { fontSize: 14, fontWeight: '600' },
  paymentRole: { fontSize: 12 },
  paymentAmount: { fontSize: 15, fontWeight: '600' },
  paymentTotalLabel: { fontSize: 15, fontWeight: '700' },
  paymentTotalAmount: { fontSize: 17, fontWeight: '800' },

  comingSoonBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    borderStyle: 'dashed',
  },
  comingSoonText: { fontSize: 14, fontWeight: '500' },

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
    paddingVertical: 12,
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
  feeAgreementNote: { fontSize: 12, textAlign: 'center', marginTop: 4 },

  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  modalBtnCancel: { borderWidth: 1 },
  modalBtnCancelText: { fontSize: 15, fontWeight: '600' },
  modalBtnConfirm: { backgroundColor: '#004aad' },
  modalBtnConfirmText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
