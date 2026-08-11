import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Check } from 'lucide-react-native';
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
  const displayName = professionalProfile?.displayName ?? '…';

  return (
    <View style={styles.container}>
      <View style={styles.infoSquare}>
        {/* Top: avatar + name/role + ✓ button */}
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
            {projectTitle ? (
              <Text style={[styles.forProject, { ...font.forText(projectTitle, 'regular') }]} numberOfLines={1}>
                {t('offers.for_project')}{projectTitle}
              </Text>
            ) : null}
            <Text style={[styles.name, { ...font.forText(displayName, 'bold') }]} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={[styles.role, { ...font.forText(offer.subcategory ?? offer.category, 'regular') }]} numberOfLines={1}>
              {offer.subcategory ?? offer.category}
            </Text>
          </View>
          <TouchableOpacity
            onPress={onAccept}
            style={[styles.acceptBtn, isAccepting && styles.disabled]}
            disabled={isAccepting}
            activeOpacity={0.8}
          >
            {isAccepting ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Check size={22} color="#ffffff" />
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        {/* Bottom: price + view profile + deny */}
        <View style={[styles.bottomRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          <Text style={[styles.price, { ...font.bold }]}>
            ₪{offer.price.toLocaleString()}
          </Text>
          <View style={[styles.bottomActions, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
            <TouchableOpacity onPress={onPressProfile} activeOpacity={0.7}>
              <Text style={[styles.viewProfileText, { ...font.semiBold }]}>
                {t('offers.view_profile')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onReject} activeOpacity={0.7}>
              <Text style={[styles.denyText, { ...font.semiBold }]}>
                {t('offers.deny')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    width: '100%',
    marginBottom: 12,
  },
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
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
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
    gap: 2,
  },
  forProject: {
    fontSize: 10,
    color: '#888',
    fontStyle: 'italic',
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: '#004aad',
  },
  role: {
    fontSize: 12,
    color: '#888888',
  },
  acceptBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#004aad',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  disabled: { opacity: 0.6 },
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginBottom: 10,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  price: {
    fontSize: 20,
    fontWeight: '700',
    color: '#004aad',
  },
  bottomActions: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  viewProfileText: {
    fontSize: 12,
    color: '#004aad',
    textDecorationLine: 'underline',
  },
  denyText: {
    fontSize: 12,
    color: '#888888',
    textDecorationLine: 'underline',
  },
});
