import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@components/layout/Screen';
import { ProjectRequestCard } from '@features/crew/components';
import { useProjectRequests } from '@features/crew/hooks';

export default function HomeScreen() {
  const { requests, isLoading } = useProjectRequests();

  return (
    <Screen scrollable={false}>
      <View style={styles.header}>
        <Text style={styles.title}>My Projects</Text>
        <TouchableOpacity
          style={styles.buildBtn}
          onPress={() => router.push('/(client)/(tabs)/home/builder')}
          activeOpacity={0.8}
        >
          <Text style={styles.buildBtnText}>Build Crew</Text>
        </TouchableOpacity>
      </View>
      {requests.length === 0 && !isLoading ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No projects yet.</Text>
          <Text style={styles.emptyHint}>
            Tap "Build Crew" to create your first request.
          </Text>
        </View>
      ) : (
        <FlatList
          style={styles.list}
          data={requests}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ProjectRequestCard request={item} />}
          contentContainerStyle={styles.listContent}
        />
      )}
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
  title: { fontSize: 24, fontWeight: '700', color: '#111' },
  buildBtn: {
    backgroundColor: '#111',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
  },
  buildBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#333' },
  emptyHint: { fontSize: 14, color: '#999', textAlign: 'center', paddingHorizontal: 32 },
  list: { flex: 1 },
  listContent: { paddingVertical: 8 },
});
