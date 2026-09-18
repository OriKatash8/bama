import { useState } from 'react';
import { View, Text, TouchableOpacity, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { Star } from 'lucide-react-native';
import { Image } from 'expo-image';
import { useTheme } from '@core/hooks/useTheme';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import type { ProfessionalResult } from '../hooks/useSearchProfessionals';

type Translations = typeof en;

function makeT(translations: Translations) {
  return (key: string): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
}


const STAR_COLOR = '#cb6ce6';
const STAR_EMPTY = '#E3DFEE';

// Violet card palette. Local on purpose: the card reads these directly rather
// than through useTheme, whose values reach the whole app.
const VIOLET = '#6D28D9';
const INK = '#1A1626';
const MUTED = '#9C99AD';

function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => {
        const filled = rating >= i;
        const half = !filled && rating >= i - 0.5;
        if (filled) {
          return <Star key={i} size={size} color={STAR_COLOR} fill={STAR_COLOR} />;
        }
        if (half) {
          return (
            <View key={i} style={{ width: size, height: size }}>
              <Star size={size} color={STAR_EMPTY} fill={STAR_EMPTY} />
              <View style={{ position: 'absolute', left: 0, top: 0, width: size / 2, height: size, overflow: 'hidden' }}>
                <Star size={size} color={STAR_COLOR} fill={STAR_COLOR} />
              </View>
            </View>
          );
        }
        return <Star key={i} size={size} color={STAR_EMPTY} fill={STAR_EMPTY} />;
      })}
    </View>
  );
}

type Props = {
  item: ProfessionalResult;
  onMessage?: () => Promise<void>;
  onDirectProject?: () => void;
  onViewProfile?: () => void;
};

export function ProfessionalCard({ item, onMessage, onDirectProject, onViewProfile }: Props) {
  const colors = useTheme();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const font = useAppFont();
  const { user, profile } = item;
  const [isMessaging, setIsMessaging] = useState(false);

  async function handleMessagePress() {
    if (!onMessage) return;
    setIsMessaging(true);
    try {
      await onMessage();
    } finally {
      setIsMessaging(false);
    }
  }


  return (
    <View style={styles.card}>
      <View style={[styles.row, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
        {user.photoURL ? (
          <Image
            source={{ uri: user.photoURL, width: 52, height: 52 }}
            style={styles.avatar}
            contentFit="cover"
            cachePolicy="memory-disk"
            loading="lazy"
            transition={150}
          />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarInitial}>
              {user.displayName?.charAt(0)?.toUpperCase() ?? '?'}
            </Text>
          </View>
        )}

        <View style={styles.info}>
          <Text style={[styles.name, { textAlign: rtl ? 'right' : 'left', ...font.bold }]} numberOfLines={1} ellipsizeMode="tail">
            {user.displayName}
          </Text>
          {profile.rating > 0 ? (
            <View style={[styles.ratingBlock, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
              <StarRow rating={profile.rating} size={14} />
              <Text style={[styles.ratingNum, { ...font.bold }]}>
                {profile.rating.toFixed(1)}
              </Text>
              <Text style={[styles.ratingCount, { ...font.regular }]}>
                · {profile.reviewCount} {rtl ? 'דירוגים' : 'ratings'}
              </Text>
            </View>
          ) : (
            <View style={[styles.ratingBlock, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
              <StarRow rating={0} size={14} />
              <Text style={[styles.ratingCount, { ...font.regular }]}>
                (0)
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={[styles.btnRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
        {/* The row stretches its children (the default for a row), so when one
            label wraps to two lines both buttons grow together; minHeight sets
            the floor, never a fixed height. */}
        {onViewProfile && (
          <Pressable
            style={({ pressed }) => [styles.btn, styles.btnOutline, pressed && styles.btnOutlinePressed]}
            onPress={onViewProfile}
          >
            <Text numberOfLines={2} style={[styles.btnText, styles.btnOutlineText, { ...font.semiBold }]}>{t('search.view_profile')}</Text>
          </Pressable>
        )}
        {onDirectProject && (
          <Pressable
            style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.btnPrimaryPressed]}
            onPress={onDirectProject}
          >
            <Text numberOfLines={2} style={[styles.btnText, styles.btnFilledText, { ...font.semiBold }]}>{t('search.tell_us_about_project_card')}</Text>
          </Pressable>
        )}
        {onMessage && !onDirectProject && (
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.accent }]}
            onPress={handleMessagePress}
            disabled={isMessaging}
            activeOpacity={0.8}
          >
            {isMessaging
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[styles.btnText, styles.btnFilledText, { ...font.semiBold }]}>{t('search.message')}</Text>
            }
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDE9F7',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#4C1D95',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  row: { alignItems: 'flex-start', gap: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#EDE4FB' },
  avatarInitial: { fontSize: 22, fontWeight: '700', color: VIOLET },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: '700', color: INK, marginBottom: 4 },
  ratingBlock: { alignItems: 'center', gap: 5, marginBottom: 2 },
  ratingNum: { fontSize: 14, color: INK },
  ratingCount: { fontSize: 12, color: MUTED },
  btnRow: { marginTop: 12, gap: 8 },
  btn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 13,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: { backgroundColor: VIOLET },
  btnPrimaryPressed: { backgroundColor: '#5B21B6' },
  btnOutline: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: VIOLET,
  },
  btnOutlinePressed: { backgroundColor: '#F6F2FE' },
  // lineHeight 18 ≈ 13.5 × 1.3.
  btnText: { fontSize: 13.5, fontWeight: '600', lineHeight: 18, textAlign: 'center' },
  btnOutlineText: { color: VIOLET },
  btnFilledText: { color: '#FFFFFF' },
});
