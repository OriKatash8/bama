import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Platform, Image,
} from 'react-native';
import { Screen } from '@components/layout/Screen';
import { useTheme } from '@core/hooks/useTheme';
import { CREW_CATEGORIES } from '@features/crew/data/categories';

const CATEGORY_META: Record<string, { label: string; image: ReturnType<typeof require> }> = {
  'Video Photographer': { label: 'Videographer', image: require('../../../../../assets/images/categories/videographer.png') },
  'Still Photographer': { label: 'Photographer', image: require('../../../../../assets/images/categories/photographer.png') },
  'Editor':             { label: 'Editor',        image: require('../../../../../assets/images/categories/editor.png') },
  'Graphic Designer':   { label: 'Graphic Designer', image: require('../../../../../assets/images/categories/graphic-designer.png') },
  'AI Specialist':      { label: 'AI',            image: require('../../../../../assets/images/categories/ai.png') },
  'Social Media':       { label: 'Social',        image: require('../../../../../assets/images/categories/social.png') },
  'Studio & Audio':     { label: 'Studios',       image: require('../../../../../assets/images/categories/studios.png') },
  'Lighting Tech':      { label: 'Lighting',      image: require('../../../../../assets/images/categories/lighting.png') },
  'Sound Recordist':    { label: 'Sound',         image: require('../../../../../assets/images/categories/sound.png') },
};

const CATEGORIES = Object.entries(CREW_CATEGORIES).map(([key, subs]) => ({
  key,
  label: CATEGORY_META[key]?.label ?? key,
  image: CATEGORY_META[key]?.image,
  subcategories: subs,
}));

type ViewState =
  | { kind: 'grid' }
  | { kind: 'subcategories'; category: (typeof CATEGORIES)[number] }
  | { kind: 'results'; category: string; subcategory: string };

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [view, setView] = useState<ViewState>({ kind: 'grid' });
  const colors = useTheme();

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
    <Screen scrollable={false}>
      <View style={styles.container}>
        <View style={styles.header}>
          {view.kind !== 'grid' && (
            <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
              <Text style={[styles.backText, { color: colors.accent }]}>← Back</Text>
            </TouchableOpacity>
          )}
          <Text style={[styles.heading, { color: colors.text }, gradientText]}>
            {view.kind === 'grid' ? 'Search Professionals' :
             view.kind === 'subcategories' ? view.category.label :
             (view as any).subcategory}
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

        {view.kind === 'grid' && (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.gridContent}
            showsVerticalScrollIndicator={false}
          >
            {query.trim() === '' && (
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Browse by Category</Text>
            )}
            <View style={styles.grid}>
              {filteredCategories.map((cat) => (
                <TouchableOpacity
                  key={cat.key}
                  style={[styles.tile, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => selectCategory(cat)}
                  activeOpacity={0.8}
                >
                  {cat.image ? (
                    <Image source={cat.image} style={styles.tileImage} resizeMode="cover" />
                  ) : null}
                  <Text style={[styles.tileLabel, { color: colors.text }]}>{cat.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}

        {view.kind === 'subcategories' && (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.subContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.subHint, { color: colors.textMuted }]}>Select a specialization</Text>
            {view.category.subcategories.map((sub) => (
              <TouchableOpacity
                key={sub}
                style={[styles.subRow, { borderBottomColor: colors.borderMuted }]}
                onPress={() => selectSubcategory(sub)}
                activeOpacity={0.8}
              >
                <Text style={[styles.subLabel, { color: colors.text }]}>{sub}</Text>
                <Text style={[styles.subArrow, { color: colors.textMuted }]}>›</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {view.kind === 'results' && (
          <View style={styles.flex}>
            <Text style={[styles.resultsHint, { color: colors.textMuted }]}>
              {(view as any).category} · {(view as any).subcategory}
            </Text>
            <View style={styles.emptyResults}>
              <Text style={styles.emptyIcon}>👤</Text>
              <Text style={[styles.emptyText, { color: colors.textSec }]}>No professionals yet</Text>
              <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>
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

  gridContent: { paddingHorizontal: 16, paddingBottom: 40 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    width: '47%',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    aspectRatio: 1,
  },
  tileImage: {
    width: '100%',
    height: '75%',
  },
  tileLabel: {
    fontSize: 14,
    fontWeight: '700',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },

  subContent: { paddingHorizontal: 16, paddingBottom: 40, gap: 0 },
  subHint: {
    fontSize: 13,
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
  },
  subLabel: { fontSize: 16, fontWeight: '500' },
  subArrow: { fontSize: 20 },

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
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
