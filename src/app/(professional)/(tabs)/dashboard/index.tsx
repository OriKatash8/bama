import { useState, useMemo } from 'react';
import { View, Text, Image, FlatList, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { Screen } from '@components/layout/Screen';
import { NoticeBoardCard } from '@features/noticeboard/components/NoticeBoardCard';
import { ProjectDetailModal } from '@features/noticeboard/components/ProjectDetailModal';
import { useNoticeboard } from '@features/noticeboard/hooks/useNoticeboard';
import { useProfile } from '@features/profile/hooks/useProfile';
import { useUiStore } from '@core/stores/uiStore';
import { useTheme } from '@core/hooks/useTheme';
import type { ProjectRequest } from '@core/types/project';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 4 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  if (hour >= 18 && hour < 22) return 'Good evening';
  return 'Good night';
}

export default function DashboardScreen() {
  const { user, profile, isLoading: profileLoading } = useProfile();

  const categories = useMemo(
    () => [...new Set((profile?.skills ?? []).map(s => s.category))],
    [profile?.skills]
  );

  const { requests, posters, isLoading: boardLoading } = useNoticeboard(categories);
  const isLoading = profileLoading || boardLoading;

  const { showToast } = useUiStore();
  const colors = useTheme();

  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<ProjectRequest | null>(null);
  const [selectedView, setSelectedView] = useState<'details' | 'bid'>('details');

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

  const greeting = getGreeting();

  return (
    <Screen scrollable={false}>
      <View style={styles.topBar}>
        <View style={styles.logoWrap}>
          <Image source={require('../../../../../assets/images/bama-logo.png')} style={styles.bamaLogo} resizeMode="contain" />
        </View>
        <View style={styles.rightCol}>
          {user?.photoURL ? (
            <Image source={{ uri: user.photoURL }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarInitial}>{user?.displayName?.charAt(0).toUpperCase() ?? '?'}</Text>
            </View>
          )}
          <Text style={[styles.greetText, { color: colors.text }, gradientText]} numberOfLines={2}>
            {greeting}, {user?.displayName} :)
          </Text>
        </View>
      </View>

      <View style={styles.header}>
        <Text style={[styles.heading, { color: colors.text }, gradientText]}>Notice Board</Text>
        {!isLoading && <Text style={[styles.count, { color: colors.textMuted }]}>{visible.length} open project{visible.length === 1 ? '' : 's'}</Text>}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#cb6ce6" />
        </View>
      ) : visible.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={[styles.emptyText, { color: colors.textSec }]}>No open projects right now</Text>
          <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>Check back later for new opportunities</Text>
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <NoticeBoardCard
              request={item}
              poster={posters[item.clientId]}
              onPress={() => { setSelectedView('details'); setSelected(item); }}
              onApply={() => { setSelectedView('details'); setSelected(item); }}
              onMakeOffer={() => { setSelectedView('bid'); setSelected(item); }}
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
        initialView={selectedView}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingLeft: 0,
    paddingRight: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  rightCol: {
    alignItems: 'flex-end',
    gap: 8,
    flexShrink: 0,
  },
  logoWrap: { flex: 1, alignItems: 'flex-start', justifyContent: 'center', marginLeft: -130 },
  bamaLogo: { width: 640, height: 224 },
  greetText: { fontSize: 26, fontWeight: '600', textAlign: 'right' },
  avatar: { width: 152, height: 152, borderRadius: 76 },
  avatarFallback: { backgroundColor: '#004aad', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#fff', fontSize: 64, fontWeight: '700' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 8,
  },
  heading: { fontSize: 32, fontWeight: '800' },
  count: { fontSize: 13, fontWeight: '500' },
  list: { paddingVertical: 8, paddingBottom: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyIcon: { fontSize: 48, marginBottom: 8 },
  emptyText: { fontSize: 17, fontWeight: '600' },
  emptySubtext: { fontSize: 14 },
});
