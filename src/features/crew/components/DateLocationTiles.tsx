import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CalendarDays, Clock, MapPin, X } from 'lucide-react-native';
import { BottomSheet } from '@components/ui/BottomSheet';
import { PressableScale } from '@components/ui/PressableScale';
import { useAppFont } from '@core/hooks/useAppFont';

/**
 * The start date / end date / location fields, ONE design for every form that
 * asks for them: the home builder's step 1 and the "Tell me about your project"
 * sheet on a professional's profile. They used to be copied between the two
 * screens and drifted; this is the single copy.
 *
 *   DateLocationHeader     the "Dates and location" title and its one "?"
 *   DateLocationHelpSheet  the three fields' help texts, one after another
 *   DateLocationTile       one tile: icon tile + tag/✕ on top, name and
 *                          "Choose" or the value below. The whole tile opens
 *                          the field's picker.
 */

/** The wizard's flat palette (home builder, step 1). */
export const DL = {
  text: '#16132B',
  textSec: '#5B5870',
  placeholder: '#8A8799',
  accent: '#5B3FE0',
  rowSelectedBg: '#F1EEFF',
  rowBorder: '#ECE9F5',
  emptyBg: '#F7F6FB',
  tagBg: '#EEEDF3',
  tagText: '#6A6780',
  tileBg: '#EFECFA',
  error: '#fc8181',
} as const;
/** Gap between the three tiles. */
export const DL_TILE_GAP = 10;

type T = (key: string, vars?: Record<string, string>) => string;
export type DateLocationField = 'exec' | 'deadline' | 'location';

/** The field's icon, in the icon tile's colour (white once the tile is filled). */
function FieldIcon({ field, color, tileBg }: { field: DateLocationField; color: string; tileBg: string }) {
  if (field === 'location') return <MapPin size={18} color={color} strokeWidth={1.8} />;
  if (field === 'exec') return <CalendarDays size={18} color={color} strokeWidth={1.8} />;
  // End date: a calendar with a small clock at its bottom corner. The clock's
  // fill punches it out of the calendar's lines, so it takes the tile's colour.
  return (
    <View style={styles.deadlineIcon}>
      <CalendarDays size={18} color={color} strokeWidth={1.8} />
      <View style={[styles.deadlineClock, { backgroundColor: tileBg }]}>
        <Clock size={9} color={color} strokeWidth={2.4} />
      </View>
    </View>
  );
}

export function DateLocationHeader({ t, rtl, onHelp, style }: { t: T; rtl: boolean; onHelp: () => void; style?: object }) {
  const font = useAppFont();
  return (
    <View style={[styles.header, { flexDirection: rtl ? 'row-reverse' : 'row' }, style]}>
      <Text style={[styles.title, { fontFamily: font.bold.fontFamily }]}>{t('builder.dates_location_title')}</Text>
      <Pressable
        onPress={onHelp}
        style={styles.helpBtn}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={t('common.help')}
        testID="dl-help"
      >
        <Text style={[styles.helpQ, { fontFamily: font.bold.fontFamily }]}>?</Text>
      </Pressable>
    </View>
  );
}

export function DateLocationHelpSheet({ t, rtl, visible, onClose }: { t: T; rtl: boolean; visible: boolean; onClose: () => void }) {
  const font = useAppFont();
  const textAlign = rtl ? 'right' : 'left';
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={[styles.helpSheetTitle, { textAlign, fontFamily: font.bold.fontFamily }]}>{t('builder.dates_location_title')}</Text>
      {([
        ['start_date', 'help_execution'],
        ['end_date', 'help_deadline'],
        ['location', 'help_location'],
      ] as const).map(([name, help]) => (
        <View key={name} style={styles.helpSection}>
          <Text style={[styles.helpName, { textAlign, fontFamily: font.semiBold.fontFamily }]}>{t(`builder.${name}`)}</Text>
          <Text style={[styles.helpText, { textAlign, fontFamily: font.regular.fontFamily }]}>{t(`builder.${help}`)}</Text>
        </View>
      ))}
    </BottomSheet>
  );
}

/**
 * One tile. The icon sits at the start corner, and at the other one either the
 * "Optional" tag (empty, optional fields) or the clear ✕ (filled); underneath,
 * the field name and "Choose" or the value.
 *
 * The filled border is 2 and the empty one 1, so the padding gives back the
 * difference and the tile never changes size when it fills.
 */
export function DateLocationTile(o: {
  field: DateLocationField;
  label: string;
  value: string;
  optional: boolean;
  error?: string;
  onPress: () => void;
  onClear: () => void;
  t: T;
  rtl: boolean;
  /** Overrides the field's own icon (rarely needed). */
  icon?: (color: string, tileBg: string) => ReactNode;
}) {
  const font = useAppFont();
  const filled = o.value !== '';
  const rowDir = o.rtl ? 'row-reverse' : 'row';
  const align = o.rtl ? 'right' : 'left';
  const tileBg = filled ? DL.accent : DL.tileBg;
  const iconColor = filled ? '#FFFFFF' : DL.accent;
  return (
    <View style={{ flex: 1 }}>
      <PressableScale
        testID={`tile-${o.field}`}
        style={[styles.tile, filled && styles.tileOn, o.error ? styles.tileError : null]}
        onPress={o.onPress}
        activeScale={0.96}
        accessibilityRole="button"
        accessibilityLabel={`${o.label}, ${filled ? o.value : o.t('builder.not_selected_a11y')}`}
      >
        <View style={[styles.topRow, { flexDirection: rowDir }]}>
          <View style={[styles.iconTile, { backgroundColor: tileBg }]}>
            {o.icon ? o.icon(iconColor, tileBg) : <FieldIcon field={o.field} color={iconColor} tileBg={tileBg} />}
          </View>
          {filled ? (
            <PressableScale
              testID={`clear-${o.field}`}
              style={styles.clear}
              onPress={(e) => { e?.stopPropagation?.(); o.onClear(); }}
              hitSlop={10}
              activeScale={0.85}
              haptic="commit"
              accessibilityRole="button"
              accessibilityLabel={o.t('builder.clear_field_a11y', { field: o.label })}
            >
              <X size={14} color={DL.accent} strokeWidth={2.5} />
            </PressableScale>
          ) : o.optional ? (
            <View style={styles.tag}>
              <Text style={[styles.tagText, { fontFamily: font.medium.fontFamily }]} numberOfLines={1}>{o.t('builder.optional_tag')}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.bottom}>
          <Text style={[styles.label, { textAlign: align, fontFamily: font.semiBold.fontFamily }]} numberOfLines={1}>{o.label}</Text>
          <Text
            style={[filled ? styles.value : styles.choose, { textAlign: align, fontFamily: filled ? font.bold.fontFamily : font.medium.fontFamily }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {filled ? o.value : o.t('builder.choose')}
          </Text>
        </View>
      </PressableScale>
      {o.error ? <Text style={[styles.error, { fontFamily: font.regular.fontFamily }]}>{o.error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: 8 },
  title: { fontSize: 17, fontWeight: '700', color: DL.text },
  helpBtn: { width: 20, height: 20, borderRadius: 10, backgroundColor: DL.tagBg, alignItems: 'center', justifyContent: 'center' },
  helpQ: { fontSize: 12, fontWeight: '700', color: DL.textSec },
  helpSheetTitle: { fontSize: 17, fontWeight: '700', color: DL.text },
  helpSection: { gap: 4 },
  helpName: { fontSize: 14, fontWeight: '600', color: DL.text },
  helpText: { fontSize: 14, lineHeight: 20, color: DL.textSec },

  /** Empty: 1pt border + 8 padding. The filled and error states are 2 + 7, so
   *  the tile is the same size in every state. */
  tile: {
    height: 116,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: DL.rowBorder,
    backgroundColor: DL.emptyBg,
    padding: 8,
    justifyContent: 'space-between',
  },
  tileOn: { borderWidth: 2, borderColor: DL.accent, backgroundColor: DL.rowSelectedBg, padding: 7 },
  tileError: { borderWidth: 2, borderColor: DL.error, padding: 7 },
  topRow: { justifyContent: 'space-between', alignItems: 'flex-start' },
  iconTile: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  /** Shrinks rather than overflows on the narrowest phones. */
  tag: {
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: DL.tagBg,
    justifyContent: 'center',
    flexShrink: 1,
  },
  tagText: { fontSize: 10.5, fontWeight: '500', color: DL.tagText },
  clear: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottom: { gap: 2 },
  label: { fontSize: 12.5, fontWeight: '600', color: DL.textSec },
  choose: { fontSize: 14, fontWeight: '500', color: DL.placeholder },
  value: { fontSize: 15, fontWeight: '700', color: DL.text },
  deadlineIcon: { width: 18, height: 18 },
  // Sits on the calendar's corner; its fill (set inline to the icon tile's
  // colour) punches it out of the calendar's lines.
  deadlineClock: {
    position: 'absolute',
    right: -4,
    bottom: -3,
    width: 12,
    height: 12,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { fontSize: 12, lineHeight: 16, color: DL.error, marginTop: 4, textAlign: 'center' },
});
