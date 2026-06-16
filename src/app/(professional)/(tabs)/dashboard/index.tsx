import { useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { Screen } from '@components/layout/Screen';
import { NoticeBoardCard } from '@features/noticeboard/components/NoticeBoardCard';
import { ProjectDetailModal } from '@features/noticeboard/components/ProjectDetailModal';
import { useNoticeboard } from '@features/noticeboard/hooks/useNoticeboard';
import { useUiStore } from '@core/stores/uiStore';
import type { ProjectRequest } from '@core/types/project';

export default function DashboardScreen() {
  const { requests, isLoading } = useNoticeboard();
  const { showToast } = useUiStore();

  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<ProjectRequest | null>(null);

  const visible = requests.filter((r) => !dismissed.has(r.id));

  function dismiss(id: string) {
    setDismissed((prev) => new Set([...prev, id]));
    if (selected?.id === id) setSelected(null);
  }

  function handleApply(request: ProjectRequest) {
    showToast('Offer submitted!', 'success');
    dismiss(request.id);
  }

  const gradientText = Platform.OS === 'web' ? ({
    background: 'linear-gradient(to right, #004aad, #cb6ce6)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  } as any) : {};

  return (
    <Screen scrollable={false} backgroundColor="#0f0f1f">
      <View style={styles.bamaWrap}>
        {Platform.OS === 'web' && (
          <View style={styles.bamaGlow as any}>
            <Text style={[styles.bamaText, { color: '#9b6ff5' }, { filter: 'blur(8px)', opacity: 0.55 } as any]}>BAMA</Text>
          </View>
        )}
        <Text
          style={[
            styles.bamaText,
            Platform.OS === 'web' && ({
              background: 'linear-gradient(to right, #004aad, #cb6ce6)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            } as any),
          ]}
        >
          BAMA
        </Text>
      </View>

      <View style={styles.header}>
        <Text style={[styles.heading, gradientText]}>Notice Board</Text>
        {!isLoading && <Text style={styles.count}>{visible.length} open project{visible.length === 1 ? '' : 's'}</Text>}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#cb6ce6" />
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
              onApply={() => setSelected(item)}
              onDismiss={() => dismiss(item.id)}
              isApplying={false}
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
        isApplying={false}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  bamaWrap: { alignItems: 'center', width: '100%', paddingTop: 16 },
  bamaGlow: { position: 'absolute', top: 16, left: 0, right: 0, alignItems: 'center' },
  bamaText: { fontSize: 80, fontWeight: '900', color: '#004aad', textAlign: 'center', fontFamily: 'PeaceSans' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  heading: { fontSize: 24, fontWeight: '800', color: '#fff' },
  count: { fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: '500' },
  list: { paddingVertical: 8, paddingBottom: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyIcon: { fontSize: 48, marginBottom: 8 },
  emptyText: { fontSize: 17, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  emptySubtext: { fontSize: 14, color: 'rgba(255,255,255,0.4)' },
});
