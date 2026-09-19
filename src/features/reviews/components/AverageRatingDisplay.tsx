import { View, Text, StyleSheet } from 'react-native';
import { Star } from 'lucide-react-native';
import { useSettingsStore } from '@core/stores/settingsStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import type { Review } from '@core/types/project';
import { computeAverageRating } from '../utils/rating';

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

// Colours for the violet profile band — its only placement (ProfileHeader,
// outside edit mode). Pass colours in instead if it ever lands on a light surface.
const STAR = '#FFD166';
const STAR_EMPTY = 'rgba(255,255,255,0.3)';

type Props = {
  reviews: Review[];
  showEmptyState?: boolean;
};

export function AverageRatingDisplay({ reviews, showEmptyState = false }: Props) {
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const { average, count } = computeAverageRating(reviews);

  if (count === 0) {
    if (!showEmptyState) return null;
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>{t('profile.no_reviews')}</Text>
      </View>
    );
  }

  const rounded = Math.round(average * 2) / 2;

  return (
    <View style={styles.container}>
      <View style={styles.starsRow}>
        {[1, 2, 3, 4, 5].map((i) => {
          const filled = rounded >= i;
          const half = !filled && rounded >= i - 0.5;
          if (filled) return <Star key={i} size={16} color={STAR} fill={STAR} />;
          if (half) return (
            <View key={i} style={{ width: 16, height: 16 }}>
              <Star size={16} color={STAR_EMPTY} fill={STAR_EMPTY} />
              <View style={{ position: 'absolute', left: 0, top: 0, width: 8, height: 16, overflow: 'hidden' }}>
                <Star size={16} color={STAR} fill={STAR} />
              </View>
            </View>
          );
          return <Star key={i} size={16} color={STAR_EMPTY} fill={STAR_EMPTY} />;
        })}
        <Text style={styles.averageText}>{average.toFixed(1)}</Text>
      </View>
      <Text style={styles.countText}>{t('profile.reviews_count', { count: String(count) })}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 2 },
  starsRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  averageText: { marginLeft: 6, fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  countText: { fontSize: 12, color: 'rgba(255,255,255,0.75)' },
  emptyText: { fontSize: 13, color: 'rgba(255,255,255,0.75)' },
});
