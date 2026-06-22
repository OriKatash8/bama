import { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Platform, Image, useWindowDimensions,
  Modal, Animated, TouchableWithoutFeedback,
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
  | { kind: 'results'; category: string; subcategory: string };

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [view, setView] = useState<ViewState>({ kind: 'grid' });
  const [selectedCategory, setSelectedCategory] = useState<typeof CATEGORIES[number] | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const colors = useTheme();
  const { width } = useWindowDimensions();
  const tileSize = (width - 32 - 16) / 3;

  const scaleAnim = useRef(new Animated.Value(0.3)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const gradientText = Platform.OS === 'web' ? ({
    background: 'linear-gradient(to right, #004aad, #cb6ce6)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  } as any) : {};

  function openCategory(cat: typeof CATEGORIES[number]) {
    setSelectedCategory(cat);
    setModalVisible(true);
    scaleAnim.setValue(0.3);
    opacityAnim.setValue(0);
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 180 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }

  function closeModal() {
    Animated.parallel([
      Animated.timing(scaleAnim, { toValue: 0.3, duration: 150, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
    ]).start(() => {
      setModalVisible(false);
      setSelectedCategory(null);
    });
  }

  function selectSubcategory(subcategory: string) {
    if (!selectedCategory) return;
    const category = selectedCategory.label;
    closeModal();
    setTimeout(() => {
      setView({ kind: 'results', category, subcategory });
    }, 160);
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
                  style={[styles.tile, { backgroundColor: colors.card, borderColor: colors.border, width: tileSize }]}
                  onPress={() => openCategory(cat)}
                  activeOpacity={0.8}
                >
                  {cat.image ? (
                    <Image source={cat.image} style={[styles.tileImage, { height: tileSize * 0.65 }]} resizeMode="cover" />
                  ) : null}
                  <Text style={[styles.tileLabel, { color: colors.text }]}>{cat.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
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

      <Modal visible={modalVisible} transparent animationType="none" onRequestClose={closeModal}>
        <TouchableWithoutFeedback onPress={closeModal}>
          <View style={styles.backdrop}>
            <TouchableWithoutFeedback>
              <Animated.View
                style={[
                  styles.panel,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.accent,
                    transform: [{ scale: scaleAnim }],
                    opacity: opacityAnim,
                  },
                  Platform.OS === 'web' && ({ boxShadow: '0 0 48px #7b4fd488' } as any),
                ]}
              >
                <View style={styles.panelHeader}>
                  <Text style={[styles.panelTitle, { color: colors.text }]}>
                    {selectedCategory?.label}
                  </Text>
                  <TouchableOpacity onPress={closeModal} hitSlop={12} activeOpacity={0.7}>
                    <Text style={[styles.closeBtn, { color: colors.textMuted }]}>✕</Text>
                  </TouchableOpacity>
                </View>

                <View style={[styles.panelDivider, { backgroundColor: colors.accent }]} />

                <ScrollView showsVerticalScrollIndicator={false} style={styles.panelScroll}>
                  <Text style={[styles.subHint, { color: colors.textMuted }]}>Select a specialization</Text>
                  {selectedCategory?.subcategories.map((sub) => (
                    <TouchableOpacity
                      key={sub}
                      style={[styles.subRow, { borderBottomColor: colors.borderMuted }]}
                      onPress={() => selectSubcategory(sub)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.subLabel, { color: colors.text }]}>{sub}</Text>
                      <Text style={[styles.subArrow, { color: colors.accent }]}>›</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </Animated.View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
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
    borderWidth: 1,
  },
  tileImage: { width: '100%' },
  tileLabel: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },

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
