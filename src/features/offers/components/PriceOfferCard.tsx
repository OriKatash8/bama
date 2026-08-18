import { View, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Check, FolderOpen, User } from 'lucide-react-native';
import type { PriceOffer } from '@core/types/project';
import { AppText } from '@components/ui/AppText';
import { useSettingsStore } from '@core/stores/settingsStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

type Translations = typeof en;
function makeT(translations: Translations) {
  return (key: string): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
}

const CARD_SHADOW = {
  shadowColor: '#1e4fa3',
  shadowOpacity: 0.06,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 3,
} as const;

const BLUE = '#1e4fa3';
const MUTED = '#8890b0';
const PRICE_BG = 'rgba(30,79,163,0.10)';
const BORDER_LIGHT = 'rgba(30,79,163,0.12)';
const REJECT_RED = '#e04b4b';

type ProfessionalProfileSummary = { displayName: string; photoURL?: string };

type Props = {
  offer: PriceOffer;
  professionalProfile?: ProfessionalProfileSummary;
  projectTitle?: string;
  onPressProfile: () => void;
  onAccept: () => void;
  onReject: () => void;
  isAccepting: boolean;
};

export function PriceOfferCard({
  offer,
  professionalProfile,
  projectTitle,
  onPressProfile,
  onAccept,
  onReject,
  isAccepting,
}: Props) {
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const rowDir = rtl ? 'row-reverse' : ('row' as const);
  const displayName = professionalProfile?.displayName ?? '…';
  const role = offer.subcategory ?? offer.category;

  return (
    <View style={styles.card}>
      {/* Zone 1 — Project title band */}
      {projectTitle ? (
        <View style={{ gap: 8 }}>
          <View style={[styles.titleBand, { flexDirection: rowDir }]}>
            <FolderOpen size={14} color={MUTED} strokeWidth={1.5} />
            <AppText weight="regular" style={styles.forLabel}>
              {t('offers.for_project')}
            </AppText>
            <AppText weight="bold" style={styles.projectName} numberOfLines={1}>
              {projectTitle}
            </AppText>
          </View>
          <View style={styles.bandDivider} />
        </View>
      ) : null}

      {/* Zone 2 — Main row: avatar | name+role | price square */}
      <View style={[styles.mainRow, { flexDirection: rowDir }]}>
        {professionalProfile?.photoURL ? (
          <Image
            source={{ uri: professionalProfile.photoURL }}
            style={styles.avatar}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <AppText weight="bold" style={styles.avatarInitial}>
              {displayName.charAt(0).toUpperCase()}
            </AppText>
          </View>
        )}

        <View style={[styles.nameCol, { alignItems: rtl ? 'flex-end' : 'flex-start' }]}>
          <AppText weight="bold" style={styles.nameText} numberOfLines={1}>
            {displayName}
          </AppText>
          <View style={styles.rolePill}>
            <AppText weight="regular" style={styles.roleText} numberOfLines={1}>
              {role}
            </AppText>
          </View>
        </View>

        <View style={styles.priceSquare}>
          <AppText weight="bold" style={styles.priceText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.55}>
            ₪{offer.price.toLocaleString()}
          </AppText>
        </View>
      </View>

      {/* Zone 3 — Separator */}
      <View style={styles.separator} />

      {/* Zone 4 — Action row: view profile (50%) | accept (~33%) | divider | reject (~17%) */}
      <View style={[styles.actionStrip, { flexDirection: rowDir }]}>
        <TouchableOpacity style={styles.actionProfile} onPress={onPressProfile} activeOpacity={0.7}>
          <View style={[styles.actionInner, { flexDirection: rowDir }]}>
            <User size={12} color={BLUE} strokeWidth={1.8} />
            <AppText
              weight="semiBold"
              style={styles.actionProfileText}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {t('offers.view_profile')}
            </AppText>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionAccept, isAccepting && styles.actionDisabled]}
          onPress={onAccept}
          disabled={isAccepting}
          activeOpacity={0.85}
        >
          {isAccepting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <View style={[styles.actionInner, { flexDirection: rowDir }]}>
              <Check size={15} color="#fff" strokeWidth={2.5} />
              <AppText weight="semiBold" style={styles.actionAcceptText}>
                {t('offers.accept')}
              </AppText>
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.actionInnerDivider} />

        <TouchableOpacity style={styles.actionReject} onPress={onReject} activeOpacity={0.7}>
          <AppText weight="semiBold" style={styles.actionRejectText}>
            {t('offers.deny')}
          </AppText>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    marginHorizontal: 12,
    marginBottom: 12,
    gap: 12,
    ...CARD_SHADOW,
  },
  // Zone 1
  titleBand: {
    alignItems: 'center',
    gap: 6,
  },
  forLabel: {
    fontSize: 11,
    color: MUTED,
  },
  projectName: {
    fontSize: 15,
    color: BLUE,
    flex: 1,
  },
  bandDivider: {
    height: 1,
    backgroundColor: BORDER_LIGHT,
  },
  // Zone 2
  mainRow: {
    alignItems: 'center',
    gap: 12,
  },
  priceSquare: {
    width: 72,
    height: 72,
    borderRadius: 16,
    backgroundColor: PRICE_BG,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    flexShrink: 0,
  },
  priceText: {
    fontSize: 17,
    color: BLUE,
    textAlign: 'center',
  },
  nameCol: {
    flex: 1,
    gap: 6,
  },
  nameText: {
    fontSize: 18,
    color: BLUE,
  },
  rolePill: {
    backgroundColor: 'rgba(30,79,163,0.08)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  roleText: {
    fontSize: 12,
    color: BLUE,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    flexShrink: 0,
  },
  avatarFallback: {
    backgroundColor: BLUE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontSize: 17,
    color: '#ffffff',
  },
  // Zone 3
  separator: {
    height: 1,
    backgroundColor: BORDER_LIGHT,
    marginVertical: -2,
  },
  // Zone 4
  actionStrip: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: BORDER_LIGHT,
    height: 44,
  },
  actionAccept: {
    flex: 2,
    height: 44,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionDisabled: {
    opacity: 0.6,
  },
  actionInner: {
    alignItems: 'center',
    gap: 5,
  },
  actionAcceptText: {
    fontSize: 13,
    color: '#ffffff',
  },
  actionProfile: {
    flex: 3,
    height: 44,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  actionProfileText: {
    fontSize: 11,
    color: BLUE,
  },
  actionInnerDivider: {
    width: 1,
    height: 44,
    backgroundColor: BORDER_LIGHT,
  },
  actionReject: {
    flex: 1,
    height: 44,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRejectText: {
    fontSize: 12,
    color: REJECT_RED,
  },
});
