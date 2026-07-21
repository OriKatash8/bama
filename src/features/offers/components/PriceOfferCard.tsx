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
  const rtl = language === 'he';
  const rowDir = rtl ? 'row-reverse' : 'row' as const;
  const displayName = professionalProfile?.displayName ?? '…';

  return (
    <View style={[styles.card, { backgroundColor: '#ffffff', flexDirection: rowDir }]}>
      <View style={[styles.profileBlock, { alignItems: rtl ? 'flex-end' : 'flex-start' }]}>
        {professionalProfile?.photoURL ? (
          <Image
            source={{ uri: professionalProfile.photoURL, width: 52, height: 52 }}
            style={styles.avatar}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.primary }]}>
            <Text style={[styles.avatarInitial, { fontFamily: font.bold }]}>{displayName.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <Text style={[styles.name, { fontFamily: font.bold, textAlign: rtl ? 'right' : 'left' }]} numberOfLines={1}>
          {displayName}
        </Text>
        <Text style={[styles.role, { color: colors.textSec, fontFamily: font.regular, textAlign: rtl ? 'right' : 'left' }]} numberOfLines={1}>
          {offer.subcategory}
        </Text>
        <Text style={[styles.price, { fontFamily: font.bold, textAlign: rtl ? 'right' : 'left' }]}>
          ₪{offer.price.toLocaleString()}
        </Text>
      </View>

      <View style={styles.buttonsCol}>
        <TouchableOpacity style={styles.xBtn} onPress={onReject} activeOpacity={0.8}>
          <X size={16} color="#757575" strokeWidth={2.5} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.acceptBtn, isAccepting && styles.disabled]}
          onPress={onAccept}
          disabled={isAccepting}
          activeOpacity={0.8}
        >
          {isAccepting ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Check size={18} color="#ffffff" strokeWidth={2.5} />
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.viewProfileBtn} onPress={onPressProfile} activeOpacity={0.8}>
          <Text style={[styles.viewProfileText, { fontFamily: font.semiBold }]}>{t('offers.view_profile')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  profileBlock: { flex: 1 },
  avatar: { width: 52, height: 52, borderRadius: 26, marginBottom: 6 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#ffffff', fontSize: 20 },
  name: { fontSize: 15, color: '#004aad', marginBottom: 1 },
  role: { fontSize: 12, marginBottom: 2 },
  price: { fontSize: 14, color: '#004aad' },
  buttonsCol: { alignItems: 'flex-start', gap: 8 },
  xBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#004aad',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.6 },
  viewProfileBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#004aad',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  viewProfileText: { color: '#004aad', fontSize: 12 },
});
