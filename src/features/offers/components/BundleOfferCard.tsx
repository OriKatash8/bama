import { useEffect, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { ChevronDown, ChevronUp, Check, User } from 'lucide-react-native';
import { getDocument } from '@core/firebase/firestore';
import type { BundleOffer, PriceOffer } from '@core/types/project';
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
  bundle: BundleOffer;
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

export function BundleOfferCard({
  bundle,
  professionalProfile,
  projectTitle,
  onPressProfile,
  onAccept,
  onReject,
  isAccepting,
  busy = false,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [offerDetails, setOfferDetails] = useState<PriceOffer[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const rowDir = rtl ? 'row-reverse' : ('row' as const);
  const displayName = professionalProfile?.displayName ?? '…';
  const lang: 'he' | 'en' = rtl ? 'he' : 'en';
  // See PriceOfferCard: the CATEGORY through categoryLabel, because stored
  // subcategories are stale English from a retired taxonomy and would not
  // translate.
  const rolesSummary = bundle.slots.map((s) => categoryLabel(s.category, lang)).join(' · ');

  useEffect(() => {
    if (!expanded || offerDetails.length > 0) return;
    setLoadingDetails(true);
    Promise.all(bundle.offerIds.map((id) => getDocument<PriceOffer>(`priceOffers/${id}`))).then(
      (results) => {
        setOfferDetails(results.filter((o): o is PriceOffer => o !== null));
        setLoadingDetails(false);
      },
    );
  }, [expanded, bundle.offerIds, offerDetails.length]);

  return (
    <View style={styles.card}>
      {/* Zone 1 — Bundle badge + project band.
          Mirrors PriceOfferCard's band so the two card types read alike: the
          badge takes the place of its folder icon, then the same "for: <project>"
          pair. The roles used to sit here; they are not lost, they are still the
          expandable toggle under the name in Zone 2. */}
      <View style={{ gap: 8 }}>
        <View style={[styles.titleBand, { flexDirection: rowDir }]}>
          <View style={styles.bundleBadge}>
            <AppText weight="bold" style={styles.bundleBadgeText}>
              {t('offers.bundle_badge')}
            </AppText>
          </View>
          {projectTitle ? (
            <>
              <AppText weight="regular" style={styles.forLabel}>
                {t('offers.for_project')}
              </AppText>
              {/* textAlign by app MODE, not by the title's own script — flex:1
                  makes this box wide, and RN's default 'auto' would align an
                  English title left inside it, stranding it from the label. */}
              <AppText
                weight="bold"
                style={[styles.projectName, { textAlign: rtl ? 'right' : 'left' }]}
                numberOfLines={1}
              >
                {projectTitle}
              </AppText>
            </>
          ) : null}
        </View>
        <View style={styles.bandDivider} />
      </View>

      {/* Zone 2 — Main row: avatar | name + roles toggle | price square */}
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
          <TouchableOpacity
            style={[styles.rolesToggle, { flexDirection: rowDir }]}
            onPress={() => setExpanded((v) => !v)}
            activeOpacity={0.7}
          >
            <AppText
              weight="regular"
              style={[styles.rolesToggleText, { textAlign: rtl ? 'right' : 'left' }]}
              numberOfLines={1}
            >
              {rolesSummary}
            </AppText>
            {expanded ? (
              <ChevronUp size={13} color={VIOLET} />
            ) : (
              <ChevronDown size={13} color={VIOLET} />
            )}
          </TouchableOpacity>
        </View>

        <View style={[styles.priceBlock, { alignItems: rtl ? 'flex-start' : 'flex-end' }]}>
          <AppText weight="bold" style={[styles.priceText, rtl ? { fontFamily: 'Heebo-ExtraBold' } : null]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.55}>
            ₪{bundle.bundlePrice.toLocaleString()}
          </AppText>
          <AppText weight="regular" style={styles.strikePriceText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.55}>
            ₪{bundle.individualTotal.toLocaleString()}
          </AppText>
        </View>
      </View>

      {/* Expandable per-role breakdown */}
      {expanded && (
        <View style={styles.breakdown}>
          {loadingDetails ? (
            <ActivityIndicator size="small" color={VIOLET} />
          ) : (
            offerDetails.map((o, i) => (
              <View key={i} style={[styles.breakdownRow, { flexDirection: rowDir }]}>
                <AppText weight="medium" style={styles.breakdownRole}>
                  {categoryLabel(o.category, lang)}
                </AppText>
                <AppText weight="semiBold" style={styles.breakdownPrice}>
                  ₪{o.price.toLocaleString()}
                </AppText>
              </View>
            ))
          )}
          <View style={styles.breakdownDivider} />
          <View style={[styles.breakdownRow, { flexDirection: rowDir }]}>
            <AppText weight="bold" style={[styles.breakdownRole, styles.breakdownTotalLabel]}>
              {t('offers.instead_of')}
            </AppText>
            <AppText weight="bold" style={[styles.breakdownPrice, styles.breakdownTotalPrice]}>
              ₪{bundle.individualTotal.toLocaleString()}
            </AppText>
          </View>
        </View>
      )}

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
    gap: 8,
  },
  bundleBadge: {
    backgroundColor: '#FCE7F8',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink: 0,
  },
  bundleBadgeText: {
    color: '#A21CAF',
    fontSize: 10,
    fontWeight: '600',
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
  // maxWidth keeps the toggle inside nameCol, so the text's flexShrink has a
  // bound to shrink against; without it a long roles list ran under the price.
  rolesToggle: {
    alignItems: 'center',
    gap: 4,
    maxWidth: '100%',
  },
  // flexShrink, NOT flex:1. `flex: 1` stretched this text to fill nameCol, and a
  // stretched box aligns its content by RN's default textAlign:'auto' — i.e. by
  // the roles string's own script — so the summary drifted away from the right
  // edge in Hebrew mode. flexShrink still lets a long summary truncate instead
  // of pushing out the chevron.
  rolesToggleText: {
    fontSize: 12.5,
    color: INK_2,
    flexShrink: 1,
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
  strikePriceText: {
    fontSize: 11.5,
    color: '#A9A6B5',
    textDecorationLine: 'line-through',
  },
  // Breakdown
  breakdown: {
    backgroundColor: '#F6F5FA',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  breakdownRow: {
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownRole: {
    fontSize: 12.5,
    color: INK_2,
  },
  breakdownPrice: {
    fontSize: 12.5,
    color: INK,
  },
  breakdownDivider: {
    height: 1,
    backgroundColor: '#EAE8F0',
    marginVertical: 2,
  },
  breakdownTotalLabel: {
    opacity: 0.7,
  },
  breakdownTotalPrice: {
    opacity: 0.7,
    textDecorationLine: 'line-through',
  },
  // Zone 3
  separator: {
    height: 1,
    backgroundColor: HAIRLINE,
  },
  // Zone 4 — three separate controls, weighted by consequence: accept is the
  // filled primary, profile is outlined, reject is outlined in black. They
  // split the strip 40 / 40 / 20 (flexBasis 0, so the grow values are the
  // ratio itself).
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
