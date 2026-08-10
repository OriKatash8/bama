import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { ChevronDown, ChevronUp, X, Check } from 'lucide-react-native';
import { getDocument } from '@core/firebase/firestore';
import type { BundleOffer, PriceOffer } from '@core/types/project';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
import { useTheme } from '@core/hooks/useTheme';
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

type ProfessionalProfileSummary = { displayName: string; photoURL?: string };

type Props = {
  bundle: BundleOffer;
  professionalProfile?: ProfessionalProfileSummary;
  onPressProfile: () => void;
  onAccept: () => void;
  onReject: () => void;
  isAccepting: boolean;
};

export function BundleOfferCard({ bundle, professionalProfile, onPressProfile, onAccept, onReject, isAccepting }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [offerDetails, setOfferDetails] = useState<PriceOffer[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const font = useAppFont();
  const colors = useTheme();
  const rtl = language === 'he';
  const rowDir = rtl ? 'row' : 'row-reverse' as const;
  const displayName = professionalProfile?.displayName ?? '…';

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
    <View style={[styles.container, { flexDirection: rowDir }]}>
      {/* X button */}
      <TouchableOpacity onPress={onReject} style={[styles.squareButton, styles.xSquare]} activeOpacity={0.8}>
        <X size={20} color="#888888" />
      </TouchableOpacity>

      {/* ✓ button */}
      <TouchableOpacity
        onPress={onAccept}
        style={[styles.squareButton, styles.acceptSquare, isAccepting && styles.disabled]}
        disabled={isAccepting}
        activeOpacity={0.8}
      >
        {isAccepting ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <Check size={20} color="#ffffff" />
        )}
      </TouchableOpacity>

      {/* Content card */}
      <View style={styles.infoSquare}>
        {/* Bundle badge */}
        <View style={[styles.badge, { alignSelf: rtl ? 'flex-end' : 'flex-start' }]}>
          <Text style={[styles.badgeText, { ...font.bold }]}>{t('offers.bundle_badge')}</Text>
        </View>

        {/* Top: avatar + name + expandable roles */}
        <View style={[styles.topRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          {professionalProfile?.photoURL ? (
            <Image
              source={{ uri: professionalProfile.photoURL }}
              style={styles.avatar}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.primary }]}>
              <Text style={[styles.avatarInitial, { ...font.bold }]}>
                {displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={[styles.nameCol, { alignItems: rtl ? 'flex-end' : 'flex-start' }]}>
            <Text style={[styles.name, { ...font.forText(displayName, 'bold') }]} numberOfLines={1}>
              {displayName}
            </Text>
            <TouchableOpacity
              style={[styles.rolesHeader, { flexDirection: rtl ? 'row-reverse' : 'row' }]}
              onPress={() => setExpanded((v) => !v)}
              activeOpacity={0.7}
            >
              <Text style={[styles.rolesSummary, { ...font.semiBold }]} numberOfLines={1}>
                {bundle.slots.map((s) => s.subcategory ?? s.category).join(' · ')}
              </Text>
              {expanded ? (
                <ChevronUp size={14} color="#004aad" />
              ) : (
                <ChevronDown size={14} color="#004aad" />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Per-role breakdown (expanded) */}
        {expanded && (
          <View style={styles.breakdown}>
            {loadingDetails ? (
              <ActivityIndicator size="small" color="#004aad" />
            ) : (
              offerDetails.map((o, i) => (
                <View key={i} style={[styles.breakdownRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                  <Text style={[styles.breakdownRole, { ...font.medium }]}>{o.subcategory ?? o.category}</Text>
                  <Text style={[styles.breakdownPrice, { ...font.semiBold }]}>₪{o.price.toLocaleString()}</Text>
                </View>
              ))
            )}
            <View style={styles.breakdownDivider} />
            <View style={[styles.breakdownRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
              <Text style={[styles.breakdownRole, styles.breakdownTotal, { ...font.bold }]}>
                {t('offers.instead_of')}
              </Text>
              <Text style={[styles.breakdownPrice, styles.breakdownTotalPrice, { ...font.bold }]}>
                ₪{bundle.individualTotal.toLocaleString()}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.divider} />

        {/* Bottom: bundle price + strikethrough + view profile */}
        <View style={[styles.bottomRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          <View style={[styles.priceGroup, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
            <Text style={[styles.bundlePrice, { ...font.bold }]}>
              ₪{bundle.bundlePrice.toLocaleString()}
            </Text>
            <Text style={[styles.strikethrough, { ...font.semiBold }]}>
              ₪{bundle.individualTotal.toLocaleString()}
            </Text>
          </View>
          <TouchableOpacity onPress={onPressProfile} activeOpacity={0.7}>
            <Text style={[styles.viewProfileText, { ...font.semiBold }]}>
              {t('offers.view_profile')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    width: '100%',
    marginBottom: 12,
  },
  squareButton: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  xSquare: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#d0d0d0',
  },
  acceptSquare: {
    backgroundColor: '#004aad',
  },
  disabled: { opacity: 0.5 },
  infoSquare: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
    gap: 8,
  },
  badge: {
    backgroundColor: '#cb6ce6',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: { color: '#ffffff', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    flexShrink: 0,
  },
  avatarFallback: { justifyContent: 'center', alignItems: 'center' },
  avatarInitial: { color: '#ffffff', fontSize: 17, fontWeight: '700' },
  nameCol: {
    flex: 1,
    gap: 4,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: '#004aad',
  },
  rolesHeader: {
    alignItems: 'center',
    gap: 4,
  },
  rolesSummary: { flex: 1, fontSize: 12, fontWeight: '600', color: '#004aad' },
  breakdown: {
    backgroundColor: 'rgba(0,74,173,0.05)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  breakdownRow: { justifyContent: 'space-between', alignItems: 'center' },
  breakdownRole: { fontSize: 13, color: '#004aad', fontWeight: '500' },
  breakdownPrice: { fontSize: 13, color: '#004aad', fontWeight: '600' },
  breakdownDivider: { height: 1, backgroundColor: 'rgba(0,74,173,0.15)', marginVertical: 2 },
  breakdownTotal: { fontWeight: '700', opacity: 0.7 },
  breakdownTotalPrice: { fontWeight: '700', opacity: 0.7, textDecorationLine: 'line-through' },
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceGroup: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  bundlePrice: {
    fontSize: 20,
    fontWeight: '800',
    color: '#004aad',
  },
  strikethrough: {
    fontSize: 13,
    color: '#888',
    fontWeight: '600',
    textDecorationLine: 'line-through',
  },
  viewProfileText: {
    fontSize: 12,
    color: '#004aad',
    textDecorationLine: 'underline',
  },
});
