import { useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { Screen } from '@components/layout/Screen';
import { NoticeBoardCard } from '@features/noticeboard/components/NoticeBoardCard';
import { ProjectDetailModal } from '@features/noticeboard/components/ProjectDetailModal';
import { useNoticeboard } from '@features/noticeboard/hooks/useNoticeboard';
import { useProjectApplication } from '@features/noticeboard/hooks/useProjectApplication';
import { useUiStore } from '@core/stores/uiStore';
import type { ProjectRequest } from '@core/types/project';

export default function DashboardScreen() {
  const { requests, isLoading } = useNoticeboard();
  const { apply, applying } = useProjectApplication();
  const { showToast } = useUiStore();

  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<ProjectRequest | null>(null);

  const visible = requests.filter((r) => !dismissed.has(r.id));

  function dismiss(id: string) {
    setDismissed((prev) => new Set([...prev, id]));
    if (selected?.id === id) setSelected(null);
  }

  async function handleApply(request: ProjectRequest) {
    try {
      await apply(request.id);
      showToast('Application sent!', 'success');
      dismiss(request.id);
    } catch {
      showToast('Failed to send application.', 'error');
    }
  }

  return (
    <Screen scrollable={false}>
      <View style={styles.header}>
        <Text style={styles.heading}>Notice Board</Text>
        {!isLoading && <Text style={styles.count}>{visible.length} open project{visible.length === 1 ? '' : 's'}</Text>}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#004aad" />
        </View>
      ) : visible.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyText}>No open projects right now</Text>
          <Text style={styles.emptySubtext}>Check back later for new opportunities</Text>
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <NoticeBoardCard
              request={item}
              onPress={() => setSelected(item)}
              onApply={() => handleApply(item)}
              onDismiss={() => dismiss(item.id)}
              isApplying={applying === item.id}
            />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      <ProjectDetailModal
        request={selected}
        onClose={() => setSelected(null)}
        onApply={() => selected && handleApply(selected)}
        onDismiss={() => selected && dismiss(selected.id)}
        isApplying={applying === selected?.id}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  heading: { fontSize: 24, fontWeight: '800', color: '#111' },
  count: { fontSize: 13, color: '#888', fontWeight: '500' },
  list: { paddingVertical: 8, paddingBottom: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyIcon: { fontSize: 48, marginBottom: 8 },
  emptyText: { fontSize: 17, fontWeight: '600', color: '#333' },
  emptySubtext: { fontSize: 14, color: '#888' },
});
