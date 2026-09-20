import { View, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Check, FolderOpen, User } from 'lucide-react-native';
import type { PriceOffer } from '@core/types/project';
import { AppText } from '@components/ui/AppText';
import { useSettingsStore } from '@core/stores/settingsStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import { categoryLabel } from '@features/crew/data/categories';

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
  shadowColor: '#4C1D95',
  shadowOpacity: 0.05,
  shadowRadius: 7,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;

// Violet card palette, local to the client projects screen's cards.
const INK = '#000000';
const INK_2 = '#000000';
const VIOLET = '#6D28D9';
const VIOLET_DEEP = '#4C1D95';
const HAIRLINE = '#F2F0F7';


type ProfessionalProfileSummary = { displayName: string; photoURL?: string };

type Props = {
  offer: PriceOffer;
  professionalProfile?: ProfessionalProfileSummary;
  projectTitle?: string;
  onPressProfile: () => void;
  onAccept: () => void;
  onReject: () => void;
  /** This card's own hire is in flight — it shows the spinner. */
  isAccepting: boolean;
  /**
   * SOME hire is in flight, this card's or another's. Locks Accept everywhere:
   * two accepts that overlap each create a group chat for the same project, so
   * the client ends up with two. See hireAtomicity.test.ts.
   */
  busy?: boolean;
};

export function PriceOfferCard({
  offer,
  professionalProfile,
  projectTitle,
  onPressProfile,
  onAccept,
  onReject,
  isAccepting,
  busy = false,
}: Props) {
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const rowDir = rtl ? 'row-reverse' : ('row' as const);
  const displayName = professionalProfile?.displayName ?? '…';
  const lang: 'he' | 'en' = rtl ? 'he' : 'en';
  // categoryLabel, not the raw stored string — the same mapping project-details
  // and NoticeHistoryView already use, so the role reads in the app's language.
  //
  // Deliberately the CATEGORY, not `subcategory ?? category`. Stored
  // subcategories are English display strings from a retired taxonomy: only 2 of
  // the 16 distinct values in production still exist as specializations, so the
  // other 14 would render untranslated in Hebrew regardless. A localized category
  // beats a stale English subskill.
  const role = categoryLabel(offer.category, lang);

  return (
    <View style={styles.card}>
      {/* Zone 1 — Project title band */}
      {projectTitle ? (
        <View style={{ gap: 8 }}>
          <View style={[styles.titleBand, { flexDirection: rowDir }]}>
            <FolderOpen size={14} color={VIOLET} strokeWidth={1.8} />
            <AppText weight="regular" style={styles.forLabel}>
              {t('offers.for_project')}
            </AppText>
            {/* textAlign follows the app MODE, never the title's own script.
                `projectName` is flex:1 so it fills the band and can truncate, and
                React Native's default `textAlign: 'auto'` then aligns by the
                CONTENT's direction — an English title in Hebrew mode drifted to
                the far left of that wide box, stranded away from "עבור:". */}
            <AppText
              weight="bold"
              style={[styles.projectName, { textAlign: rtl ? 'right' : 'left' }]}
              numberOfLines={1}
            >
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
          <AppText
            weight="regular"
            style={[styles.roleText, { textAlign: rtl ? 'right' : 'left' }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {role}
          </AppText>
        </View>

        <View style={[styles.priceBlock, { alignItems: rtl ? 'flex-start' : 'flex-end' }]}>
          <AppText weight="bold" style={[styles.priceText, rtl ? { fontFamily: 'Heebo-ExtraBold' } : null]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.55}>
            ₪{offer.price.toLocaleString()}
          </AppText>
        </View>
      </View>

      {/* Zone 3 — Separator */}
      <View style={styles.separator} />

      {/* Zone 4 — Action row: view profile 40% | accept 40% | deny 20% */}
      <View style={[styles.actionStrip, { flexDirection: rowDir }]}>
        <TouchableOpacity style={styles.actionProfile} onPress={onPressProfile} activeOpacity={0.7} hitSlop={{ top: 3, bottom: 3 }}>
          <View style={[styles.actionInner, { flexDirection: rowDir }]}>
            <User size={13} color={VIOLET} strokeWidth={1.8} />
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
          style={[styles.actionAccept, (isAccepting || busy) && styles.actionDisabled]}
          onPress={onAccept}
          disabled={isAccepting || busy}
          activeOpacity={0.85}
          hitSlop={{ top: 3, bottom: 3 }}
        >
          {isAccepting ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <View style={[styles.actionInner, { flexDirection: rowDir }]}>
              <Check size={15} color="#ffffff" strokeWidth={2.5} />
              <AppText weight="semiBold" style={styles.actionAcceptText}>
                {t('offers.accept')}
              </AppText>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionReject} onPress={onReject} activeOpacity={0.7} hitSlop={{ top: 3, bottom: 3 }}>
          <AppText weight="medium" style={styles.actionRejectText}>
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
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#EFEDF5',
    padding: 14,
    gap: 11,
    ...CARD_SHADOW,
  },
  // Zone 1
  titleBand: {
    alignItems: 'center',
    gap: 6,
  },
  forLabel: {
    fontSize: 12.5,
    color: INK,
  },
  projectName: {
    fontSize: 12.5,
    fontWeight: '600',
    color: INK_2,
    flex: 1,
  },
  bandDivider: {
    height: 1,
    backgroundColor: HAIRLINE,
  },
  // Zone 2
  mainRow: {
    alignItems: 'center',
    gap: 11,
  },
  // No tile: the price sits bare at the row's outer edge.
  priceBlock: {
    flexShrink: 0,
    maxWidth: 110,
    gap: 1,
  },
  priceText: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
    color: INK,
  },
  nameCol: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  nameText: {
    fontSize: 15,
    fontWeight: '700',
    color: INK,
  },
  roleText: {
    fontSize: 12.5,
    color: INK_2,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    flexShrink: 0,
  },
  avatarFallback: {
    backgroundColor: '#EDE4FB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontSize: 18,
    color: VIOLET,
  },
  // Zone 3
  separator: {
    height: 1,
    backgroundColor: HAIRLINE,
  },
  // Zone 4 — three separate controls, weighted by consequence: accept is the
  // filled primary, profile is outlined, reject is plain text. They split the
  // strip 40 / 40 / 20 (flexBasis 0, so the grow values are the ratio itself).
  actionStrip: {
    alignItems: 'center',
    gap: 8,
  },
  actionAccept: {
    flex: 2,
    height: 38,
    borderRadius: 12,
    backgroundColor: VIOLET,
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
    fontWeight: '600',
    color: '#ffffff',
  },
  actionProfile: {
    flex: 2,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#DDD7EC',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  actionProfileText: {
    fontSize: 13,
    fontWeight: '600',
    color: VIOLET_DEEP,
  },
  actionReject: {
    flex: 1,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#000000',
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRejectText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#000000',
  },
});
