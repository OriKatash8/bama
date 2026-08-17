import { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@core/hooks/useTheme';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
import { CATEGORY_LABEL_KEY } from '@features/crew/data/categories';
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


type Props = {
  item: ProfessionalResult;
  onMessage?: () => Promise<void>;
  onDirectProject?: () => void;
};

export function ProfessionalCard({ item, onMessage, onDirectProject }: Props) {
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

  const availColor = profile.availability === 'available' ? '#22c55e' : '#f59e0b';

  function skillLabel(category: string): string {
    return rtl && CATEGORY_LABEL_KEY[category] ? t(CATEGORY_LABEL_KEY[category]) : category;
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
          {profile.bio ? (
            <Text style={[styles.bio, { color: colors.textSec, textAlign: rtl ? 'right' : 'left', ...font.regular }]} numberOfLines={2}>
              {profile.bio}
            </Text>
          ) : null}
          <View style={[styles.badgeRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
            <View style={[styles.availBadge, { backgroundColor: availColor + '22', borderColor: availColor }]}>
              <View style={[styles.availDot, { backgroundColor: availColor }]} />
              <Text style={[styles.availText, { color: availColor, ...font.medium }]}>
                {profile.availability === 'available' ? t('profile.status_available') : t('profile.status_busy')}
              </Text>
            </View>
            {profile.rating > 0 && (
              <Text style={[styles.rating, { color: colors.textMuted, ...font.medium }]}>
                ★ {profile.rating.toFixed(1)} ({profile.reviewCount})
              </Text>
            )}
          </View>
        </View>
      </View>

      {profile.skills && profile.skills.length > 0 && (
        <View style={[styles.skillsRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          {profile.skills.slice(0, 4).map((s, i) => (
            <View key={i} style={[styles.skillChip, { backgroundColor: colors.accent + '18', borderColor: colors.accent + '44' }]}>
              <Text style={[styles.skillText, { color: colors.accent, ...font.semiBold }]} numberOfLines={1}>
                {skillLabel(s.category)}
              </Text>
            </View>
          ))}
          {profile.skills.length > 4 && (
            <Text style={[styles.moreSkills, { color: colors.textMuted }]}>+{profile.skills.length - 4}</Text>
          )}
        </View>
      )}

      {onDirectProject && (
        <TouchableOpacity
          style={[styles.messageBtn, { backgroundColor: '#004aad' }]}
          onPress={onDirectProject}
          activeOpacity={0.8}
        >
          <Text style={[styles.messageBtnText, { ...font.bold }]}>{t('search.tell_us_about_project')}</Text>
        </TouchableOpacity>
      )}
      {onMessage && !onDirectProject && (
        <TouchableOpacity
          style={[styles.messageBtn, { backgroundColor: colors.accent }]}
          onPress={handleMessagePress}
          disabled={isMessaging}
          activeOpacity={0.8}
        >
          {isMessaging
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={[styles.messageBtnText, { ...font.bold }]}>{t('search.message')}</Text>
          }
        </TouchableOpacity>
      )}
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
  name: { fontSize: 16, marginBottom: 2 },
  bio: { fontSize: 13, lineHeight: 18, marginBottom: 6 },
  badgeRow: { alignItems: 'center', gap: 10 },
  availBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  availDot: { width: 6, height: 6, borderRadius: 3 },
  availText: { fontSize: 11, textTransform: 'capitalize' },
  rating: { fontSize: 12 },
  skillsRow: { flexWrap: 'wrap', gap: 6, marginTop: 10 },
  skillChip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  skillText: { fontSize: 11 },
  moreSkills: { fontSize: 12, alignSelf: 'center' },
  messageBtn: {
    marginTop: 12,
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
  },
  messageBtnText: { color: '#fff', fontSize: 14 },
});
