import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { getDocument } from '@core/firebase/firestore';
import type { BundleOffer, PriceOffer } from '@core/types/project';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
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

type Props = {
  bundle: BundleOffer;
  onAccept: () => void;
  onReject: () => void;
  isAccepting: boolean;
};

export function BundleOfferCard({ bundle, onAccept, onReject, isAccepting }: Props) {
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [offerDetails, setOfferDetails] = useState<PriceOffer[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const font = useAppFont();
  const rtl = language === 'he';
  const rowDir = rtl ? 'row-reverse' : 'row' as const;

  useEffect(() => {
    getDocument<{ displayName: string }>(`users/${bundle.professionalId}`).then((u) => {
      setDisplayName(u?.displayName ?? 'Unknown');
    });
  }, [bundle.professionalId]);

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
      <View style={[styles.badge, { alignSelf: rtl ? 'flex-end' : 'flex-start' }]}>
        <Text style={[styles.badgeText, { fontFamily: font.bold }]}>{t('offers.bundle_badge')}</Text>
      </View>

      <Text style={[styles.name, { fontFamily: font.bold, textAlign: rtl ? 'right' : 'left' }]}>{displayName ?? '…'}</Text>

      {/* Tappable roles header */}
      <TouchableOpacity
        style={[styles.rolesHeader, { flexDirection: rowDir }]}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.7}
      >
        <Text style={[styles.rolesSummary, { fontFamily: font.semiBold, textAlign: rtl ? 'right' : 'left' }]}>
          {bundle.slots.map((s) => s.subcategory).join(' · ')}
        </Text>
        {expanded ? (
          <ChevronUp size={16} color="#004aad" />
        ) : (
          <ChevronDown size={16} color="#004aad" />
        )}
      </TouchableOpacity>

      {/* Per-role breakdown */}
      {expanded && (
        <View style={styles.breakdown}>
          {loadingDetails ? (
            <ActivityIndicator size="small" color="#004aad" />
          ) : (
            offerDetails.map((o, i) => (
              <View key={i} style={[styles.breakdownRow, { flexDirection: rowDir }]}>
                <Text style={[styles.breakdownRole, { fontFamily: font.medium }]}>{o.subcategory}</Text>
                <Text style={[styles.breakdownPrice, { fontFamily: font.semiBold }]}>₪{o.price.toLocaleString()}</Text>
              </View>
            ))
          )}
          <View style={styles.breakdownDivider} />
          <View style={[styles.breakdownRow, { flexDirection: rowDir }]}>
            <Text style={[styles.breakdownRole, styles.breakdownTotal, { fontFamily: font.bold }]}>
              {t('offers.instead_of')}
            </Text>
            <Text style={[styles.breakdownPrice, styles.breakdownTotalPrice, { fontFamily: font.bold }]}>
              ₪{bundle.individualTotal.toLocaleString()}
            </Text>
          </View>
        </View>
      )}

      <View style={[styles.priceRow, { flexDirection: rowDir }]}>
        <Text style={[styles.strikethrough, { fontFamily: font.semiBold }]}>₪{bundle.individualTotal.toLocaleString()}</Text>
        <Text style={[styles.insteadOf, { fontFamily: font.regular }]}>{t('offers.instead_of')}</Text>
        <Text style={[styles.bundlePrice, { fontFamily: font.bold }]}>₪{bundle.bundlePrice.toLocaleString()}</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.acceptBtn, isAccepting && styles.disabled]}
          onPress={onAccept}
          disabled={isAccepting}
          activeOpacity={0.8}
        >
          {isAccepting ? (
            <ActivityIndicator size="small" color="#4caf50" />
          ) : (
            <Text style={[styles.acceptIcon, { fontFamily: font.bold }]}>✓</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.rejectBtn]}
          onPress={onReject}
          activeOpacity={0.8}
        >
          <Text style={[styles.rejectIcon, { fontFamily: font.bold }]}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    padding: 14,
    marginVertical: 5,
    backgroundColor: '#cb6ce6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    gap: 8,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#004aad',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: { color: '#ffffff', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  name: { fontSize: 15, fontWeight: '700', color: '#004aad' },
  rolesHeader: {
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,74,173,0.1)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  rolesSummary: { flex: 1, fontSize: 13, fontWeight: '600', color: '#004aad' },
  breakdown: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  breakdownRow: { justifyContent: 'space-between', alignItems: 'center' },
  breakdownRole: { fontSize: 13, color: '#004aad', fontWeight: '500' },
  breakdownPrice: { fontSize: 13, color: '#004aad', fontWeight: '600' },
  breakdownDivider: { height: 1, backgroundColor: 'rgba(0,74,173,0.2)', marginVertical: 2 },
  breakdownTotal: { fontWeight: '700', opacity: 0.7 },
  breakdownTotalPrice: { fontWeight: '700', opacity: 0.7, textDecorationLine: 'line-through' },
  priceRow: { alignItems: 'center', gap: 8 },
  strikethrough: {
    fontSize: 14,
    color: '#004aad',
    fontWeight: '600',
    textDecorationLine: 'line-through',
    opacity: 0.7,
  },
  insteadOf: { fontSize: 12, color: '#004aad', opacity: 0.8 },
  bundlePrice: { fontSize: 20, fontWeight: '800', color: '#004aad' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  actionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtn: { backgroundColor: 'rgba(255,255,255,0.35)', borderWidth: 1.5, borderColor: '#4caf50' },
  rejectBtn: { backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 1.5, borderColor: '#e53935' },
  disabled: { opacity: 0.5 },
  acceptIcon: { fontSize: 16, color: '#4caf50', fontWeight: '700' },
  rejectIcon: { fontSize: 14, color: '#e53935', fontWeight: '700' },
});
