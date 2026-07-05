import { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, FlatList,
  StyleSheet, Platform, Animated, Easing, ActivityIndicator, Image,
} from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { Screen } from '@components/layout/Screen';
import { useTheme } from '@core/hooks/useTheme';
import { auth } from '@core/firebase/config';
import { useAuth } from '@core/hooks/useAuth';
import { CREW_CATEGORIES } from '@features/crew/data/categories';
import { useSearchProfessionals } from '@features/crew/hooks';
import { ProfessionalCard } from '@features/crew/components';
import { getOrCreateDM } from '@features/chat/services/chatService';

function getGreeting() {
  const hour = new Date().getHours();
  if (hour >= 4 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  if (hour >= 18 && hour < 22) return 'Good evening';
  return 'Hey';
}

const CATEGORIES = Object.entries(CREW_CATEGORIES).map(([key, subs]) => ({
  key,
  label: key,
  subcategories: subs,
}));

const SUB_ITEM_HEIGHT = 46;

type ViewState =
  | { kind: 'grid' }
  | { kind: 'results'; category: string; subcategory: string };

function ResultsView({ category, subcategory }: { category: string; subcategory: string }) {
  const { results, isLoading } = useSearchProfessionals(category, subcategory);
  const colors = useTheme();
  const router = useRouter();
  const segments = useSegments();

  async function handleMessage(professionalId: string) {
    const currentUserId = auth.currentUser?.uid;
    if (!currentUserId) return;
    const chatId = await getOrCreateDM(currentUserId, professionalId);
    router.push(`/${segments[0]}/(tabs)/chats/${chatId}`);
  }

  if (isLoading) {
    return <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />;
  }
  if (results.length === 0) {
    return (
      <View style={styles.emptyResults}>
        <Text style={styles.emptyIcon}>👤</Text>
        <Text style={[styles.emptyText, { color: colors.textSec }]}>No professionals yet</Text>
        <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>
          Professionals in this category will appear here once they set up their profile.
        </Text>
      </View>
    );
  }
  return (
    <FlatList
      data={results}
      keyExtractor={(item) => item.user.id}
      contentContainerStyle={styles.resultsList}
      showsVerticalScrollIndicator={false}
      renderItem={({ item }) => (
        <ProfessionalCard
          item={item}
          onMessage={() => handleMessage(item.user.id)}
        />
      )}
    />
  );
}

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [view, setView] = useState<ViewState>({ kind: 'grid' });
  const colors = useTheme();
  const { user } = useAuth();
  const greeting = getGreeting();

  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const animValues = useRef<Record<string, Animated.Value>>(
    Object.fromEntries(CATEGORIES.map(c => [c.key, new Animated.Value(0)]))
  ).current;

  function toggleCategory(key: string) {
    const isExpanding = expandedCategory !== key;

    if (expandedCategory && expandedCategory !== key) {
      Animated.timing(animValues[expandedCategory], {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: false,
      }).start();
    }

    Animated.timing(animValues[key], {
      toValue: isExpanding ? 1 : 0,
      duration: isExpanding ? 280 : 200,
      easing: isExpanding ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: false,
    }).start();

    setExpandedCategory(isExpanding ? key : null);
  }

  const gradientText = Platform.OS === 'web' ? ({
    background: 'linear-gradient(to right, #004aad, #cb6ce6)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  } as any) : {};

  const filteredCategories = query.trim()
    ? CATEGORIES.filter(c =>
        c.label.toLowerCase().includes(query.toLowerCase()) ||
        c.subcategories.some(s => s.toLowerCase().includes(query.toLowerCase()))
      )
    : CATEGORIES;

  function getSearchTarget(): { category: string; subcategory: string } | null {
    if (!query.trim()) return null;
    const q = query.toLowerCase();
    for (const [cat, subs] of Object.entries(CREW_CATEGORIES)) {
      for (const sub of subs) {
        if (sub.toLowerCase().includes(q) || q.includes(sub.toLowerCase())) {
          return { category: cat, subcategory: sub };
        }
      }
      if (cat.toLowerCase().includes(q)) {
        return { category: cat, subcategory: CREW_CATEGORIES[cat as keyof typeof CREW_CATEGORIES][0] };
      }
    }
    return null;
  }

  const searchTarget = getSearchTarget();

  return (
    <Screen scrollable={false}>
      <View style={styles.container}>
        <View style={styles.header}>
          {view.kind !== 'grid' && (
            <TouchableOpacity onPress={() => setView({ kind: 'grid' })} style={styles.backBtn} activeOpacity={0.7}>
              <Text style={[styles.backText, { color: colors.accent }]}>← Back</Text>
            </TouchableOpacity>
          )}
          <Text style={[styles.heading, { color: colors.text }, gradientText]}>
            {view.kind === 'grid' ? 'Search Professionals' : (view as any).subcategory}
          </Text>
          {view.kind !== 'grid' && <View style={styles.backBtn} />}
        </View>

        {view.kind === 'grid' && (
          <View style={[styles.searchRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search by role, skill, or name…"
              placeholderTextColor={colors.placeholder}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')} activeOpacity={0.7}>
                <Text style={[styles.clearBtn, { color: colors.textMuted }]}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {view.kind === 'grid' && query.trim() !== '' && searchTarget && (
          <View style={[styles.searchHintRow, { backgroundColor: colors.accent + '15', borderColor: colors.accent + '40' }]}>
            <Text style={[styles.searchHintText, { color: colors.accent }]}>
              Showing professionals for "{searchTarget.subcategory}"
            </Text>
          </View>
        )}

        {view.kind === 'grid' && query.trim() !== '' && searchTarget && (
          <View style={styles.flex}>
            <ResultsView category={searchTarget.category} subcategory={searchTarget.subcategory} />
          </View>
        )}

        {view.kind === 'grid' && !searchTarget && (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {filteredCategories.map((cat) => {
              const animVal = animValues[cat.key];
              const maxHeight = animVal.interpolate({
                inputRange: [0, 1],
                outputRange: [0, cat.subcategories.length * SUB_ITEM_HEIGHT],
              });
              const chevronRotate = animVal.interpolate({
                inputRange: [0, 1],
                outputRange: ['0deg', '90deg'],
              });
              const subOpacity = animVal.interpolate({
                inputRange: [0, 0.4, 1],
                outputRange: [0, 0, 1],
              });

              return (
                <View key={cat.key}>
                  <TouchableOpacity
                    style={styles.categoryRow}
                    onPress={() => toggleCategory(cat.key)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.categoryLabel}>{cat.label}</Text>
                    <Animated.Text style={[styles.categoryChevron, { transform: [{ rotate: chevronRotate }] }]}>
                      ›
                    </Animated.Text>
                  </TouchableOpacity>

                  <Animated.View style={[styles.subList, { maxHeight, opacity: subOpacity, overflow: 'hidden' }]}>
                    {cat.subcategories.map((sub) => (
                      <TouchableOpacity
                        key={sub}
                        style={styles.subItem}
                        onPress={() => setView({ kind: 'results', category: cat.key, subcategory: sub })}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.subItemText}>{sub}</Text>
                      </TouchableOpacity>
                    ))}
                  </Animated.View>
                </View>
              );
            })}
            {filteredCategories.length === 0 && (
              <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 32, fontFamily: 'Montserrat' }}>
                No categories match "{query}"
              </Text>
            )}
          </ScrollView>
        )}

        {view.kind === 'results' && (
          <View style={styles.flex}>
            <Text style={[styles.resultsHint, { color: colors.textMuted }]}>
              {(view as any).category} · {(view as any).subcategory}
            </Text>
            <ResultsView category={(view as any).category} subcategory={(view as any).subcategory} />
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 16 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingRight: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  logoWrap: { flex: 1, alignItems: 'flex-start', justifyContent: 'center', marginLeft: -130 },
  bamaLogo: { width: 640, height: 224 },
  rightCol: { alignItems: 'flex-end', gap: 8, flexShrink: 0 },
  greetText: { fontSize: 26, fontWeight: '600', textAlign: 'right' },
  avatar: { width: 152, height: 152, borderRadius: 76 },
  avatarFallback: { backgroundColor: '#004aad', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#fff', fontSize: 64, fontWeight: '700' },
  flex: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  heading: { fontSize: 22, fontWeight: '800', textAlign: 'center', flex: 1 },
  backBtn: { width: 60 },
  backText: { fontSize: 15, fontWeight: '600' },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    gap: 8,
  },
  searchIcon: { fontSize: 16 },
  searchInput: { flex: 1, fontSize: 15 },
  clearBtn: { fontSize: 14, paddingHorizontal: 4 },

  listContent: { paddingHorizontal: 16, paddingBottom: 24 },

  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#004aad33',
  },
  categoryLabel: {
    fontSize: 17,
    fontWeight: '700',
    fontFamily: 'Montserrat',
    color: '#004aad',
  },
  categoryChevron: {
    fontSize: 22,
    color: '#004aad',
    fontWeight: '600',
  },

  subList: {
    marginLeft: 16,
    borderLeftWidth: 2,
    borderLeftColor: '#004aad',
    marginBottom: 4,
  },
  subItem: {
    height: SUB_ITEM_HEIGHT,
    justifyContent: 'center',
    paddingLeft: 16,
    paddingRight: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#004aad22',
  },
  subItemText: {
    fontSize: 15,
    fontWeight: '500',
    fontFamily: 'Montserrat',
    color: '#004aad',
  },

  searchHintRow: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchHintText: { fontSize: 13, fontWeight: '600' },
  resultsList: { paddingHorizontal: 16, paddingBottom: 24 },

  resultsHint: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  emptyResults: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 40,
  },
  emptyIcon: { fontSize: 52, marginBottom: 4 },
  emptyText: { fontSize: 18, fontWeight: '700' },
  emptySubtext: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
