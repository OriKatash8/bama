import { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import type { ProjectRequest } from '@core/types/project';
import { useProjectTeam } from '@features/offers/hooks/useProjectTeam';
import { useTheme } from '@core/hooks/useTheme';
import { deleteDocument } from '@core/firebase/firestore';
import { useUiStore } from '@core/stores/uiStore';

type Props = { request: ProjectRequest };

const STATUS_COLORS: Record<ProjectRequest['status'], string> = {
  open: '#2196F3',
  in_progress: '#FF9800',
  completed: '#4CAF50',
  cancelled: '#9E9E9E',
};

export function ProjectRequestCard({ request }: Props) {
  const [teamOpen, setTeamOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { team, isLoading: teamLoading, load } = useProjectTeam(request.id);
  const colors = useTheme();
  const { showToast } = useUiStore();

  function handleEdit() {
    router.navigate({
      pathname: '/(client)/(tabs)/home' as any,
      params: { projectId: request.id },
    });
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await deleteDocument(`projects/${request.id}`);
      showToast('Project deleted', 'success');
    } catch (e: any) {
      showToast(e?.message ?? 'Failed to delete project', 'error');
    } finally {
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  }

  const firstTwo = request.crewSlots.slice(0, 2);
  const overflow = request.crewSlots.length - 2;
  const crewSummary = [
    ...firstTwo.map((s) => `${s.quantity}× ${s.subcategory}`),
    overflow > 0 ? `+${overflow} more` : null,
  ]
    .filter(Boolean)
    .join(', ');

  function toggleTeam() {
    const next = !teamOpen;
    setTeamOpen(next);
    if (next) load();
  }

  const filledCount = request.filledSlots?.length ?? 0;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.row}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{request.title}</Text>
        <View style={[styles.badge, { backgroundColor: STATUS_COLORS[request.status] }]}>
          <Text style={styles.badgeText}>{request.status.replace('_', ' ')}</Text>
        </View>
      </View>
      <Text style={[styles.date, { color: colors.textSec }]}>
        {request.exec ?? (request as any).date ?? ''}
        {request.deadline ? `  ·  Deadline: ${request.deadline}` : ''}
      </Text>
      <Text style={[styles.location, { color: colors.textSec }]}>{request.location}</Text>
      {crewSummary ? <Text style={[styles.crew, { color: colors.textSec }]}>{crewSummary}</Text> : null}

      {filledCount > 0 && (
        <TouchableOpacity onPress={toggleTeam} style={styles.teamToggle} activeOpacity={0.7}>
          <Text style={styles.teamToggleText}>
            {teamOpen ? '▴' : '▾'} Team ({filledCount})
          </Text>
        </TouchableOpacity>
      )}

      {teamOpen && (
        <View style={styles.teamSection}>
          {teamLoading ? (
            <ActivityIndicator size="small" color="#cb6ce6" />
          ) : (
            <>
              {request.crewSlots.map((slot, i) => {
                const filled = request.filledSlots?.find(
                  (f) => f.category === slot.category && f.subcategory === slot.subcategory
                );
                const member = team.find(
                  (m) => m.professionalId === filled?.professionalId && m.subcategory === slot.subcategory
                );
                return (
                  <View key={i} style={styles.teamRow}>
                    <View style={styles.teamDot} />
                    <View style={styles.teamInfo}>
                      <Text style={[styles.teamRole, { color: colors.text }]}>{slot.subcategory}</Text>
                      {member ? (
                        <Text style={[styles.teamName, { color: colors.textSec }]}>{member.displayName} · ${member.price.toLocaleString()}</Text>
                      ) : (
                        <Text style={[styles.teamOpen, { color: colors.textMuted }]}>— Open</Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </>
          )}
        </View>
      )}

      {request.status === 'open' && !confirmDelete && (
        <View style={[styles.actionRow, { borderTopColor: colors.border }]}>
          <TouchableOpacity onPress={handleEdit} activeOpacity={0.7}>
            <Text style={[styles.actionText, { color: colors.accent }]}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setConfirmDelete(true)} activeOpacity={0.7}>
            <Text style={[styles.actionText, { color: '#e53e3e' }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}

      {request.status === 'open' && confirmDelete && (
        <View style={[styles.confirmRow, { borderTopColor: colors.border, backgroundColor: '#fef2f2' }]}>
          <Text style={styles.confirmText}>Delete this project?</Text>
          <View style={styles.confirmBtns}>
            <TouchableOpacity onPress={() => setConfirmDelete(false)} activeOpacity={0.7} disabled={isDeleting}>
              <Text style={[styles.actionText, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDelete} activeOpacity={0.7} disabled={isDeleting}>
              {isDeleting
                ? <ActivityIndicator size="small" color="#e53e3e" />
                : <Text style={[styles.actionText, { color: '#e53e3e' }]}>Yes, Delete</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    padding: 16,
    marginVertical: 6,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  title: { fontSize: 15, fontWeight: '700', flex: 1, marginRight: 8 },
  badge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  date: { fontSize: 13, marginBottom: 2 },
  location: { fontSize: 13, marginBottom: 4 },
  crew: { fontSize: 13, marginBottom: 4 },
  teamToggle: { marginTop: 8, alignSelf: 'flex-start' },
  teamToggleText: { fontSize: 13, color: '#cb6ce6', fontWeight: '600' },
  teamSection: { marginTop: 10, gap: 8 },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  teamDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#cb6ce6' },
  teamInfo: { flex: 1 },
  teamRole: { fontSize: 13, fontWeight: '600' },
  teamName: { fontSize: 12, marginTop: 1 },
  teamOpen: { fontSize: 12, marginTop: 1 },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  actionText: { fontSize: 13, fontWeight: '700' },
  confirmRow: {
    marginTop: 12,
    paddingTop: 10,
    paddingHorizontal: 10,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderRadius: 8,
    gap: 8,
  },
  confirmText: { fontSize: 13, fontWeight: '600', color: '#e53e3e' },
  confirmBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16 },
});
