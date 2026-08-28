import { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { X } from 'lucide-react-native';

import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import { COURSE_LEVEL_KEYS, type CourseLevelKey } from '../levels';
import { PRICE_BANDS, type PriceBandId } from '../priceBands';

type Translations = typeof en;

function makeT(translations: Translations) {
  return (key: string, vars?: Record<string, string | number>): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    if (typeof result !== 'string') return key;
    if (!vars) return result;
    return result.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ''));
  };
}

export type CourseSort = 'newest' | 'price_low_high' | 'price_high_low';

export type CourseRefinements = {
  level: CourseLevelKey | null;
  priceBand: PriceBandId;
  sort: CourseSort;
};

const SORT_OPTIONS: { id: CourseSort; labelKey: string }[] = [
  { id: 'newest', labelKey: 'courses.sort_newest' },
  { id: 'price_low_high', labelKey: 'courses.price_low_high' },
  { id: 'price_high_low', labelKey: 'courses.price_high_low' },
];

type Props = {
  visible: boolean;
  initial: CourseRefinements;
  resultCount: (staged: CourseRefinements) => number;
  onApply: (staged: CourseRefinements) => void;
  onClose: () => void;
};

export function CourseFilterSheet({ visible, initial, resultCount, onApply, onClose }: Props) {
  const language = useSettingsStore((s) => s.language);
  const font = useAppFont();
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const rowDir = rtl ? 'row-reverse' : ('row' as const);

  // Staged (draft) state — re-seeded from `initial` each time the sheet opens.
  const [level, setLevel] = useState<CourseLevelKey | null>(initial.level);
  const [priceBand, setPriceBand] = useState<PriceBandId>(initial.priceBand);
  const [sort, setSort] = useState<CourseSort>(initial.sort);

  useEffect(() => {
    if (visible) {
      setLevel(initial.level);
      setPriceBand(initial.priceBand);
      setSort(initial.sort);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const staged: CourseRefinements = { level, priceBand, sort };
  const count = resultCount(staged);

  function reset() {
    setLevel(null);
    setPriceBand('all');
    setSort('newest');
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}} style={styles.sheet}>
          <Text style={[styles.sheetTitle, { ...font.bold, textAlign: rtl ? 'right' : 'left' }]}>
            {t('courses.filters_title')}
          </Text>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Level */}
            <Text style={[styles.sectionLabel, { ...font.semiBold, textAlign: rtl ? 'right' : 'left' }]}>
              {t('courses.level_label')}
            </Text>
            <View style={[styles.chipWrap, { flexDirection: rowDir }]}>
              {COURSE_LEVEL_KEYS.map((key) => {
                const activeChip = level === key;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.chip, activeChip && styles.chipActive]}
                    onPress={() => setLevel(activeChip ? null : key)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, { ...font.semiBold }, activeChip && styles.chipTextActive]}>
                      {t(`courses.level_${key}`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Price */}
            <Text style={[styles.sectionLabel, { ...font.semiBold, textAlign: rtl ? 'right' : 'left' }]}>
              {t('courses.price_sort')}
            </Text>
            <View style={[styles.chipWrap, { flexDirection: rowDir }]}>
              {PRICE_BANDS.map((band) => {
                const activeChip = priceBand === band.id;
                return (
                  <TouchableOpacity
                    key={band.id}
                    style={[styles.chip, activeChip && styles.chipActive]}
                    onPress={() => setPriceBand(band.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, { ...font.semiBold }, activeChip && styles.chipTextActive]}>
                      {t(band.labelKey)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Sort */}
            <Text style={[styles.sectionLabel, { ...font.semiBold, textAlign: rtl ? 'right' : 'left' }]}>
              {t('courses.filter_sort')}
            </Text>
            <View style={[styles.chipWrap, { flexDirection: rowDir }]}>
              {SORT_OPTIONS.map((opt) => {
                const activeChip = sort === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.chip, activeChip && styles.chipActive]}
                    onPress={() => setSort(opt.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, { ...font.semiBold }, activeChip && styles.chipTextActive]}>
                      {t(opt.labelKey)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          {/* Footer: reset + apply(count) */}
          <View style={[styles.footer, { flexDirection: rowDir }]}>
            <TouchableOpacity style={styles.resetBtn} onPress={reset} activeOpacity={0.7}>
              <Text style={[styles.resetText, { ...font.semiBold }]}>{t('courses.reset')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.applyBtn}
              onPress={() => { onApply(staged); onClose(); }}
              activeOpacity={0.85}
            >
              <Text style={[styles.applyText, { ...font.bold }]}>
                {t('courses.show_results', { count })}
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
    maxHeight: '85%',
  },
  sheetTitle: { fontSize: 18, color: '#004aad', marginBottom: 12 },
  sectionLabel: { fontSize: 12, color: 'rgba(15,15,31,0.4)', marginTop: 10, marginBottom: 8 },
  chipWrap: { flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,74,173,0.2)',
    backgroundColor: '#ffffff',
  },
  chipActive: { backgroundColor: '#004aad', borderColor: '#004aad' },
  chipText: { fontSize: 13, color: '#004aad' },
  chipTextActive: { color: '#ffffff' },
  footer: { alignItems: 'center', gap: 12, marginTop: 18 },
  resetBtn: { paddingHorizontal: 12, paddingVertical: 12 },
  resetText: { fontSize: 14, color: 'rgba(15,15,31,0.4)' },
  applyBtn: {
    flex: 1,
    backgroundColor: '#004aad',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  applyText: { fontSize: 15, color: '#ffffff' },
});
