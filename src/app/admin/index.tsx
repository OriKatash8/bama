import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { getCountFromServer, collection, query, where, type Query } from 'firebase/firestore';
import { BookOpen, Users, ShoppingBag, ChevronRight } from 'lucide-react-native';
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

const MANAGE: { label: string; route: '/admin/courses' | '/admin/communities' | '/admin/marketplace'; icon: typeof BookOpen }[] = [
  { label: 'Courses', route: '/admin/courses', icon: BookOpen },
  { label: 'Communities', route: '/admin/communities', icon: Users },
  { label: 'Marketplace', route: '/admin/marketplace', icon: ShoppingBag },
];

export default function AdminDashboard() {
  const colors = useTheme();
  const font = useAppFont();
  const router = useRouter();
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

      {/* Manage — sections moved off the tab bar */}
      <Text style={[styles.sectionTitle, { ...font.semiBold, color: colors.text }]}>Manage</Text>
      <View style={styles.manageList}>
        {MANAGE.map(({ label, route, icon: Icon }) => (
          <TouchableOpacity
            key={route}
            style={[styles.manageRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.push(route)}
            activeOpacity={0.8}
          >
            <View style={[styles.manageIcon, { backgroundColor: colors.primary + '18' }]}>
              <Icon size={20} color={colors.primary} strokeWidth={2.2} />
            </View>
            <Text style={[styles.manageLabel, { ...font.semiBold, color: colors.text }]}>{label}</Text>
            <ChevronRight size={20} color={colors.textMuted} strokeWidth={2} />
          </TouchableOpacity>
        ))}
      </View>
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
  sectionTitle: { fontSize: 18, marginTop: 32, marginBottom: 12 },
  manageList: { gap: 12 },
  manageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  manageIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  manageLabel: { flex: 1, fontSize: 16 },
});
