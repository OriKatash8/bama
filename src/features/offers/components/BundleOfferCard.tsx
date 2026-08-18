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
const BORDER_LIGHT = 'rgba(30,79,163,0.12)';
const REJECT_RED = '#e04b4b';
const BUNDLE_PURPLE = '#cb6ce6';

type ProfessionalProfileSummary = { displayName: string; photoURL?: string };

type Props = {
  bundle: BundleOffer;
  professionalProfile?: ProfessionalProfileSummary;
  onPressProfile: () => void;
  onAccept: () => void;
  onReject: () => void;
  isAccepting: boolean;
};

export function BundleOfferCard({
  bundle,
  professionalProfile,
  onPressProfile,
  onAccept,
  onReject,
  isAccepting,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [offerDetails, setOfferDetails] = useState<PriceOffer[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const rowDir = rtl ? 'row-reverse' : ('row' as const);
  const displayName = professionalProfile?.displayName ?? '…';
  const rolesSummary = bundle.slots.map((s) => s.subcategory ?? s.category).join(' · ');

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
      {/* Zone 1 — Bundle badge band */}
      <View style={{ gap: 8 }}>
        <View style={[styles.titleBand, { flexDirection: rowDir }]}>
          <View style={styles.bundleBadge}>
            <AppText weight="bold" style={styles.bundleBadgeText}>
              {t('offers.bundle_badge')}
            </AppText>
          </View>
          <AppText weight="regular" style={styles.rolesSummaryLabel} numberOfLines={1}>
            {rolesSummary}
          </AppText>
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
            <AppText weight="semiBold" style={styles.rolesToggleText} numberOfLines={1}>
              {rolesSummary}
            </AppText>
            {expanded ? (
              <ChevronUp size={13} color={BLUE} />
            ) : (
              <ChevronDown size={13} color={BLUE} />
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.priceSquare}>
          <AppText weight="bold" style={styles.priceText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.55}>
            ₪{bundle.bundlePrice.toLocaleString()}
          </AppText>
          <AppText weight="semiBold" style={styles.strikePriceText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.55}>
            ₪{bundle.individualTotal.toLocaleString()}
          </AppText>
        </View>
      </View>

      {/* Expandable per-role breakdown */}
      {expanded && (
        <View style={styles.breakdown}>
          {loadingDetails ? (
            <ActivityIndicator size="small" color={BLUE} />
          ) : (
            offerDetails.map((o, i) => (
              <View key={i} style={[styles.breakdownRow, { flexDirection: rowDir }]}>
                <AppText weight="medium" style={styles.breakdownRole}>
                  {o.subcategory ?? o.category}
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

      {/* Zone 4 — Action row: accept (50%) | view profile (~33%) | divider | reject (~17%) */}
      <View style={[styles.actionStrip, { flexDirection: rowDir }]}>
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
    gap: 8,
  },
  bundleBadge: {
    backgroundColor: BUNDLE_PURPLE,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
    flexShrink: 0,
  },
  bundleBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  rolesSummaryLabel: {
    fontSize: 11,
    color: '#8890b0',
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
  nameCol: {
    flex: 1,
    gap: 6,
  },
  nameText: {
    fontSize: 18,
    color: BLUE,
  },
  rolesToggle: {
    alignItems: 'center',
    gap: 4,
  },
  rolesToggleText: {
    fontSize: 12,
    color: BLUE,
    flex: 1,
  },
  priceSquare: {
    width: 72,
    height: 72,
    borderRadius: 16,
    backgroundColor: 'rgba(30,79,163,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    flexShrink: 0,
    gap: 2,
  },
  priceText: {
    fontSize: 17,
    color: BLUE,
    textAlign: 'center',
  },
  strikePriceText: {
    fontSize: 11,
    color: '#8890b0',
    textAlign: 'center',
    textDecorationLine: 'line-through',
  },
  // Breakdown
  breakdown: {
    backgroundColor: 'rgba(30,79,163,0.05)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  breakdownRow: {
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownRole: {
    fontSize: 13,
    color: BLUE,
  },
  breakdownPrice: {
    fontSize: 13,
    color: BLUE,
  },
  breakdownDivider: {
    height: 1,
    backgroundColor: BORDER_LIGHT,
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
    flex: 3,
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
    flex: 2,
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
