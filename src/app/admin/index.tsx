import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { getCountFromServer, collection, query, where, type Query } from 'firebase/firestore';
import { db } from '@core/firebase/config';
import { useTheme } from '@core/hooks/useTheme';
import { useAppFont } from '@core/hooks/useAppFont';

type Counts = {
  users: number | null;
  projects: number | null;
  courses: number | null;
  communities: number | null;
};

/** Count a query independently — a single failure returns null (rendered as
 *  "—") instead of throwing and zeroing every other stat. */
async function countOf(q: Query): Promise<number | null> {
  try {
    const snap = await getCountFromServer(q);
    return snap.data().count;
  } catch (e) {
    console.warn('[AdminDashboard] count query failed:', e);
    return null;
  }
}

export default function AdminDashboard() {
  const colors = useTheme();
  const font = useAppFont();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      // Communities live in `chats` with type == 'community' (there is no
      // `communities` collection); the filtered query is rules-permitted.
      const [users, projects, courses, communities] = await Promise.all([
        countOf(collection(db, 'users')),
        countOf(collection(db, 'projects')),
        countOf(collection(db, 'courses')),
        countOf(query(collection(db, 'chats'), where('type', '==', 'community'))),
      ]);
      setCounts({ users, projects, courses, communities });
      setLoading(false);
    }
    load().catch(() => setLoading(false));
  }, []);

  const stats: { label: string; key: keyof Counts }[] = [
    { label: 'Total Users', key: 'users' },
    { label: 'Total Projects', key: 'projects' },
    { label: 'Total Courses', key: 'courses' },
    { label: 'Total Communities', key: 'communities' },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={styles.container}
    >
      <Text style={[styles.title, { ...font.bold, color: colors.text }]}>
        Admin Dashboard
      </Text>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <View style={styles.grid}>
          {stats.map(({ label, key }) => (
            <View key={key} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.count, { ...font.bold, color: colors.primary }]}>
                {counts?.[key] ?? '—'}
              </Text>
              <Text style={[styles.label, { ...font.regular, color: colors.textSec }]}>
                {label}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 60 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 32 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  card: {
    width: '47%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
  },
  count: { fontSize: 36, fontWeight: '800' },
  label: { fontSize: 13, marginTop: 6, textAlign: 'center' },
});
