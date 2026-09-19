import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { AppText } from '@components/ui/AppText';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useSettingsStore } from '@core/stores/settingsStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import type { Review } from '@core/types/project';
import { useModeAccent } from '@core/navigation/floatingTabBar';

type ReviewsListProps = {
  reviews: Review[];
};

type Translations = typeof en;

function makeT(translations: Translations) {
  return (key: string): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0] ?? '')
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function ReviewsList({ reviews }: ReviewsListProps) {
  const [index, setIndex] = useState(0);
  // This card was written Hebrew-first: the three textAligns below were 'right'
  // and the header row a hardcoded 'row', so in ENGLISH the text sat against the
  // far edge from where reading starts. Alignment and row direction have to move
  // together — flipping only the text would leave the avatar stranded.
  const language = useSettingsStore((s) => s.language);
  const rtl = language === 'he';
  // Purple when a client views the profile, blue in the pro app.
  const { accent, tint } = useModeAccent();
  const t = makeT(rtl ? he : en);
  const align = rtl ? 'right' : 'left' as const;

  if (reviews.length === 0) {
    return <Text style={styles.empty}>{t('profile.no_reviews')}</Text>;
  }

  const review = reviews[index];
  const clamped = Math.max(0, Math.min(5, Math.round(review.rating)));
  const stars = '★'.repeat(clamped) + '☆'.repeat(5 - clamped);
  // Explicit locale: a bare toLocaleDateString() follows the DEVICE, so a Hebrew
  // UI on an English phone showed English-formatted dates. Same pair the rest of
  // the app uses.
  const date = new Date(review.createdAt.seconds * 1000).toLocaleDateString(rtl ? 'he-IL' : 'en-GB');

  function prev() { setIndex((i) => (i - 1 + reviews.length) % reviews.length); }
  function next() { setIndex((i) => (i + 1) % reviews.length); }

  return (
    <View style={styles.container}>
      {/* Review card — tap to go to next */}
      <TouchableOpacity activeOpacity={0.85} onPress={next} style={styles.card}>
        {/* Date, name, then avatar — mirrored as a unit so the avatar always sits
            at the trailing edge and the date at the leading one. */}
        <View style={[styles.nameAvatarRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          <Text style={styles.date}>{date}</Text>
          <AppText weight="bold" style={[styles.author, { textAlign: align }]}>{review.authorName}</AppText>
          <View style={[styles.avatar, { backgroundColor: tint }]}>
            <AppText weight="bold" style={[styles.avatarText, { color: accent }]}>{initials(review.authorName)}</AppText>
          </View>
        </View>

        {/* Stars */}
        <Text style={[styles.stars, { textAlign: align }]}>{stars}</Text>

        {/* Body */}
        <AppText style={[styles.body, { textAlign: align }]}>{review.body}</AppText>
      </TouchableOpacity>

      {/* Navigation row */}
      {reviews.length > 1 && (
        <View style={styles.navRow}>
          <TouchableOpacity onPress={prev} style={[styles.navBtn, { backgroundColor: tint }]} activeOpacity={0.7} hitSlop={4}>
            <ChevronLeft size={20} color={accent} strokeWidth={2.5} />
          </TouchableOpacity>

          <Text style={styles.counter}>{index + 1} / {reviews.length}</Text>

          <TouchableOpacity onPress={next} style={[styles.navBtn, { backgroundColor: tint }]} activeOpacity={0.7} hitSlop={4}>
            <ChevronRight size={20} color={accent} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  empty: { fontSize: 13, color: '#000000', textAlign: 'center', paddingVertical: 16 },

  card: {
    backgroundColor: '#FAF9FD',
    borderRadius: 14,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: '#EFEDF5',
  },

  date: {
    fontSize: 11,
    color: '#000000',
  },

  nameAvatarRow: {
    alignItems: 'center',
    gap: 8,
  },

  author: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000000',
    flex: 1,
  },

  stars: {
    fontSize: 15,
    color: '#F5A524',
  },

  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarText: {
    fontSize: 15,
    fontWeight: '700',
  },

  body: {
    fontSize: 14,
    color: '#000000',
    lineHeight: 20,
  },

  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },

  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  counter: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000000',
    minWidth: 40,
    textAlign: 'center',
  },
});
