import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { getCountFromServer, collection } from 'firebase/firestore';
import { db } from '@core/firebase/config';
import { useTheme } from '@core/hooks/useTheme';
import { useAppFont } from '@core/hooks/useAppFont';

type Counts = {
  users: number;
  projects: number;
  courses: number;
  communities: number;
};

export default function AdminDashboard() {
  const colors = useTheme();
  const font = useAppFont();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [users, projects, courses, communities] = await Promise.all([
        getCountFromServer(collection(db, 'users')),
        getCountFromServer(collection(db, 'projects')),
        getCountFromServer(collection(db, 'courses')),
        getCountFromServer(collection(db, 'communities')),
      ]);
      setCounts({
        users: users.data().count,
        projects: projects.data().count,
        courses: courses.data().count,
        communities: communities.data().count,
      });
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
                {counts?.[key] ?? 0}
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
