import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Platform, FlatList,
} from 'react-native';
import { Screen } from '@components/layout/Screen';
import { CREW_CATEGORIES } from '@features/crew/data/categories';

const CATEGORY_META: Record<string, { label: string; emoji: string }> = {
  'Video Photographer': { label: 'Videographer', emoji: '🎥' },
  'Still Photographer': { label: 'Photographer', emoji: '📸' },
  'Editor': { label: 'Editor', emoji: '✂️' },
  'Graphic Designer': { label: 'Graphic Designer', emoji: '🎨' },
  'AI Specialist': { label: 'AI', emoji: '🤖' },
  'Social Media': { label: 'Social', emoji: '📱' },
  'Studio & Audio': { label: 'Studios', emoji: '🎵' },
  'Lighting Tech': { label: 'Lighting', emoji: '💡' },
  'Sound Recordist': { label: 'Sound', emoji: '🎤' },
};

const CATEGORIES = Object.entries(CREW_CATEGORIES).map(([key, subs]) => ({
  key,
  label: CATEGORY_META[key]?.label ?? key,
  emoji: CATEGORY_META[key]?.emoji ?? '•',
  subcategories: subs,
}));

type ViewState =
  | { kind: 'grid' }
  | { kind: 'subcategories'; category: (typeof CATEGORIES)[number] }
  | { kind: 'results'; category: string; subcategory: string };

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [view, setView] = useState<ViewState>({ kind: 'grid' });

  const gradientText = Platform.OS === 'web' ? ({
    background: 'linear-gradient(to right, #004aad, #cb6ce6)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  } as any) : {};

  function selectCategory(cat: (typeof CATEGORIES)[number]) {
    setView({ kind: 'subcategories', category: cat });
  }

  function selectSubcategory(subcategory: string) {
    if (view.kind !== 'subcategories') return;
    setView({ kind: 'results', category: view.category.label, subcategory });
  }

  function goBack() {
    if (view.kind === 'results') {
      setView({ kind: 'subcategories', category: CATEGORIES.find(c => c.label === (view as any).category)! });
    } else {
      setView({ kind: 'grid' });
    }
  }

  const filteredCategories = query.trim()
    ? CATEGORIES.filter(c =>
        c.label.toLowerCase().includes(query.toLowerCase()) ||
        c.subcategories.some(s => s.toLowerCase().includes(query.toLowerCase()))
      )
    : CATEGORIES;

  return (
    <Screen scrollable={false} backgroundColor="#0f0f1f">
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          {view.kind !== 'grid' && (
            <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>
          )}
          <Text style={[styles.heading, gradientText]}>
            {view.kind === 'grid' ? 'Search Professionals' :
             view.kind === 'subcategories' ? view.category.label :
             (view as any).subcategory}
          </Text>
          {view.kind !== 'grid' && <View style={styles.backBtn} />}
        </View>

        {/* Search bar */}
        {view.kind === 'grid' && (
          <View style={styles.searchRow}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by role, skill, or name…"
              placeholderTextColor="rgba(255,255,255,0.35)"
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')} activeOpacity={0.7}>
                <Text style={styles.clearBtn}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Grid view */}
        {view.kind === 'grid' && (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.gridContent}
            showsVerticalScrollIndicator={false}
          >
            {query.trim() === '' && (
              <Text style={styles.sectionLabel}>Browse by Category</Text>
            )}
            <View style={styles.grid}>
              {filteredCategories.map((cat) => (
                <TouchableOpacity
                  key={cat.key}
                  style={styles.tile}
                  onPress={() => selectCategory(cat)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.tileEmoji}>{cat.emoji}</Text>
                  <Text style={styles.tileLabel}>{cat.label}</Text>
                  <Text style={styles.tileCount}>{cat.subcategories.length} roles</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}

        {/* Subcategories view */}
        {view.kind === 'subcategories' && (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.subContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.subHint}>Select a specialization</Text>
            {view.category.subcategories.map((sub) => (
              <TouchableOpacity
                key={sub}
                style={styles.subRow}
                onPress={() => selectSubcategory(sub)}
                activeOpacity={0.8}
              >
                <Text style={styles.subLabel}>{sub}</Text>
                <Text style={styles.subArrow}>›</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Results view */}
        {view.kind === 'results' && (
          <View style={styles.flex}>
            <Text style={styles.resultsHint}>
              {(view as any).category} · {(view as any).subcategory}
            </Text>
            <View style={styles.emptyResults}>
              <Text style={styles.emptyIcon}>👤</Text>
              <Text style={styles.emptyText}>No professionals yet</Text>
              <Text style={styles.emptySubtext}>
                Professionals in this category will appear here once they set up their profile.
              </Text>
            </View>
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
  heading: { fontSize: 22, fontWeight: '800', color: '#fff', textAlign: 'center', flex: 1 },
  backBtn: { width: 60 },
  backText: { fontSize: 15, color: '#cb6ce6', fontWeight: '600' },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 14,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#ffffff18',
    gap: 8,
  },
  searchIcon: { fontSize: 16 },
  searchInput: { flex: 1, color: '#fff', fontSize: 15 },
  clearBtn: { fontSize: 14, color: 'rgba(255,255,255,0.4)', paddingHorizontal: 4 },

  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
    paddingHorizontal: 4,
  },

  gridContent: { paddingHorizontal: 16, paddingBottom: 40 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    width: '47%',
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#ffffff18',
    gap: 6,
    alignItems: 'flex-start',
  },
  tileEmoji: { fontSize: 28 },
  tileLabel: { fontSize: 15, fontWeight: '700', color: '#fff' },
  tileCount: { fontSize: 12, color: 'rgba(255,255,255,0.4)' },

  subContent: { paddingHorizontal: 16, paddingBottom: 40, gap: 0 },
  subHint: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#ffffff10',
  },
  subLabel: { fontSize: 16, color: '#fff', fontWeight: '500' },
  subArrow: { fontSize: 20, color: 'rgba(255,255,255,0.3)' },

  resultsHint: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
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
  emptyText: { fontSize: 18, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },
  emptySubtext: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    lineHeight: 20,
  },
});
