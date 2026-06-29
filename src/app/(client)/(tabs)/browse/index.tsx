import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, FlatList,
  StyleSheet, Platform, LayoutAnimation, UIManager, ActivityIndicator,
} from 'react-native';
import { Screen } from '@components/layout/Screen';
import { useTheme } from '@core/hooks/useTheme';
import { CREW_CATEGORIES } from '@features/crew/data/categories';
import { useSearchProfessionals } from '@features/crew/hooks';
import { ProfessionalCard } from '@features/crew/components';

const CATEGORIES = Object.entries(CREW_CATEGORIES).map(([key, subs]) => ({
  key,
  label: key,
  subcategories: subs,
}));

type ViewState =
  | { kind: 'grid' }
  | { kind: 'results'; category: string; subcategory: string };

function ResultsView({ category, subcategory }: { category: string; subcategory: string }) {
  const { results, isLoading } = useSearchProfessionals(category, subcategory);
  const colors = useTheme();

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
      renderItem={({ item }) => <ProfessionalCard item={item} />}
    />
  );
}

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [view, setView] = useState<ViewState>({ kind: 'grid' });
  const colors = useTheme();

  if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }

  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  function toggleCategory(key: string) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedCategory(prev => (prev === key ? null : key));
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

  // Derive a category+subcategory from free-text query for direct professional search
  function getSearchTarget(): { category: string; subcategory: string } | null {
    if (!query.trim()) return null;
    const q = query.toLowerCase();
    for (const [cat, subs] of Object.entries(CREW_CATEGORIES)) {
      for (const sub of subs) {
        if (sub.toLowerCase().includes(q) || q.includes(sub.toLowerCase())) {
          return { category: cat, subcategory: sub };
        }
      }
      // Also match on category name
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

  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
    paddingHorizontal: 4,
  },

  gridContent: { paddingHorizontal: 16, paddingBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  tileImage: { width: '100%', height: '100%', position: 'absolute' },
  tileOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 4,
    paddingHorizontal: 5,
  },
  tileLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: '#004aad',
    textAlign: 'center',
    textShadowColor: 'rgba(255,255,255,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
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

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  panel: {
    width: '100%',
    maxHeight: '80%',
    borderRadius: 24,
    borderWidth: 2,
    overflow: 'hidden',
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  panelTitle: { fontSize: 20, fontWeight: '800' },
  closeBtn: { fontSize: 18, fontWeight: '600' },
  panelDivider: { height: 2, marginHorizontal: 20, borderRadius: 1, marginBottom: 4 },
  panelScroll: { maxHeight: 400 },
  subHint: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  subLabel: { fontSize: 16, fontWeight: '500' },
  subArrow: { fontSize: 20 },
});
