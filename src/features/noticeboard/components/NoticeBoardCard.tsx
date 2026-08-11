import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useState } from 'react';
import { Image } from 'expo-image';
import { MapPin, Calendar, Clock, X } from 'lucide-react-native';

import type { ProjectRequest } from '@core/types/project';
import type { PosterInfo } from '@features/noticeboard/hooks/useNoticeboard';
import { AppText } from '@components/ui/AppText';
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
  return (key: string, vars?: Record<string, string | number>): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    if (typeof result !== 'string') return key;
    if (!vars) return result;
    return result.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ''));
  };
}

function formatTimeAgo(
  ts: { seconds: number },
  t: (key: string, vars?: Record<string, string | number>) => string
): string {
  const diff = Math.floor((Date.now() - ts.seconds * 1000) / 1000);
  if (diff < 60) return t('noticeboard.just_now');
  if (diff < 3600) return t('noticeboard.minutes_ago', { n: Math.floor(diff / 60) });
  if (diff < 86400) return t('noticeboard.hours_ago', { n: Math.floor(diff / 3600) });
  return t('noticeboard.days_ago', { n: Math.floor(diff / 86400) });
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
  const cardBg = isDirectInvite ? '#004aad' : '#ffffff';
  const textColor = isDirectInvite ? '#cb6ce6' : '#004aad';

  const cardStyle = [
    styles.card,
    compact && styles.cardCompact,
    { backgroundColor: cardBg, borderColor: isDirectInvite ? '#cb6ce6' : colors.border },
    cardWidth !== undefined && { width: cardWidth },
  ];

  const [confirmingDismiss, setConfirmingDismiss] = useState(false);

  if (compact) {
    const timeAgo = formatTimeAgo(request.createdAt, t);
    const visibleRoles = translatedRoles.slice(0, 3);
    const extraRoles = translatedRoles.length - 3;
    const hasDesc = !!(request.description?.trim());
    const hasExec = !!(request.exec?.trim());
    const hasDeadline = !!(request.deadline?.trim());
    const hasMetaRow = hasExec || hasDeadline;
    const locationText = translateCity(request.location, rtl);

    if (confirmingDismiss) {
      return (
        <View style={[cardStyle, styles.confirmRow]}>
          <AppText weight="regular" style={[styles.confirmText, { color: colors.textSec }]}>
            {t('noticeboard.dismiss_body')}
          </AppText>
          <View style={styles.confirmBtns}>
            <TouchableOpacity style={styles.confirmCancel} onPress={() => setConfirmingDismiss(false)}>
              <AppText weight="semiBold" style={[styles.confirmCancelText, { color: colors.textMuted }]}>
                {t('noticeboard.dismiss_cancel')}
              </AppText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmYes} onPress={() => { setConfirmingDismiss(false); onDismiss(); }}>
              <AppText weight="bold" style={styles.confirmYesText}>
                {t('noticeboard.dismiss_confirm')}
              </AppText>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
      <View style={{ position: 'relative' }}>
      <TouchableOpacity style={cardStyle} onPress={onPress} activeOpacity={0.85}>
        {isDirectInvite && directInviteLabel && (
          <View style={styles.directBadge}>
            <AppText weight="bold" style={styles.directBadgeText}>{directInviteLabel}</AppText>
          </View>
        )}

        {/* Header: avatar + title + location/time */}
        <View style={[styles.headerRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          {poster?.photoURL ? (
            <Image source={{ uri: poster.photoURL }} style={styles.avatar} contentFit="cover" cachePolicy="memory-disk" />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <AppText weight="bold" style={styles.avatarInitial}>
                {poster?.displayName?.charAt(0)?.toUpperCase() ?? '?'}
              </AppText>
            </View>
          )}
          <View style={[styles.headerContent, rtl ? { paddingLeft: 36 } : { paddingRight: 36 }]}>
            <Text
              style={[styles.cardTitle, { ...font.forText(request.title, 'bold'), color: textColor, textAlign: rtl ? 'right' : 'left' }]}
              numberOfLines={2}
            >
              {request.title}
            </Text>
            <View style={[styles.locationTimeRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
              <MapPin size={11} color={colors.textMuted} strokeWidth={1.5} />
              <Text
                style={[styles.locationTimeText, { ...font.forText(locationText, 'regular'), color: colors.textMuted }]}
                numberOfLines={1}
              >
                {locationText}{timeAgo ? ` · ${timeAgo}` : ''}
              </Text>
            </View>
          </View>
        </View>

        {/* Description snippet — hidden if empty */}
        {hasDesc && (
          <Text
            style={[styles.snippetText, { ...font.forText(request.description, 'regular'), color: colors.textSec, textAlign: rtl ? 'right' : 'left' }]}
            numberOfLines={2}
          >
            {request.description}
          </Text>
        )}

        {/* Meta: execution dates + deadline */}
        {hasMetaRow && (
          <View style={[styles.metaRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
            {hasExec && (
              <View style={[styles.metaItem, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                <Calendar size={11} color={colors.textMuted} strokeWidth={1.5} />
                <Text style={[styles.metaText, { ...font.forText(request.exec!, 'regular'), color: colors.textMuted }]}>
                  {request.exec}
                </Text>
              </View>
            )}
            {hasDeadline && (
              <View style={[styles.metaItem, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                <Clock size={11} color={colors.textMuted} strokeWidth={1.5} />
                <AppText weight="regular" style={[styles.metaText, { color: colors.textMuted }]}>
                  {request.deadline === 'flexible' ? t('builder.flexible') : request.deadline}
                </AppText>
              </View>
            )}
          </View>
        )}

        <View style={styles.separator} />

        {/* Bottom: make-offer button + role pills */}
        <View style={[styles.bottomRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
          <TouchableOpacity
            style={styles.offerPill}
            onPress={(e) => { e.stopPropagation?.(); onMakeOffer(); }}
            activeOpacity={0.8}
          >
            <AppText weight="bold" style={styles.offerPillText}>{t('noticeboard.make_offer')}</AppText>
          </TouchableOpacity>
          <View style={[styles.pillsRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
            {visibleRoles.map((role, i) => (
              <View key={i} style={[styles.rolePill, { borderColor: isDirectInvite ? '#cb6ce6' : colors.border }]}>
                <Text style={[styles.rolePillText, { ...font.forText(role, 'semiBold'), color: textColor }]} numberOfLines={1}>
                  {role}
                </Text>
              </View>
            ))}
            {extraRoles > 0 && (
              <View style={[styles.rolePill, { borderColor: isDirectInvite ? '#cb6ce6' : colors.border }]}>
                <Text style={[styles.rolePillText, { ...font.semiBold, color: textColor }]}>+{extraRoles}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.dismissAbsolute, rtl ? { left: 14 } : { right: 14 }]}
        onPress={() => setConfirmingDismiss(true)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        activeOpacity={0.7}
      >
        <X size={16} color={colors.textMuted} />
      </TouchableOpacity>
      </View>
    );
  }

  // Non-compact (full) card — preserved for future use
  return (
    <TouchableOpacity style={cardStyle} onPress={onPress} activeOpacity={0.85}>
      {isDirectInvite && directInviteLabel && (
        <View style={styles.directBadge}>
          <AppText weight="bold" style={styles.directBadgeText}>{directInviteLabel}</AppText>
        </View>
      )}
      {poster && (
        <View style={styles.posterRow}>
          {poster.photoURL ? (
            <Image source={{ uri: poster.photoURL }} style={styles.posterAvatar} contentFit="cover" cachePolicy="memory-disk" />
          ) : (
            <View style={[styles.posterAvatar, styles.posterAvatarFallback]}>
              <AppText weight="bold" style={styles.posterInitial}>{poster.displayName.charAt(0).toUpperCase()}</AppText>
            </View>
          )}
          <Text style={[styles.posterName, { ...font.forText(poster.displayName, 'medium'), color: colors.textMuted }]}>{poster.displayName}</Text>
        </View>
      )}
      <View style={styles.top}>
        <View style={styles.info}>
          <Text style={[styles.title, { ...font.forText(request.title, 'bold'), color: textColor, textAlign: rtl ? 'right' : 'left' }]} numberOfLines={1}>{request.title}</Text>
          <View style={[styles.locationRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
            <MapPin size={13} color={textColor} strokeWidth={1.5} />
            <Text style={[styles.location, { ...font.forText(translateCity(request.location, rtl), 'regular'), color: textColor, textAlign: rtl ? 'right' : 'left' }]} numberOfLines={1}>
              {translateCity(request.location, rtl)}
            </Text>
          </View>
          {!!(request.exec) && (
            <Text style={[styles.meta, { ...font.forText(request.exec, 'regular'), color: textColor, textAlign: rtl ? 'right' : 'left' }]}>
              {request.exec}
            </Text>
          )}
          <AppText weight="semiBold" style={[styles.roles, { color: textColor, textAlign: rtl ? 'right' : 'left' }]} numberOfLines={2}>
            {translatedRoles.join(' | ')}
          </AppText>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.offerActionBtn]}
            onPress={(e) => { e.stopPropagation?.(); onMakeOffer(); }}
            activeOpacity={0.8}
          >
            <Text style={[styles.offerIcon, { ...font.bold }]}>₪</Text>
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
    padding: 14,
  },

  // --- Compact card: header ---
  headerRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    flexShrink: 0,
  },
  avatarFallback: {
    backgroundColor: '#004aad',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  headerContent: {
    flex: 1,
  },
  dismissAbsolute: {
    position: 'absolute',
    top: 14,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  confirmRow: {
    gap: 12,
    justifyContent: 'center',
    minHeight: 80,
  },
  confirmText: {
    fontSize: 14,
    textAlign: 'center',
  },
  confirmBtns: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  confirmCancel: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  confirmCancelText: {
    fontSize: 14,
  },
  confirmYes: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#e53935',
  },
  confirmYesText: {
    fontSize: 14,
    color: '#fff',
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
    marginBottom: 3,
  },
  locationTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationTimeText: {
    fontSize: 12,
    flex: 1,
  },

  // --- Compact card: description + meta ---
  snippetText: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 6,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
  },

  // --- Shared separator ---
  separator: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 8,
  },

  // --- Compact card: bottom row ---
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  offerPill: {
    backgroundColor: '#004aad',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
    flexShrink: 0,
  },
  offerPillText: {
    fontSize: 13,
    color: '#ffffff',
    fontWeight: '700',
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
    justifyContent: 'flex-end',
  },
  rolePill: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    backgroundColor: 'rgba(0,74,173,0.06)',
  },
  rolePillText: {
    fontSize: 11,
  },

  // --- Shared: direct invite badge ---
  directBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#cb6ce6',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 8,
  },
  directBadgeText: {
    color: '#004aad',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // --- Non-compact card ---
  posterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  posterAvatar: { width: 28, height: 28, borderRadius: 14 },
  posterAvatarFallback: { backgroundColor: '#004aad', alignItems: 'center', justifyContent: 'center' },
  posterInitial: { color: '#fff', fontSize: 12, fontWeight: '700' },
  posterName: { fontSize: 12, fontWeight: '500' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  info: { flex: 1 },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  locationRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3, gap: 4 },
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
  offerActionBtn: { backgroundColor: 'rgba(0,74,173,0.15)', borderWidth: 1.5, borderColor: '#004aad' },
  offerIcon: { fontSize: 16, color: '#004aad', fontWeight: '800' },
});
