import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { getDocument, queryDocuments, where } from '@core/firebase/firestore';
import { useTheme, type AppColors } from '@core/hooks/useTheme';
import type { FilledSlot, PriceOffer, ProjectRequest } from '@core/types/project';
import type { User } from '@core/types/user';

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

  const statusColor = STATUS_COLORS[project.status];
  const total = acceptedOffers.reduce((sum, o) => sum + o.price, 0);
  const filledSlots: FilledSlot[] = project.filledSlots ?? [];

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

        {/* SECTION 3 — Missions (placeholder) */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Missions</Text>
          <TouchableOpacity
            onPress={() => Alert.alert('Coming soon', 'Mission management is not available yet.')}
            activeOpacity={0.8}
          >
            <Text style={styles.addButtonText}>+ Add Mission</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.emptyNote, { color: colors.textMuted }]}>No missions yet</Text>

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
});
