import { Fragment, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal, FlatList,
  StyleSheet, ActivityIndicator, ScrollView, Pressable, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react-native';
import { Screen } from '@components/layout/Screen';
import { PageTitle } from '@components/ui/PageTitle';
import { GradientBand } from '@components/ui/GradientBand';
import { useTheme } from '@core/hooks/useTheme';
import { ROLE_CATEGORIES, categoryLabel, getSpecializations, labelOf } from '@features/crew/data/categories';
import { roleIdForCategory } from '@features/noticeboard/matching';
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

function catLabel(key: string, rtl: boolean): string {
  return categoryLabel(key, rtl ? 'he' : 'en');
}

const CATEGORY_IMAGE: Record<string, number> = {
  'Video Photographer': require('../../../../../assets/images/categories/videographer-blue.png'),
  'Still Photographer': require('../../../../../assets/images/categories/blue-cam.png'),
  'Editor':             require('../../../../../assets/images/categories/blue-edit.png'),
  'Graphic Designer':   require('../../../../../assets/images/categories/blue-grafic.png'),
  'Social Media':       require('../../../../../assets/images/categories/blue-social.png'),
  'Studio & Audio':     require('../../../../../assets/images/categories/blue-mic.png'),
  'Lighting Tech':      require('../../../../../assets/images/categories/blue-lightning.png'),
  'Sound Recordist':    require('../../../../../assets/images/categories/blue-sound.png'),
};

const PAGE_BG = '#FAFAFC';
const VIOLET = '#6D28D9';
/** Row padding 14 + icon tile 46 + gap 12: separators start where the label does. */
const SEPARATOR_INSET = 72;
/** Chrome draws `outline: auto` over the focus border; RN's types have no 'none'. */
const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null;

const CATEGORIES = ROLE_CATEGORIES.map((key) => ({
  key,
  label: key,
  image: CATEGORY_IMAGE[key],
}));

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [modalQuery, setModalQuery] = useState('');
  const [selectedSub, setSelectedSub] = useState<string | null>(null);

  const [sheetProfessionalId, setSheetProfessionalId] = useState<string | null>(null);
  const [sheetProfessionalName, setSheetProfessionalName] = useState('');
  /** Visual only: the search field's focus border. */
  const [searchFocused, setSearchFocused] = useState(false);

  const colors = useTheme();
  const router = useRouter();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const font = useAppFont();
  const { showToast } = useUiStore();
  /** White on the band. PageTitle is shared, so the overrides ride its style
   *  prop; 800 has no useAppFont entry, so Hebrew names the ExtraBold face. */
  const titleType = {
    color: '#FFFFFF',
    fontSize: 25,
    lineHeight: 30,
    letterSpacing: -0.3,
    fontWeight: '800' as const,
    ...(rtl ? { fontFamily: 'Heebo-ExtraBold' } : null),
    marginTop: 0,
    marginBottom: 0,
    paddingHorizontal: 0,
  };

  function openDirectSheet(id: string, name: string) {
    setSheetProfessionalId(id);
    setSheetProfessionalName(name);
  }

  function closeDirectSheet() {
    setSheetProfessionalId(null);
    setSheetProfessionalName('');
  }

  function closeModal() {
    setSelectedCategory(null);
    setModalQuery('');
    setSelectedSub(null);
  }

  function openCategory(key: string) {
    setSelectedSub(null);
    setSelectedCategory(key);
  }

  const { results: unifiedResults, isLoading: unifiedLoading } = useUnifiedSearch(query);
  const { results: modalResults, isLoading: modalLoading } = useSearchProfessionals(
    selectedCategory ?? ''
  );

  const roleId = selectedCategory ? roleIdForCategory(selectedCategory) : '';
  const subskills = selectedCategory ? getSpecializations(roleId) : []; // general first
  const showSubFilter = subskills.some((s) => s.id !== 'general');

  const filteredModalResults: ProfessionalResult[] = modalResults.filter((r) => {
    const nameOk =
      !modalQuery.trim() || r.user.displayName.toLowerCase().includes(modalQuery.toLowerCase());
    const subOk =
      !selectedSub ||
      (r.profile.roleSkills ?? []).some(
        (rs) => rs.role === roleId && rs.specializations.includes(selectedSub),
      );
    return nameOk && subOk;
  });

  const filteredCategories = query.trim()
    ? CATEGORIES.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()))
    : CATEGORIES;

  const isSearching = query.trim().length > 0;

  return (
    <Screen keyboardShouldPersistTaps="handled" backgroundColor={PAGE_BG} style={{ padding: 0, paddingBottom: 100 }}>
      {/* Header */}
      <GradientBand style={styles.band}>
        <PageTitle style={titleType}>{t('search.heading')}</PageTitle>
      </GradientBand>

      <View style={styles.sheet}>
      {/* Top search bar */}
      <View style={[styles.searchRow, searchFocused && styles.searchRowFocused]}>
        <Search size={18} color="#8B8898" strokeWidth={2.5} />
        <TextInput
          style={[styles.searchInput, webNoOutline, { ...font.regular, textAlign: rtl ? 'right' : 'left' }]}
          placeholder={t('search.placeholder')}
          placeholderTextColor="#9C99AD"
          value={query}
          onChangeText={setQuery}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} activeOpacity={0.7}>
            <Text style={[styles.clearBtn, { color: colors.textMuted }]}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Unified search results */}
      {isSearching ? (
        <View>
          {unifiedLoading && unifiedResults.length === 0 ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
          ) : unifiedResults.length === 0 ? (
            <View style={styles.emptyResults}>
              <Text style={styles.emptyIcon}>👤</Text>
              <Text style={[styles.emptyText, { color: colors.textSec, textAlign: rtl ? 'right' : 'left' }]}>
                {t('search.no_results_title')}
              </Text>
              <Text style={[styles.emptySubtext, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
                {t('search.no_results_subtext', { query: query.trim() })}
              </Text>
            </View>
          ) : (
            unifiedResults.map((item) => (
              <View key={item.user.id}>
                <ProfessionalCard
                  item={item}
                  onViewProfile={() => router.push(`/browse/profile/${item.user.id}` as never)}
                  onDirectProject={() => openDirectSheet(item.user.id, item.user.displayName)}
                />
              </View>
            ))
          )}
        </View>
      ) : (
        /* Flat category list */
        <View style={styles.listContent}>
          {filteredCategories.length > 0 && (
          <View style={styles.listCard}>
          {filteredCategories.map((cat, i) => (
            <Fragment key={cat.key}>
              {/* Its own view, not a border on the row: a border can't be
                  inset, and this one starts past the icon column. */}
              {i > 0 && (
                <View
                  style={[
                    styles.separator,
                    rtl ? { marginRight: SEPARATOR_INSET } : { marginLeft: SEPARATOR_INSET },
                  ]}
                />
              )}
              <Pressable
                style={({ pressed }) => [
                  styles.categoryRow,
                  { flexDirection: rtl ? 'row-reverse' : 'row' },
                  pressed && styles.categoryRowPressed,
                ]}
                onPress={() => openCategory(cat.key)}
              >
                <View style={styles.categoryIconTile}>
                  {cat.image && (
                    <Image
                      source={cat.image}
                      style={styles.categoryIcon}
                      contentFit="cover"
                      tintColor={VIOLET}
                      cachePolicy="memory-disk"
                      loading="lazy"
                    />
                  )}
                </View>
                <Text style={[styles.categoryLabel, { ...font.semiBold, textAlign: rtl ? 'right' : 'left' }]}>
                  {catLabel(cat.key, rtl)}
                </Text>
                {rtl
                  ? <ChevronLeft size={18} color="#C6C2D2" strokeWidth={2} />
                  : <ChevronRight size={18} color="#C6C2D2" strokeWidth={2} />}
              </Pressable>
            </Fragment>
          ))}
          </View>
          )}
          {filteredCategories.length === 0 && (
            <Text style={{ color: colors.textMuted, textAlign: rtl ? 'right' : 'left', marginTop: 32, ...font.regular }}>
              {t('search.no_categories_match', { query })}
            </Text>
          )}
        </View>
      )}
      </View>

      {/* Category results modal */}
      <Modal
        visible={selectedCategory !== null}
        transparent
        animationType="slide"
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeModal} />
          <View style={styles.modalSheetWrapper}>
          {/* Same surface as the page behind it: colors.bgGradient, running
              vertically as Screen does. It was a hardcoded pastel pair running
              horizontally, so the sheet read as a different surface from the
              browse page — and, being hardcoded, ignored the theme entirely. */}
          <LinearGradient colors={colors.bgGradient} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.modalSheet}>
            {/* Modal header */}
            <View style={[styles.modalHeader, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
              <Text style={[styles.modalTitle, { ...font.bold, textAlign: rtl ? 'right' : 'left' }]}>{catLabel(selectedCategory ?? '', rtl)}</Text>
              <TouchableOpacity onPress={closeModal} hitSlop={12} activeOpacity={0.7}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Pill search bar */}
            <View style={[styles.modalSearchRow, { backgroundColor: '#ffffff', borderColor: 'rgba(0,74,173,0.2)' }]}>
              <Search size={16} color="rgba(0,74,173,0.6)" strokeWidth={2.5} />
              <TextInput
                style={[styles.modalSearchInput, { ...font.regular, color: '#004aad', textAlign: rtl ? 'right' : 'left' }]}
                placeholder={t('search.placeholder')}
                placeholderTextColor="rgba(0,74,173,0.4)"
                value={modalQuery}
                onChangeText={setModalQuery}
              />
              {modalQuery.length > 0 && (
                <TouchableOpacity onPress={() => setModalQuery('')} activeOpacity={0.7}>
                  <Text style={{ color: 'rgba(0,74,173,0.5)', fontSize: 14 }}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Subskill filter */}
            {showSubFilter && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.subFilterScroll}
                // flexShrink:0 is the half that was missing. modalSheet is a
                // flex:1 column inside a fixed 85%-height wrapper, so once the
                // results FlatList below has content the column is
                // over-constrained and RN shrinks whatever is shrinkable.
                // flexGrow:0 stops this row growing but NOT shrinking, so its
                // height collapsed and the chip labels were clipped — only ever
                // visible once a user list had rendered.
                style={[{ flexGrow: 0, flexShrink: 0, marginBottom: 26 }, rtl && { transform: [{ scaleX: -1 }] }]}
              >
                {subskills.map((sp) => {
                  const on = selectedSub === sp.id;
                  return (
                    <TouchableOpacity
                      key={sp.id}
                      style={[styles.subChip, on && styles.subChipActive, rtl && { transform: [{ scaleX: -1 }] }]}
                      onPress={() => setSelectedSub(on ? null : sp.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.subChipText, { ...font.semiBold }, on && styles.subChipTextActive]}>
                        {labelOf(sp, rtl ? 'he' : 'en')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {/* Results */}
            {modalLoading ? (
              <ActivityIndicator color="#004aad" style={{ marginTop: 24 }} />
            ) : filteredModalResults.length === 0 ? (
              <View style={styles.emptyResults}>
                <Text style={styles.emptyIcon}>👤</Text>
                <Text style={[styles.emptyText, { color: '#004aad' }]}>
                  {t('search.no_professionals_yet')}
                </Text>
                <Text style={[styles.emptySubtext, { color: 'rgba(0,74,173,0.6)' }]}>
                  {t('search.no_professionals_subtext')}
                </Text>
              </View>
            ) : (
              <FlatList
                data={filteredModalResults}
                keyExtractor={(item) => item.user.id}
                showsVerticalScrollIndicator={false}
                // The list, not the chip row, is what absorbs the leftover
                // height: flex:1 makes it take exactly what remains and scroll
                // inside those bounds. Without it, now that the chip row refuses
                // to shrink, a long result list would overflow the sheet instead.
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: 32 }}
                renderItem={({ item }) => (
                  <View style={styles.resultItem}>
                    <ProfessionalCard
                      item={item}
                      onViewProfile={() => { closeModal(); router.push(`/browse/profile/${item.user.id}` as never); }}
                      onDirectProject={() => { closeModal(); setTimeout(() => openDirectSheet(item.user.id, item.user.displayName), 350); }}
                    />
                  </View>
                )}
              />
            )}
          </LinearGradient>
          </View>
        </View>
      </Modal>

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

  band: { paddingTop: 22, paddingHorizontal: 20, paddingBottom: 40 },
  /** Overlaps the band's bottom edge; zIndex so it paints over the gradient. */
  sheet: {
    flexGrow: 1,
    backgroundColor: PAGE_BG,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    marginTop: -22,
    zIndex: 1,
    paddingTop: 18,
    paddingHorizontal: 20,
    shadowColor: '#4C1D95',
    shadowOpacity: 0.09,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -6 },
    elevation: 6,
  },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EAE8F0',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    marginBottom: 16,
    gap: 8,
    shadowColor: '#4C1D95',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  searchRowFocused: { borderColor: '#8B5CF6' },
  searchInput: { flex: 1, fontSize: 14.5, color: '#1A1626' },
  clearBtn: { fontSize: 14, paddingHorizontal: 4 },

  listContent: { paddingBottom: 16 },

  /** One container for every row; rows carry no surface of their own. */
  listCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#EFEDF5',
    overflow: 'hidden',
    shadowColor: '#4C1D95',
    shadowOpacity: 0.05,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: '#F0EEF6' },
  // 64 tall: sized so the eight rows reach down to the tab bar on an iPhone
  // instead of leaving the bottom of the screen empty.
  categoryRow: {
    minHeight: 64,
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 14,
    gap: 12,
  },
  categoryRowPressed: { backgroundColor: '#F8F6FC' },
  categoryIconTile: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#F3EEFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Fills the tile: the PNGs are ~40% ink on a 400px transparent canvas, so a
   *  46pt frame gives a glyph of roughly 18-22pt. */
  categoryIcon: { width: 46, height: 46 },
  categoryLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1626',
  },


  resultItem: { paddingHorizontal: 16 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheetWrapper: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '85%',
    overflow: 'hidden',
  },
  modalSheet: {
    paddingTop: 20,
    paddingHorizontal: 16,
    flex: 1,
  },
  modalHeader: {
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#004aad',
    flex: 1,
  },
  modalClose: {
    fontSize: 18,
    color: '#004aad',
    paddingHorizontal: 4,
  },
  modalSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    marginBottom: 10,
    paddingHorizontal: 14,
    height: 44,
    borderWidth: 1,
    gap: 8,
  },
  modalSearchInput: { flex: 1, fontSize: 15 },

  subFilterScroll: { gap: 8, paddingHorizontal: 2, alignItems: 'center' },
  subChip: {
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: '#004aad',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: '#ffffff',
  },
  subChipActive: { backgroundColor: '#004aad' },
  subChipText: { fontSize: 12, color: '#004aad' },
  subChipTextActive: { color: '#ffffff' },

  emptyResults: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 40,
    paddingVertical: 40,
  },
  emptyIcon: { fontSize: 52, marginBottom: 4 },
  emptyText: { fontSize: 18, fontWeight: '700' },
  emptySubtext: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
