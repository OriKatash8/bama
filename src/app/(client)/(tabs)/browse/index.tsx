import { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, FlatList,
  StyleSheet, Platform, Animated, Easing, ActivityIndicator, Image,
} from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { ChevronRight, Search } from 'lucide-react-native';
import { Screen } from '@components/layout/Screen';
import { useTheme } from '@core/hooks/useTheme';
import { auth } from '@core/firebase/config';
import { CREW_CATEGORIES } from '@features/crew/data/categories';
import { useSearchProfessionals } from '@features/crew/hooks';
import { useUnifiedSearch } from '@features/crew/hooks/useUnifiedSearch';
import { ProfessionalCard } from '@features/crew/components';
import { getOrCreateDM } from '@features/chat/services/chatService';

const CATEGORY_IMAGE: Record<string, number> = {
  'Video Photographer': require('../../../../../assets/images/categories/videographer-blue.png'),
  'Still Photographer': require('../../../../../assets/images/categories/photographer.png'),
  'Editor':             require('../../../../../assets/images/categories/editor.png'),
  'Graphic Designer':   require('../../../../../assets/images/categories/graphic-designer.png'),
  'AI Specialist':      require('../../../../../assets/images/categories/ai.png'),
  'Social Media':       require('../../../../../assets/images/categories/social.png'),
  'Studio & Audio':     require('../../../../../assets/images/categories/studios.png'),
  'Lighting Tech':      require('../../../../../assets/images/categories/lighting.png'),
  'Sound Recordist':    require('../../../../../assets/images/categories/sound.png'),
};

const CATEGORIES = Object.entries(CREW_CATEGORIES).map(([key, subs]) => ({
  key,
  label: key,
  image: CATEGORY_IMAGE[key],
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
        <TouchableOpacity
          onPress={() => router.push(`/browse/profile/${item.user.id}` as any)}
          activeOpacity={0.95}
        >
          <ProfessionalCard
            item={item}
            onMessage={() => handleMessage(item.user.id)}
          />
        </TouchableOpacity>
      )}
    />
  );
}

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [view, setView] = useState<ViewState>({ kind: 'grid' });
  const colors = useTheme();
  const router = useRouter();
  const segments = useSegments();

  async function handleMessage(professionalId: string) {
    const currentUserId = auth.currentUser?.uid;
    if (!currentUserId) return;
    const chatId = await getOrCreateDM(currentUserId, professionalId);
    router.push(`/${segments[0]}/(tabs)/chats/${chatId}`);
  }

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

  const isSearching = query.trim().length > 0;
  const { results: unifiedResults, isLoading: unifiedLoading } = useUnifiedSearch(query);

  const filteredCategories = query.trim()
    ? CATEGORIES.filter(c =>
        c.label.toLowerCase().includes(query.toLowerCase()) ||
        c.subcategories.some(s => s.toLowerCase().includes(query.toLowerCase()))
      )
    : CATEGORIES;

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
          <View style={[styles.searchRow, { backgroundColor: '#ffffff', borderColor: colors.border }]}>
            <Search size={18} color={colors.placeholder} strokeWidth={2.5} />
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

        {view.kind === 'grid' && isSearching && (
          <View style={styles.flex}>
            {unifiedLoading ? (
              <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
            ) : unifiedResults.length > 0 ? (
              <FlatList
                data={unifiedResults}
                keyExtractor={(item) => item.user.id}
                contentContainerStyle={styles.resultsList}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => router.push(`/browse/profile/${item.user.id}` as any)}
                    activeOpacity={0.95}
                  >
                    <ProfessionalCard
                      item={item}
                      onMessage={() => handleMessage(item.user.id)}
                    />
                  </TouchableOpacity>
                )}
              />
            ) : (
              <View style={styles.emptyResults}>
                <Text style={styles.emptyIcon}>👤</Text>
                <Text style={[styles.emptyText, { color: colors.textSec }]}>No professionals found</Text>
                <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>
                  No results for "{query.trim()}"
                </Text>
              </View>
            )}
          </View>
        )}

        {view.kind === 'grid' && !isSearching && (
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
                <View key={cat.key} style={styles.categoryCard}>
                  <TouchableOpacity
                    style={styles.categoryCardRow}
                    onPress={() => toggleCategory(cat.key)}
                    activeOpacity={0.7}
                  >
                    {cat.image && (
                      <Image source={cat.image} style={styles.categoryIcon} />
                    )}
                    <Text style={styles.categoryLabel}>{cat.label}</Text>
                    <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
                      <ChevronRight size={18} color="#004aad" />
                    </Animated.View>
                  </TouchableOpacity>

                  <Animated.View style={{ maxHeight, opacity: subOpacity, overflow: 'hidden' }}>
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
    marginBottom: 24,
  },
  heading: { fontSize: 36, fontWeight: '800', fontFamily: 'Montserrat', textAlign: 'center', textTransform: 'uppercase', flex: 1 },
  backBtn: { width: 60 },
  backText: { fontSize: 15, fontWeight: '600' },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    marginHorizontal: 16,
    marginBottom: 48,
    paddingHorizontal: 14,
    height: 44,
    borderWidth: 1,
    gap: 8,
  },
searchInput: { flex: 1, fontSize: 15 },
  clearBtn: { fontSize: 14, paddingHorizontal: 4 },

  listContent: { paddingBottom: 100, alignItems: 'center' },

  categoryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 10,
    width: '100%',
    maxWidth: 600,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'hidden',
  },
  categoryCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    marginRight: 12,
  },
  categoryLabel: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    fontFamily: 'Montserrat',
    color: '#004aad',
  },

  subItem: {
    height: SUB_ITEM_HEIGHT,
    justifyContent: 'center',
    paddingLeft: 52,
    paddingRight: 16,
    borderTopWidth: 1,
    borderTopColor: '#004aad11',
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
  resultsList: { paddingHorizontal: 16, paddingBottom: 100 },

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
