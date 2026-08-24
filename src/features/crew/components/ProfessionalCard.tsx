import { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
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
const STAR_EMPTY = '#d1d5db';

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
    <View style={[styles.card, { borderColor: colors.border }]}>
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
          <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.accent + '33' }]}>
            <Text style={[styles.avatarInitial, { color: colors.accent }]}>
              {user.displayName?.charAt(0)?.toUpperCase() ?? '?'}
            </Text>
          </View>
        )}

        <View style={styles.info}>
          <Text style={[styles.name, { color: colors.text, textAlign: rtl ? 'right' : 'left', ...font.bold }]} numberOfLines={1}>
            {user.displayName}
          </Text>
          {profile.rating > 0 ? (
            <View style={[styles.ratingBlock, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
              <StarRow rating={profile.rating} size={14} />
              <Text style={[styles.ratingNum, { color: colors.text, ...font.bold }]}>
                {profile.rating.toFixed(1)}
              </Text>
              <Text style={[styles.ratingCount, { color: colors.textMuted, ...font.regular }]}>
                · {profile.reviewCount} {rtl ? 'דירוגים' : 'ratings'}
              </Text>
            </View>
          ) : (
            <View style={[styles.ratingBlock, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
              <StarRow rating={0} size={14} />
              <Text style={[styles.ratingCount, { color: colors.textMuted, ...font.regular }]}>
                (0)
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={[styles.btnRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
        {onViewProfile && (
          <TouchableOpacity
            style={[styles.btn, styles.btnOutline]}
            onPress={onViewProfile}
            activeOpacity={0.8}
          >
            <Text style={[styles.btnOutlineText, { ...font.bold }]}>{t('search.view_profile')}</Text>
          </TouchableOpacity>
        )}
        {onDirectProject && (
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: '#004aad' }]}
            onPress={onDirectProject}
            activeOpacity={0.8}
          >
            <Text style={[styles.btnFilledText, { ...font.bold }]}>{t('search.tell_us_about_project')}</Text>
          </TouchableOpacity>
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
              : <Text style={[styles.btnFilledText, { ...font.bold }]}>{t('search.message')}</Text>
            }
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  row: { alignItems: 'flex-start', gap: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 22, fontWeight: '700' },
  info: { flex: 1 },
  name: { fontSize: 16, marginBottom: 4 },
  ratingBlock: { alignItems: 'center', gap: 5, marginBottom: 2 },
  ratingNum: { fontSize: 14 },
  ratingCount: { fontSize: 12 },
  btnRow: { marginTop: 12, gap: 8 },
  btn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
  },
  btnOutline: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#004aad',
  },
  btnOutlineText: { color: '#004aad', fontSize: 14 },
  btnFilledText: { color: '#fff', fontSize: 14 },
});
