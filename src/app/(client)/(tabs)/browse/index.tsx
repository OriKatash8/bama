import { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Animated, Easing, ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useSegments } from 'expo-router';
import { ChevronRight, Search } from 'lucide-react-native';
import { Screen } from '@components/layout/Screen';
import { useTheme } from '@core/hooks/useTheme';
import { CREW_CATEGORIES } from '@features/crew/data/categories';
import { useSearchProfessionals } from '@features/crew/hooks';
import { useUnifiedSearch } from '@features/crew/hooks/useUnifiedSearch';
import { ProfessionalCard } from '@features/crew/components';
import type { ProfessionalResult } from '@features/crew/hooks/useSearchProfessionals';
import { DirectProjectSheet } from '@features/projects/components/DirectProjectSheet';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
import { useUiStore } from '@core/stores/uiStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

type Translations = typeof en;

function makeT(translations: Translations) {
  return (key: string, vars?: Record<string, string>): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    let str = typeof result === 'string' ? result : key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replace(`{{${k}}}`, v);
      }
    }
    return str;
  };
}

const CATEGORY_IMAGE: Record<string, number> = {
  'Video Photographer': require('../../../../../assets/images/categories/videographer-blue.png'),
  'Still Photographer': require('../../../../../assets/images/categories/blue-cam.png'),
  'Editor':             require('../../../../../assets/images/categories/blue-edit.png'),
  'Graphic Designer':   require('../../../../../assets/images/categories/blue-grafic.png'),
  'AI Specialist':      require('../../../../../assets/images/categories/blue-ai.png'),
  'Social Media':       require('../../../../../assets/images/categories/blue-social.png'),
  'Studio & Audio':     require('../../../../../assets/images/categories/blue-sound.png'),
  'Lighting Tech':      require('../../../../../assets/images/categories/blue-lightning.png'),
  'Sound Recordist':    require('../../../../../assets/images/categories/blue-mic.png'),
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

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [view, setView] = useState<ViewState>({ kind: 'grid' });
  const colors = useTheme();
  const router = useRouter();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const font = useAppFont();
  const { showToast } = useUiStore();

  const [sheetProfessionalId, setSheetProfessionalId] = useState<string | null>(null);
  const [sheetProfessionalName, setSheetProfessionalName] = useState('');

  function openDirectSheet(id: string, name: string) {
    setSheetProfessionalId(id);
    setSheetProfessionalName(name);
  }

  function closeDirectSheet() {
    setSheetProfessionalId(null);
    setSheetProfessionalName('');
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

  const isSearching = query.trim().length > 0;
  const inResultsView = view.kind === 'results';
  const showGrid = !isSearching && !inResultsView;

  const { results: unifiedResults, isLoading: unifiedLoading } = useUnifiedSearch(query);
  const { results: subResults, isLoading: subLoading } = useSearchProfessionals(
    inResultsView ? view.category : '',
    inResultsView ? view.subcategory : ''
  );

  const listData: ProfessionalResult[] = isSearching ? unifiedResults : inResultsView ? subResults : [];
  const listLoading = isSearching ? unifiedLoading : inResultsView ? subLoading : false;

  const filteredCategories = query.trim()
    ? CATEGORIES.filter(c =>
        c.label.toLowerCase().includes(query.toLowerCase()) ||
        c.subcategories.some(s => s.toLowerCase().includes(query.toLowerCase()))
      )
    : CATEGORIES;

  function renderProfessional({ item }: { item: ProfessionalResult }) {
    return (
      <TouchableOpacity
        style={styles.resultItem}
        onPress={() => router.push(`/browse/profile/${item.user.id}` as never)}
        activeOpacity={0.95}
      >
        <ProfessionalCard
          item={item}
          onDirectProject={() => openDirectSheet(item.user.id, item.user.displayName)}
        />
      </TouchableOpacity>
    );
  }

  function renderListEmpty() {
    if (showGrid) return null;
    if (listLoading) return <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />;
    if (isSearching) {
      return (
        <View style={styles.emptyResults}>
          <Text style={styles.emptyIcon}>👤</Text>
          <Text style={[styles.emptyText, { color: colors.textSec, textAlign: rtl ? 'right' : 'left' }]}>
            {t('search.no_results_title')}
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
            {t('search.no_results_subtext', { query: query.trim() })}
          </Text>
        </View>
      );
    }
    return (
      <View style={styles.emptyResults}>
        <Text style={styles.emptyIcon}>👤</Text>
        <Text style={[styles.emptyText, { color: colors.textSec, textAlign: rtl ? 'right' : 'left' }]}>
          {t('search.no_professionals_yet')}
        </Text>
        <Text style={[styles.emptySubtext, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
          {t('search.no_professionals_subtext')}
        </Text>
      </View>
    );
  }

  return (
    <Screen keyboardShouldPersistTaps="handled" style={{ padding: 0, paddingBottom: 100 }}>
        {/* Heading + back button — always visible */}
        <View style={styles.header}>
          {view.kind !== 'grid' && (
            <TouchableOpacity onPress={() => setView({ kind: 'grid' })} style={styles.backBtn} activeOpacity={0.7}>
              <Text style={[styles.backText, { color: colors.accent, textAlign: rtl ? 'right' : 'left' }]}>
                {t('search.back')}
              </Text>
            </TouchableOpacity>
          )}
          <Text style={[styles.heading, { ...font.bold }]}>
            {view.kind === 'grid' ? t('search.heading') : view.subcategory}
          </Text>
          {view.kind !== 'grid' && <View style={styles.backBtn} />}
        </View>

        {/* Search bar — only in grid view */}
        {view.kind === 'grid' && (
          <View style={[styles.searchRow, { backgroundColor: '#ffffff', borderColor: colors.border }]}>
            <Search size={18} color={colors.placeholder} strokeWidth={2.5} />
            <TextInput
              style={[styles.searchInput, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}
              placeholder={t('search.placeholder')}
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

        {/* Results hint — only in results view */}
        {inResultsView && (
          <Text style={[styles.resultsHint, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
            {view.category} · {view.subcategory}
          </Text>
        )}

        {/* Category accordion */}
        {showGrid && (
          <View style={styles.listContent}>
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
                        <Image
                          source={cat.image}
                          style={styles.categoryIcon}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                          loading="lazy"
                        />
                      )}
                      <Text style={[styles.categoryLabel, { ...font.bold, textAlign: rtl ? 'right' : 'left' }]}>{cat.label}</Text>
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
                          <Text style={[styles.subItemText, { ...font.medium, textAlign: rtl ? 'right' : 'left' }]}>{sub}</Text>
                        </TouchableOpacity>
                      ))}
                    </Animated.View>
                  </View>
                );
              })}
              {filteredCategories.length === 0 && (
                <Text style={{ color: colors.textMuted, textAlign: rtl ? 'right' : 'left', marginTop: 32, ...font.regular }}>
                  {t('search.no_categories_match', { query })}
                </Text>
              )}
            </View>
        )}

        {/* Results list — only rendered in search / subcategory results mode */}
        {!showGrid && (
          <View>
            {listLoading && listData.length === 0 ? (
              <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
            ) : listData.length === 0 ? (
              renderListEmpty()
            ) : (
              listData.map((item) => renderProfessional({ item }))
            )}
          </View>
        )}

      <DirectProjectSheet
        visible={sheetProfessionalId !== null}
        professionalId={sheetProfessionalId ?? ''}
        professionalName={sheetProfessionalName}
        onClose={closeDirectSheet}
        onSubmitted={() => {
          closeDirectSheet();
          showToast(t('builder.request_submitted'), 'success');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  heading: { fontSize: 36, fontWeight: '800', color: '#004aad', textAlign: 'center', textTransform: 'uppercase', flex: 1 },
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

  listContent: { alignItems: 'center' },

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
    fontFamily: 'Montserrat-Regular',
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
    fontFamily: 'Montserrat-Regular',
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
  resultItem: { paddingHorizontal: 16 },

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
