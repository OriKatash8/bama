import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { X, Check } from 'lucide-react-native';
import type { PriceOffer } from '@core/types/project';
import { useTheme } from '@core/hooks/useTheme';
import { useAppFont } from '@core/hooks/useAppFont';
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

type ProfessionalProfileSummary = { displayName: string; photoURL?: string };

type Props = {
  offer: PriceOffer;
  professionalProfile?: ProfessionalProfileSummary;
  onPressProfile: () => void;
  onAccept: () => void;
  onReject: () => void;
  isAccepting: boolean;
};

export function PriceOfferCard({ offer, professionalProfile, onPressProfile, onAccept, onReject, isAccepting }: Props) {
  const colors = useTheme();
  const font = useAppFont();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const displayName = professionalProfile?.displayName ?? '…';

  return (
    <View style={[styles.card, { backgroundColor: '#ffffff' }]}>
      {/* LEFT: reject + accept buttons — fixed positions, not RTL-flipped */}
      <View style={styles.buttonsRow}>
        <TouchableOpacity onPress={onReject} style={styles.xBtn} activeOpacity={0.8}>
          <X size={18} color="#666666" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onAccept}
          style={[styles.acceptBtn, isAccepting && styles.disabled]}
          disabled={isAccepting}
          activeOpacity={0.8}
        >
          {isAccepting ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Check size={18} color="#ffffff" />
          )}
        </TouchableOpacity>
      </View>

      {/* RIGHT: professional info + view profile, then avatar — fixed positions, not RTL-flipped */}
      <View style={styles.infoRow}>
        <View style={styles.infoCol}>
          <Text style={[styles.name, { fontFamily: font.bold }]} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={[styles.role, { fontFamily: font.regular }]} numberOfLines={1}>
            {offer.subcategory}
          </Text>
          <Text style={[styles.price, { fontFamily: font.bold }]}>
            ₪{offer.price.toLocaleString()}
          </Text>
          <TouchableOpacity onPress={onPressProfile} style={styles.viewProfileBtn} activeOpacity={0.8}>
            <Text style={[styles.viewProfileText, { fontFamily: font.semiBold }]}>{t('offers.view_profile')}</Text>
          </TouchableOpacity>
        </View>

        {professionalProfile?.photoURL ? (
          <Image
            source={{ uri: professionalProfile.photoURL, width: 48, height: 48 }}
            style={styles.avatar}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.primary }]}>
            <Text style={[styles.avatarInitial, { fontFamily: font.bold }]}>{displayName.charAt(0).toUpperCase()}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonsRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  xBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  acceptBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#004aad',
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabled: { opacity: 0.6 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoCol: { alignItems: 'flex-end' },
  name: { fontWeight: 'bold', color: '#004aad', fontSize: 14 },
  role: { color: '#888888', fontSize: 12 },
  price: { fontWeight: 'bold', color: '#004aad', fontSize: 13 },
  viewProfileBtn: {
    borderWidth: 1,
    borderColor: '#004aad',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 4,
  },
  viewProfileText: { color: '#004aad', fontSize: 11 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: { justifyContent: 'center', alignItems: 'center' },
  avatarInitial: { color: '#ffffff', fontWeight: 'bold' },
});
