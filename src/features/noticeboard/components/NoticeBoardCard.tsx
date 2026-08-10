import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Trash2 } from 'lucide-react-native';

const LOCATION_ICON = require('../../../../assets/images/location-icon.png');
import type { ProjectRequest } from '@core/types/project';
import type { PosterInfo } from '@features/noticeboard/hooks/useNoticeboard';
import { useTheme } from '@core/hooks/useTheme';
import { useUiStore } from '@core/stores/uiStore';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import { CATEGORY_LABEL_KEY } from '@features/crew/data/categories';
import { translateCity } from '@core/utils/cityTranslations';

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
  request: ProjectRequest;
  poster?: PosterInfo;
  onPress: () => void;
  onApply: () => void;
  onDismiss: () => void;
  onMakeOffer: () => void;
  isApplying: boolean;
  isDirectInvite?: boolean;
  directInviteLabel?: string;
  compact?: boolean;
  cardWidth?: number;
};

export function NoticeBoardCard({ request, poster, onPress, onApply, onDismiss, onMakeOffer, isApplying, isDirectInvite, directInviteLabel, compact, cardWidth }: Props) {
  const allRoles = [...new Set(request.crewSlots.map((s) => s.category))];
  const colors = useTheme();
  const isDark = useUiStore((s) => s.isDark);
  const language = useSettingsStore((s) => s.language);
  const font = useAppFont();
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const translatedRoles = allRoles.map(r =>
    rtl && CATEGORY_LABEL_KEY[r] ? t(CATEGORY_LABEL_KEY[r]) : r
  );
  const cardBg = isDirectInvite ? '#004aad' : (isDark ? '#ffffff' : '#ffffff');
  const textColor = isDirectInvite ? '#cb6ce6' : '#004aad';

  const cardStyle = [
    styles.card,
    compact && styles.cardCompact,
    { backgroundColor: cardBg, borderColor: isDirectInvite ? '#cb6ce6' : colors.border },
    cardWidth !== undefined && { width: cardWidth },
  ];

  if (compact) {
    const rowDir: 'row' | 'row-reverse' = rtl ? 'row' : 'row-reverse';

    return (
      <TouchableOpacity style={[cardStyle]} onPress={onPress} activeOpacity={0.85}>
        {isDirectInvite && directInviteLabel && (
          <View style={styles.directBadge}>
            <Text style={[styles.directBadgeText, { ...font.bold }]}>{directInviteLabel}</Text>
          </View>
        )}

        {/* Main row: side column (trash + avatar) + content */}
        <View style={[styles.compactMain, { flexDirection: rowDir }]}>
          <View style={styles.sideCol}>
            <TouchableOpacity
              style={styles.trashBtn}
              onPress={(e) => { e.stopPropagation?.(); onDismiss(); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.7}
            >
              <Trash2 size={16} color="#e53935" />
            </TouchableOpacity>
            {poster?.photoURL ? (
              <Image
                source={{ uri: poster.photoURL }}
                style={styles.compactAvatar}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            ) : (
              <View style={[styles.compactAvatar, styles.avatarFallback]}>
                <Text style={[styles.avatarInitial, { ...font.bold }]}>
                  {poster?.displayName?.charAt(0)?.toUpperCase() ?? '?'}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.compactContent}>
            <Text
              style={[styles.titleCompact, { ...font.forText(request.title, 'bold'), color: textColor, textAlign: rtl ? 'right' : 'left' }]}
              numberOfLines={2}
            >
              {request.title}
            </Text>
            <View style={[styles.locationRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
              <Image
                source={LOCATION_ICON}
                style={[styles.locationIcon, { marginRight: rtl ? 0 : 4, marginLeft: rtl ? 4 : 0 }]}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
              <Text
                style={[styles.locationCompact, { ...font.regular, color: textColor, textAlign: rtl ? 'right' : 'left' }]}
                numberOfLines={1}
              >
                {translateCity(request.location, rtl)}
              </Text>
            </View>
          </View>
        </View>

        {/* Grey separator */}
        <View style={styles.separator} />

        {/* Bottom row: offer button + roles */}
        <View style={[styles.bottomRow, { flexDirection: rowDir }]}>
          <TouchableOpacity
            style={styles.offerPill}
            onPress={(e) => { e.stopPropagation?.(); onMakeOffer(); }}
            activeOpacity={0.8}
          >
            <Text style={[styles.offerPillText, { ...font.bold }]}>{t('noticeboard.make_offer')}</Text>
          </TouchableOpacity>
          <Text
            style={[styles.rolesCompact, { ...font.semiBold, color: textColor, textAlign: rtl ? 'right' : 'left', flex: 1 }]}
            numberOfLines={2}
          >
            {translatedRoles.join(' · ')}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={cardStyle} onPress={onPress} activeOpacity={0.85}>
      {isDirectInvite && directInviteLabel && (
        <View style={styles.directBadge}>
          <Text style={[styles.directBadgeText, { ...font.bold }]}>{directInviteLabel}</Text>
        </View>
      )}
      {poster && (
        <View style={styles.posterRow}>
          {poster.photoURL ? (
            <Image source={{ uri: poster.photoURL }} style={styles.posterAvatar} contentFit="cover" cachePolicy="memory-disk" />
          ) : (
            <View style={[styles.posterAvatar, styles.posterAvatarFallback]}>
              <Text style={[styles.posterInitial, { ...font.bold }]}>{poster.displayName.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <Text style={[styles.posterName, { ...font.forText(poster.displayName, 'medium'), color: colors.textMuted }]}>{poster.displayName}</Text>
        </View>
      )}
      <View style={styles.top}>
        <View style={styles.info}>
          <Text style={[styles.title, { ...font.forText(request.title, 'bold'), color: textColor, textAlign: rtl ? 'right' : 'left' }]} numberOfLines={1}>{request.title}</Text>
          <View style={[styles.locationRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
            <Image
              source={LOCATION_ICON}
              style={[styles.locationIcon, { marginRight: rtl ? 0 : 4, marginLeft: rtl ? 4 : 0 }]}
              contentFit="contain" cachePolicy="memory-disk"
            />
            <Text style={[styles.location, { ...font.regular, color: textColor, textAlign: rtl ? 'right' : 'left' }]} numberOfLines={1}>{translateCity(request.location, rtl)}</Text>
          </View>
          {!!(request.exec) && (
            <Text style={[styles.meta, { ...font.forText(request.exec, 'regular'), color: textColor, textAlign: rtl ? 'right' : 'left' }]}>
              {request.exec}
            </Text>
          )}
          <Text style={[styles.roles, { ...font.semiBold, color: textColor, textAlign: rtl ? 'right' : 'left' }]} numberOfLines={2}>
            {translatedRoles.join(' | ')}
          </Text>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.offerBtn]}
            onPress={(e) => { e.stopPropagation?.(); onMakeOffer(); }}
            activeOpacity={0.8}
          >
            <Text style={[styles.offerIcon, { ...font.bold }]}>₪</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.dismissBtn]}
            onPress={(e) => { e.stopPropagation?.(); onDismiss(); }}
            activeOpacity={0.8}
          >
            <Text style={[styles.dismissIcon, { ...font.bold }]}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 6,
    borderWidth: 1,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  cardCompact: {
    marginHorizontal: 0,
    marginVertical: 0,
    padding: 12,
  },
  titleCompact: { fontSize: 13, fontWeight: '700' },
  locationCompact: { fontSize: 11, flex: 1 },
  metaCompact: { fontSize: 11 },
  rolesCompact: { fontSize: 11, fontWeight: '600' },
  offerPill: {
    backgroundColor: '#004aad',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    alignItems: 'center',
  },
  offerPillText: { fontSize: 13, color: '#ffffff', fontWeight: '700' },
  compactMain: {
    gap: 10,
    marginBottom: 0,
    alignItems: 'flex-start',
  },
  sideCol: {
    width: 40,
    alignItems: 'center',
    gap: 6,
  },
  trashBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarFallback: {
    backgroundColor: '#004aad',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  compactContent: {
    flex: 1,
    gap: 4,
  },
  separator: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 10,
  },
  bottomRow: {
    alignItems: 'center',
    gap: 8,
  },
  directBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#cb6ce6',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 8,
  },
  directBadgeText: { color: '#004aad', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  posterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  posterAvatar: { width: 28, height: 28, borderRadius: 14 },
  posterAvatarFallback: { backgroundColor: '#004aad', alignItems: 'center', justifyContent: 'center' },
  posterInitial: { color: '#fff', fontSize: 12, fontWeight: '700' },
  posterName: { fontSize: 12, fontWeight: '500' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  info: { flex: 1 },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  locationRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  locationIcon: { width: 14, height: 14 },
  location: { fontSize: 13, flex: 1 },
  meta: { fontSize: 12 },
  roles: { fontSize: 12, marginTop: 3, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offerBtn: { backgroundColor: 'rgba(0,74,173,0.15)', borderWidth: 1.5, borderColor: '#004aad' },
  dismissBtn: { backgroundColor: 'rgba(229,57,53,0.15)', borderWidth: 1.5, borderColor: '#e53935' },
  descBox: {
    marginTop: 12,
    borderWidth: 1.5,
    borderColor: '#004aad',
    borderRadius: 10,
    padding: 10,
    backgroundColor: 'rgba(0,74,173,0.08)',
  },
  descText: { fontSize: 13, lineHeight: 18 },
  disabled: { opacity: 0.5 },
  offerIcon: { fontSize: 16, color: '#004aad', fontWeight: '800' },
  dismissIcon: { fontSize: 14, color: '#e53935', fontWeight: '700' },
});
