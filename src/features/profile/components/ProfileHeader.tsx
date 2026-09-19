import { View, Text, TextInput, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { AppText } from '@components/ui/AppText';
import { AverageRatingDisplay } from '@features/reviews/components/AverageRatingDisplay';
import { useAppFont } from '@core/hooks/useAppFont';
import { useSettingsStore } from '@core/stores/settingsStore';
import { ROLE_BY_ID, labelOf } from '@features/crew/data/categories';
import type { Review } from '@core/types/project';

type ProfileHeaderProps = {
  photoURL: string | null;
  name: string;
  isEditing: boolean;
  onPhotoPress?: () => void;
  onNameChange?: (v: string) => void;
  size?: number;
  email?: string;
  reviews?: Review[];
  /** The professional's roles; shown as one line under the name, joined with
   *  " · ". Omitted or empty renders nothing. */
  roleSkills?: { role: string; specializations: string[] }[];
  /**
   * Colours only — layout is the same either way.
   * 'band' (default): white-on-violet, for the profile screens, where this sits
   * on the gradient band. 'light': the original violet-on-light, for onboarding,
   * which has no band.
   */
  tone?: 'band' | 'light';
};

export function ProfileHeader({
  photoURL,
  name,
  isEditing,
  onPhotoPress,
  onNameChange,
  size = 90,
  email,
  reviews,
  roleSkills,
  tone = 'band',
}: ProfileHeaderProps) {
  const font = useAppFont();
  const lang: 'he' | 'en' = useSettingsStore((s) => s.language) === 'he' ? 'he' : 'en';
  const onBand = tone === 'band';
  const rolesLine = (roleSkills ?? [])
    .map((r) => (ROLE_BY_ID[r.role] ? labelOf(ROLE_BY_ID[r.role], lang) : null))
    .filter(Boolean)
    .join(' · ');
  const initials = name
    .split(' ')
    .map((n) => n[0] ?? '')
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <View style={[styles.headerContent, onBand && styles.headerContentBand]}>
      <TouchableOpacity
        onPress={isEditing ? onPhotoPress : undefined}
        disabled={!isEditing}
        activeOpacity={0.8}
        style={[styles.avatarWrap, onBand && styles.avatarRing, { width: size, height: size, borderRadius: size / 2 }]}
      >
        {photoURL ? (
          <Image
            source={{ uri: photoURL }}
            style={[styles.avatarImage, { borderRadius: size / 2 }]}
          />
        ) : (
          <View style={[styles.avatarFallback, onBand && styles.avatarFallbackBand, { borderRadius: size / 2 }]}>
            <AppText
              weight="bold"
              style={[styles.avatarInitials, onBand && styles.avatarInitialsBand, { fontSize: onBand ? Math.round(size * 0.34) : size * 0.36 }]}
            >
              {initials}
            </AppText>
          </View>
        )}
        {isEditing && (
          <View style={[styles.editOverlay, onBand && styles.editOverlayBand, { borderBottomLeftRadius: size / 2, borderBottomRightRadius: size / 2 }]}>
            <Text style={[styles.editOverlayText, { ...font.semiBold }]}>Edit</Text>
          </View>
        )}
      </TouchableOpacity>

      {isEditing ? (
        <TextInput
          style={[styles.nameInput, onBand && styles.nameInputBand, { ...font.bold }]}
          value={name}
          onChangeText={onNameChange}
          autoCapitalize="words"
          placeholderTextColor={onBand ? 'rgba(255,255,255,0.6)' : undefined}
        />
      ) : (
        onBand ? (
          // Plain Text: AppText applies its font after the style, which would undo the 800.
          <Text style={[styles.name, styles.nameBand, extraBold(font.forText(name, 'bold'))]} numberOfLines={2}>
            {name}
          </Text>
        ) : (
          <AppText weight="bold" style={styles.name} numberOfLines={2}>
            {name}
          </AppText>
        )
      )}

      {!isEditing && !!rolesLine && (
        <AppText weight="regular" style={[styles.roles, !onBand && styles.rolesLight]} numberOfLines={1} ellipsizeMode="tail">
          {rolesLine}
        </AppText>
      )}

      {email && <Text style={[styles.email, { ...font.regular }]}>{email}</Text>}

      {!isEditing && reviews && <AverageRatingDisplay reviews={reviews} />}
    </View>
  );
}

/** The band name is 800: Heebo has an ExtraBold face; Montserrat takes the weight. */
function extraBold(f: { fontFamily: string }) {
  return f.fontFamily.startsWith('Heebo')
    ? { fontFamily: 'Heebo-ExtraBold', fontWeight: '800' as const }
    : { fontFamily: f.fontFamily, fontWeight: '800' as const };
}

const styles = StyleSheet.create({
  headerContent: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  /** The band supplies the padding; its identity block is spaced 10. */
  headerContentBand: { paddingVertical: 0, gap: 10 },
  avatarWrap: {
    overflow: 'hidden',
  },
  // On the band: a translucent white ring so a light-edged photo still reads
  // against the gradient.
  avatarRing: { borderWidth: 3, borderColor: 'rgba(255,255,255,0.6)' },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    flex: 1,
    backgroundColor: 'rgba(0,74,173,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  avatarInitials: {
    fontWeight: '700',
    color: '#004aad',
  },
  avatarFallbackBand: { backgroundColor: 'rgba(255,255,255,0.18)' },
  avatarInitialsBand: { fontWeight: '800', color: '#FFFFFF' },
  editOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingVertical: 4,
  },
  editOverlayBand: { backgroundColor: 'rgba(26,22,38,0.55)' },
  editOverlayText: { color: '#fff', fontSize: 11, textAlign: 'center', fontWeight: '600' },
  name: { fontSize: 20, fontWeight: '700', color: '#004aad', textAlign: 'center' },
  nameBand: { fontSize: 21, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.2 },
  roles: { fontSize: 12.5, color: 'rgba(255,255,255,0.8)', textAlign: 'center', marginTop: -4 },
  rolesLight: { color: 'rgba(0,74,173,0.6)' },
  nameInput: {
    fontSize: 20,
    fontWeight: '700',
    color: '#004aad',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,74,173,0.3)',
    textAlign: 'center',
    paddingVertical: 4,
    minWidth: 160,
  },
  nameInputBand: {
    color: '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderBottomWidth: 0,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  email: { fontSize: 13, color: 'rgba(0,74,173,0.6)' },
});
