import { View, Text, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import { useState } from 'react';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { MapPin, Calendar, Clock, X, ChevronDown, ChevronUp, Send, RotateCcw } from 'lucide-react-native';

import type { ProjectRequest } from '@core/types/project';
import type { PosterInfo } from '@features/noticeboard/hooks/useNoticeboard';
import { AppText } from '@components/ui/AppText';
import { useTheme } from '@core/hooks/useTheme';
import { useUiStore } from '@core/stores/uiStore';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import { categoryLabel } from '@features/crew/data/categories';
import { capabilityLabel } from '@features/noticeboard/matching';
import { translateCity } from '@core/utils/cityTranslations';

type Translations = typeof en;

// Violet card palette. Local on purpose: the card reads these directly rather
// than through useTheme, whose values reach the whole app.
const VIOLET = '#6D28D9';
const VIOLET_DEEP = '#4C1D95';
const TEXT_MUTED = '#8B8898';
const ICON_MUTED = '#9B98A8';
const TINT = '#F6F5FA';

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
  /** History's hidden notices: the action becomes "Restore" instead of "Make
   *  offer", and there is no ✕ (the notice is already hidden). */
  onRestore?: () => void;
};

export function NoticeBoardCard({ request, poster, onPress, onApply, onDismiss, onMakeOffer, isApplying, isDirectInvite, directInviteLabel, compact, cardWidth, onRestore }: Props) {
  const allRoles = [...new Set(request.crewSlots.map((s) => s.category))];
  const colors = useTheme();
  const isDark = useUiStore((s) => s.isDark);
  const language = useSettingsStore((s) => s.language);
  const font = useAppFont();
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const lang: 'he' | 'en' = rtl ? 'he' : 'en';
  // Role labels with an optional required-capability suffix — one chip per distinct
  // (category, requiredCapability) so a drone slot and a general slot both show.
  const roleChips = [
    ...new Map(
      request.crewSlots.map((s) => [`${s.category}-${s.requiredCapability ?? 'general'}`, s]),
    ).values(),
  ].map((s) => {
    const base = categoryLabel(s.category, lang);
    const cap = capabilityLabel(s.category, s.requiredCapability, lang);
    return cap ? `${base} · ${cap}` : base;
  });
  // Direct invite: the card itself looks like any other; only the edge ribbon
  // and the "direct invite" badge mark it out.
  const isDI = !!isDirectInvite;

  const cardStyle = [
    styles.card,
    // The unused full layout keeps its theme border; the compact card sets its own.
    compact ? styles.cardCompact : { borderColor: colors.border },
    cardWidth !== undefined && { width: cardWidth },
  ];

  const [confirmingDismiss, setConfirmingDismiss] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);

  if (compact) {
    const timeAgo = formatTimeAgo(request.createdAt, t);
    const hasDesc = !!(request.description?.trim());
    const hasExec = !!(request.exec?.trim());
    const hasDeadline = !!(request.deadline?.trim());
    const locationText = translateCity(request.location, rtl);
    const hasLocation = !!(locationText?.trim());
    const hasMetaRow = hasExec || hasDeadline || hasLocation;

    const rowDir = rtl ? 'row-reverse' : ('row' as const);
    const flexLabel = t('builder.flexible');

    function formatDateCompact(iso?: string): string {
      if (!iso) return '—';
      if (iso === 'flexible') return flexLabel;
      const parts = iso.split('-');
      if (parts.length === 3 && parts[0].length === 4) {
        return `${parts[2]}/${parts[1]}/${parts[0].slice(2)}`;
      }
      return iso;
    }

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
      <TouchableOpacity style={cardStyle} onPress={onPress} activeOpacity={0.85}>
        {isDI && (
          <LinearGradient
            colors={['#D946EF', '#A855F7']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={[styles.ribbon, rtl ? { right: 0 } : { left: 0 }]}
          />
        )}
        {isDirectInvite && directInviteLabel && (
          <View style={[styles.directBadge, { flexDirection: rowDir }]}>
            <Send size={11} color="#A21CAF" strokeWidth={2.2} />
            <AppText weight="semiBold" style={styles.directBadgeText}>{directInviteLabel}</AppText>
          </View>
        )}

        {/* Header: [avatar] [title+location col flex:1] [✕ btn] */}
        <View style={[styles.headerRow, { flexDirection: rowDir }]}>
          {/* Avatar — leading corner (right in RTL) */}
          {poster?.photoURL ? (
            <Image source={{ uri: poster.photoURL }} style={styles.avatar} contentFit="cover" cachePolicy="memory-disk" />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <AppText weight="bold" style={styles.avatarInitial}>
                {poster?.displayName?.charAt(0)?.toUpperCase() ?? '?'}
              </AppText>
            </View>
          )}

          {/* Title + poster name + time ago */}
          <View style={[styles.headerContent, { alignItems: rtl ? 'flex-end' : 'flex-start' }]}>
            <Text
              style={[styles.cardTitle, { ...font.forText(request.title, 'bold'), textAlign: rtl ? 'right' : 'left' }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {request.title}
            </Text>
            {/* Name and age share one line: "Dana Levi - 3d ago".
                The separator is its OWN element rather than a "- " prefix on the
                time string, so the row direction places it — a leading hyphen
                inside an RTL run gets reordered by bidi and can end up on the
                wrong side of the timestamp. */}
            {(!!poster?.displayName || !!timeAgo) && (
              <View style={[styles.posterLine, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
                {!!poster?.displayName && (
                  <AppText weight="semiBold" style={[styles.posterNameCompact, { textAlign: rtl ? 'right' : 'left' }]} numberOfLines={1}>
                    {poster.displayName}
                  </AppText>
                )}
                {!!poster?.displayName && !!timeAgo && (
                  <AppText weight="regular" style={styles.posterLineDash}>
                    -
                  </AppText>
                )}
                {!!timeAgo && (
                  <AppText weight="regular" style={styles.timeAgoText} numberOfLines={1}>
                    {timeAgo}
                  </AppText>
                )}
              </View>
            )}
          </View>

          {/* ✕ dismiss — trailing corner (left in RTL). Not on an already-hidden notice. */}
          {!onRestore && (
            <TouchableOpacity
              onPress={(e) => { e.stopPropagation?.(); setConfirmingDismiss(true); }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
              style={styles.dismissInline}
              testID="notice-dismiss"
            >
              <X size={17} color={ICON_MUTED} />
            </TouchableOpacity>
          )}
        </View>

        {/* Description — tinted box */}
        {hasDesc && (
          <View style={styles.descBox}>
            <Text
              style={[styles.snippetText, { ...font.forText(request.description, 'regular'), textAlign: rtl ? 'right' : 'left' }]}
              numberOfLines={2}
            >
              {request.description}
            </Text>
          </View>
        )}

        {/* Date stat squares */}
        {hasMetaRow && (
          <View style={[styles.datesRow, { flexDirection: rowDir }]}>
            {hasLocation && (
              <View style={styles.dateSquare}>
                <MapPin size={15} color={ICON_MUTED} strokeWidth={1.6} />
                <AppText weight="regular" style={styles.dateSquareLabel}>
                  {t('noticeboard.location_label')}
                </AppText>
                <AppText weight="bold" style={styles.dateSquareValue} numberOfLines={1}>
                  {locationText}
                </AppText>
              </View>
            )}
            {hasExec && (
              <View style={styles.dateSquare}>
                <Calendar size={15} color={ICON_MUTED} strokeWidth={1.6} />
                <AppText weight="regular" style={styles.dateSquareLabel}>
                  {t('noticeboard.exec_date_label')}
                </AppText>
                <AppText weight="bold" style={styles.dateSquareValue}>
                  {formatDateCompact(request.exec)}
                </AppText>
              </View>
            )}
            {hasDeadline && (
              <View style={styles.dateSquare}>
                <Clock size={15} color={ICON_MUTED} strokeWidth={1.6} />
                <AppText weight="regular" style={styles.dateSquareLabel}>
                  {t('noticeboard.deadline_short')}
                </AppText>
                <AppText weight="bold" style={styles.dateSquareValue}>
                  {formatDateCompact(request.deadline)}
                </AppText>
              </View>
            )}
          </View>
        )}

        <View style={styles.separator} />

        {/* Bottom: make-offer button + skills toggle */}
        <View style={[styles.bottomRow, { flexDirection: rowDir }]}>
          {onRestore ? (
            <Pressable
              style={({ pressed }) => [styles.offerPill, styles.restorePill, pressed && styles.offerPillPressed, { flexDirection: rowDir }]}
              onPress={(e) => { e.stopPropagation?.(); onRestore(); }}
              accessibilityRole="button"
              accessibilityLabel={t('history.restore')}
            >
              <RotateCcw size={14} color="#ffffff" strokeWidth={2.2} />
              <AppText weight="bold" style={styles.offerPillText}>{t('history.restore')}</AppText>
            </Pressable>
          ) : (
            <Pressable
              style={({ pressed }) => [styles.offerPill, pressed && styles.offerPillPressed]}
              onPress={(e) => { e.stopPropagation?.(); onMakeOffer(); }}
            >
              <AppText weight="bold" style={styles.offerPillText}>{t('noticeboard.make_offer')}</AppText>
            </Pressable>
          )}
          <TouchableOpacity
            style={[styles.skillsBtn, { flexDirection: rowDir }]}
            onPress={(e) => { e.stopPropagation?.(); setSkillsOpen((v) => !v); }}
            activeOpacity={0.7}
          >
            <AppText weight="bold" style={styles.skillsBtnText}>
              {t('noticeboard.role_plural')} ({allRoles.length})
            </AppText>
            {skillsOpen
              ? <ChevronUp size={15} color={VIOLET} strokeWidth={2} />
              : <ChevronDown size={15} color={VIOLET} strokeWidth={2} />}
          </TouchableOpacity>
        </View>

        {/* Skills expanded list */}
        {skillsOpen && (
          <View style={styles.skillsSection}>
            {roleChips.map((role, i) => (
              <View key={i} style={styles.skillChip}>
                <AppText weight="semiBold" style={[styles.skillName, { textAlign: rtl ? 'right' : 'left' }]}>
                  {role}
                </AppText>
              </View>
            ))}
          </View>
        )}
      </TouchableOpacity>
    );
  }

  // Non-compact (full) card — preserved for future use. Its title/roles colour
  // was the shared `textColor`; the direct-invite pink branch is gone, so it
  // keeps the plain value it always had for a normal card.
  const textColor = '#004aad';
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
            {roleChips.join(' | ')}
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
    gap: 11,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#EFEDF5',
    shadowColor: '#4C1D95',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  // --- Compact card: header ---
  // Spacing between the card's sections comes from cardCompact's gap.
  headerRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 999,
    flexShrink: 0,
  },
  avatarFallback: {
    backgroundColor: VIOLET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '700',
  },
  headerContent: {
    flex: 1,
    gap: 1,
  },
  // Source order + alignSelf, never `order`: under RTL `order` flips meaning
  // and would put the ✕ on the avatar's side. 28 + hitSlop 10 each side = 48.
  dismissInline: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    alignSelf: 'flex-start',
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
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 23,
    marginBottom: 0,
    color: VIOLET_DEEP,
  },
  // One row, so the name must be the part that gives: flexShrink lets a long
  // name truncate instead of pushing the timestamp off the card. maxWidth keeps
  // the row inside headerContent, whose alignItems sizes children to content.
  posterLine: {
    alignItems: 'center',
    gap: 4,
    maxWidth: '100%',
  },
  posterNameCompact: {
    fontSize: 12.5,
    fontWeight: '600',
    color: VIOLET,
    marginTop: 0,
    flexShrink: 1,
  },
  posterLineDash: {
    fontSize: 12.5,
    color: TEXT_MUTED,
  },
  timeAgoText: {
    fontSize: 12.5,
    color: TEXT_MUTED,
    flexShrink: 0,
  },

  // --- Compact card: description + dates ---
  descBox: {
    backgroundColor: TINT,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 15,
  },
  snippetText: {
    fontSize: 13.5,
    lineHeight: 20,
    color: '#4C4859',
  },
  datesRow: {
    gap: 8,
  },
  dateSquare: {
    flex: 1,
    backgroundColor: TINT,
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  dateSquareLabel: {
    fontSize: 11.5,
    color: TEXT_MUTED,
    textAlign: 'center',
  },
  dateSquareValue: {
    fontSize: 14,
    fontWeight: '700',
    color: VIOLET_DEEP,
    textAlign: 'center',
  },

  // --- Shared separator ---
  separator: {
    height: 1,
    backgroundColor: '#F2F0F7',
  },

  // --- Compact card: bottom row ---
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  offerPill: {
    backgroundColor: VIOLET,
    height: 48,
    borderRadius: 999,
    paddingHorizontal: 30,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    shadowColor: '#4C1D95',
    shadowOpacity: 0.26,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  offerPillPressed: { backgroundColor: '#5B21B6' },
  restorePill: { alignItems: 'center', gap: 6 },
  offerPillText: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  skillsBtn: {
    alignItems: 'center',
    gap: 5,
  },
  skillsBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: VIOLET,
  },
  skillsSection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
  },
  skillChip: {
    borderWidth: 1.5,
    borderColor: VIOLET,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  skillName: {
    fontSize: 12,
    color: VIOLET,
  },

  // --- Direct invite: leading-edge accent ribbon ---
  ribbon: {
    position: 'absolute',
    top: 12,
    bottom: 12,
    width: 4,
    borderRadius: 3,
  },

  // --- Shared: direct invite badge ---
  directBadge: {
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FCE7F8',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  directBadgeText: {
    color: '#A21CAF',
    fontSize: 10,
    fontWeight: '600',
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
