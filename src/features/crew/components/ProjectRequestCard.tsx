import { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import type { ProjectRequest } from '@core/types/project';
import { useProjectTeam } from '@features/offers/hooks/useProjectTeam';

type Props = { request: ProjectRequest };

const STATUS_COLORS: Record<ProjectRequest['status'], string> = {
  open: '#2196F3',
  in_progress: '#FF9800',
  completed: '#4CAF50',
  cancelled: '#9E9E9E',
};

export function ProjectRequestCard({ request }: Props) {
  const [teamOpen, setTeamOpen] = useState(false);
  const { team, isLoading: teamLoading, load } = useProjectTeam(request.id);

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
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.title} numberOfLines={1}>{request.title}</Text>
        <View style={[styles.badge, { backgroundColor: STATUS_COLORS[request.status] }]}>
          <Text style={styles.badgeText}>{request.status.replace('_', ' ')}</Text>
        </View>
      </View>
      <Text style={styles.date}>{request.date}</Text>
      <Text style={styles.location}>{request.location}</Text>
      {crewSummary ? <Text style={styles.crew}>{crewSummary}</Text> : null}

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
            <ActivityIndicator size="small" color="#004aad" />
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
                      <Text style={styles.teamRole}>{slot.subcategory}</Text>
                      {member ? (
                        <Text style={styles.teamName}>{member.displayName} · ${member.price.toLocaleString()}</Text>
                      ) : (
                        <Text style={styles.teamOpen}>— Open</Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  title: { fontSize: 15, fontWeight: '700', color: '#111', flex: 1, marginRight: 8 },
  badge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  date: { fontSize: 13, color: '#555', marginBottom: 2 },
  location: { fontSize: 13, color: '#666', marginBottom: 4 },
  crew: { fontSize: 13, color: '#444', marginBottom: 4 },
  teamToggle: { marginTop: 8, alignSelf: 'flex-start' },
  teamToggleText: { fontSize: 13, color: '#004aad', fontWeight: '600' },
  teamSection: { marginTop: 10, gap: 8 },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  teamDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#004aad' },
  teamInfo: { flex: 1 },
  teamRole: { fontSize: 13, fontWeight: '600', color: '#111' },
  teamName: { fontSize: 12, color: '#555', marginTop: 1 },
  teamOpen: { fontSize: 12, color: '#bbb', marginTop: 1 },
});
