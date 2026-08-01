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
  projectTitle?: string;
  onPressProfile: () => void;
  onAccept: () => void;
  onReject: () => void;
  isAccepting: boolean;
};

export function PriceOfferCard({ offer, professionalProfile, projectTitle, onPressProfile, onAccept, onReject, isAccepting }: Props) {
  const colors = useTheme();
  const font = useAppFont();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const rowDir = rtl ? 'row-reverse' : 'row' as const;
  const textAlign = rtl ? 'right' : 'left' as const;
  const displayName = professionalProfile?.displayName ?? '…';

  return (
    <View style={[styles.container, { flexDirection: rowDir }]}>
      {/* Square 1: X button */}
      <TouchableOpacity onPress={onReject} style={styles.xSquare} activeOpacity={0.8}>
        <X size={20} color="#666666" />
      </TouchableOpacity>

      {/* Square 2: ✓ button */}
      <TouchableOpacity
        onPress={onAccept}
        style={[styles.acceptSquare, isAccepting && styles.disabled]}
        disabled={isAccepting}
        activeOpacity={0.8}
      >
        {isAccepting ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <Check size={20} color="#ffffff" />
        )}
      </TouchableOpacity>

      {/* Square 3: professional info */}
      <View style={styles.infoSquare}>
        <View style={[styles.infoOuterRow, { flexDirection: rowDir }]}>
          {/* View Profile button */}
          <TouchableOpacity onPress={onPressProfile} style={styles.viewProfileBtn} activeOpacity={0.8}>
            <Text style={[styles.viewProfileText, { fontFamily: font.semiBold }]}>{t('offers.view_profile')}</Text>
          </TouchableOpacity>

          {/* Professional info + avatar */}
          <View style={[styles.infoRow, { flexDirection: rowDir }]}>
            <View style={styles.infoCol}>
              {projectTitle && (
                <Text style={[styles.projectTitle, { fontFamily: font.forText(projectTitle, 'regular'), textAlign }]} numberOfLines={1} ellipsizeMode="tail">
                  {t('offers.for_project')}{projectTitle}
                </Text>
              )}
              <Text style={[styles.name, { fontFamily: font.forText(displayName, 'bold'), textAlign }]} numberOfLines={1} ellipsizeMode="tail">
                {displayName}
              </Text>
              <Text style={[styles.role, { fontFamily: font.forText(offer.subcategory, 'regular'), textAlign }]} numberOfLines={1} ellipsizeMode="tail">
                {offer.subcategory}
              </Text>
              <Text style={[styles.price, { fontFamily: font.bold, textAlign }]}>
                ₪{offer.price.toLocaleString()}
              </Text>
            </View>

            {professionalProfile?.photoURL ? (
              <Image
                source={{ uri: professionalProfile.photoURL, width: 32, height: 32 }}
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'stretch',
    gap: 8,
    paddingHorizontal: 12,
    width: '100%',
    marginBottom: 12,
  },
  xSquare: {
    width: 52,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  acceptSquare: {
    width: 52,
    borderRadius: 12,
    backgroundColor: '#004aad',
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabled: { opacity: 0.6 },
  infoSquare: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  infoOuterRow: { alignItems: 'center', flex: 1 },
  infoRow: { flex: 1, alignItems: 'center', justifyContent: 'space-between' },
  infoCol: { flex: 1 },
  projectTitle: { fontSize: 10, color: '#888', fontStyle: 'italic' },
  name: { fontWeight: 'bold', color: '#004aad', fontSize: 12 },
  role: { color: '#888888', fontSize: 11 },
  price: { fontWeight: 'bold', color: '#004aad', fontSize: 12 },
  viewProfileBtn: {
    marginEnd: 8,
    borderWidth: 1,
    borderColor: '#004aad',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  viewProfileText: { color: '#004aad', fontSize: 10 },
  avatar: { width: 32, height: 32, borderRadius: 16, marginStart: 10, alignSelf: 'center' },
  avatarFallback: { justifyContent: 'center', alignItems: 'center' },
  avatarInitial: { color: '#ffffff', fontWeight: 'bold' },
});
