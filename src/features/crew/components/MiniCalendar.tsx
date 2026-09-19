import { useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAY_NAMES = ['Su','Mo','Tu','We','Th','Fr','Sa'];

type Props = {
  value: string;
  onSelect: (iso: string) => void;
  onClose: () => void;
  showFlexible?: boolean;
  isFlexible?: boolean;
  onFlexible?: () => void;
  flexibleLabel?: string;
  minDate?: string;
  maxDate?: string;
  /** Optional line under the dates. Renders nothing when omitted, so callers
   *  that don't pass it are unchanged. */
  note?: string;
};

export function MiniCalendar({ value, onSelect, onClose, showFlexible, isFlexible, onFlexible, flexibleLabel, minDate, maxDate, note }: Props) {
  const today = new Date();
  const init = value
    ? new Date(value + 'T00:00:00')
    : minDate
      ? new Date(minDate + 'T00:00:00')
      : today;
  const [viewYear, setViewYear] = useState(init.getFullYear());
  const [viewMonth, setViewMonth] = useState(init.getMonth());

  const selDay   = value ? Number(value.split('-')[2]) : null;
  const selMonth = value ? Number(value.split('-')[1]) - 1 : null;
  const selYear  = value ? Number(value.split('-')[0]) : null;

  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  function dayISO(day: number) {
    return `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  function isDisabled(day: number) {
    const iso = dayISO(day);
    if (minDate && iso < minDate) return true;
    if (maxDate && iso > maxDate) return true;
    return false;
  }

  const canGoPrev = !minDate || viewYear > Number(minDate.slice(0, 4)) ||
    (viewYear === Number(minDate.slice(0, 4)) && viewMonth > Number(minDate.slice(5, 7)) - 1);
  const canGoNext = !maxDate || viewYear < Number(maxDate.slice(0, 4)) ||
    (viewYear === Number(maxDate.slice(0, 4)) && viewMonth < Number(maxDate.slice(5, 7)) - 1);

  function prevMonth() {
    if (!canGoPrev) return;
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (!canGoNext) return;
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }
  function pickDay(day: number) {
    if (isDisabled(day)) return;
    onSelect(dayISO(day));
    onClose();
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.box}>
              <View style={styles.nav}>
                <TouchableOpacity onPress={prevMonth} hitSlop={12} activeOpacity={0.7} disabled={!canGoPrev}>
                  <Text style={[styles.navArrow, !canGoPrev && styles.navArrowDisabled]}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.navTitle}>
                  {MONTH_NAMES[viewMonth]} {viewYear}
                </Text>
                <TouchableOpacity onPress={nextMonth} hitSlop={12} activeOpacity={0.7} disabled={!canGoNext}>
                  <Text style={[styles.navArrow, !canGoNext && styles.navArrowDisabled]}>›</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.weekRow}>
                {DAY_NAMES.map(d => (
                  <View key={d} style={styles.cell}>
                    <Text style={styles.dayName}>{d}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.grid}>
                {cells.map((day, i) => {
                  const isSelected = day !== null && day === selDay && viewMonth === selMonth && viewYear === selYear;
                  const disabled = !day || (day !== null && isDisabled(day));
                  return (
                    <TouchableOpacity
                      key={i}
                      style={[styles.cell, isSelected && styles.cellSelected]}
                      onPress={day && !disabled ? () => pickDay(day) : undefined}
                      disabled={disabled}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.dayNum, isSelected && styles.dayNumSelected, !day && styles.dayNumEmpty, (day !== null && isDisabled(day)) && styles.dayNumDisabled]}>
                        {day ?? '.'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {note ? <Text style={styles.note}>{note}</Text> : null}

              {showFlexible && (
                <TouchableOpacity
                  style={[styles.flexibleBtn, isFlexible && styles.flexibleBtnActive]}
                  onPress={onFlexible}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.flexibleBtnText, isFlexible && styles.flexibleBtnTextActive]}>
                    {flexibleLabel ?? 'Flexible'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const VIOLET = '#6D28D9';
const INK = '#1A1626';

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  box: {
    width: 300,
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderColor: '#E4DBFA',
    shadowColor: '#4C1D95',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  navArrow: { fontSize: 24, fontWeight: '600', paddingHorizontal: 8, color: VIOLET },
  navArrowDisabled: { opacity: 0.2 },
  navTitle: { fontSize: 16, fontWeight: '700', color: INK },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%` as any, alignItems: 'center', paddingVertical: 5 },
  cellSelected: { backgroundColor: VIOLET, borderRadius: 20 },
  dayName: { fontSize: 11, fontWeight: '600', color: '#9C99AD' },
  dayNum: { fontSize: 14, fontWeight: '500', color: INK },
  dayNumSelected: { color: '#FFFFFF' },
  dayNumEmpty: { color: 'transparent' },
  dayNumDisabled: { opacity: 0.2 },
  flexibleBtn: {
    marginTop: 10,
    borderWidth: 1.5,
    borderColor: VIOLET,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
    alignItems: 'center',
  },
  flexibleBtnActive: { backgroundColor: VIOLET },
  flexibleBtnText: { fontSize: 13, fontWeight: '600', color: VIOLET },
  flexibleBtnTextActive: { color: '#FFFFFF' },
  note: { marginTop: 10, fontSize: 12, lineHeight: 17, color: '#6B6880', textAlign: 'center' },
});
