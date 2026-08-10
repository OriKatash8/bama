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
};

export function MiniCalendar({ value, onSelect, onClose }: Props) {
  const today = new Date();
  const init = value ? new Date(value + 'T00:00:00') : today;
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

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }
  function pickDay(day: number) {
    const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onSelect(iso);
    onClose();
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.box}>
              <View style={styles.nav}>
                <TouchableOpacity onPress={prevMonth} hitSlop={12} activeOpacity={0.7}>
                  <Text style={styles.navArrow}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.navTitle}>
                  {MONTH_NAMES[viewMonth]} {viewYear}
                </Text>
                <TouchableOpacity onPress={nextMonth} hitSlop={12} activeOpacity={0.7}>
                  <Text style={styles.navArrow}>›</Text>
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
                  return (
                    <TouchableOpacity
                      key={i}
                      style={[styles.cell, isSelected && styles.cellSelected]}
                      onPress={day ? () => pickDay(day) : undefined}
                      disabled={!day}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.dayNum, isSelected && styles.dayNumSelected, !day && styles.dayNumEmpty]}>
                        {day ?? '.'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

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
    borderRadius: 16,
    borderWidth: 2,
    padding: 12,
    backgroundColor: '#ffffff',
    borderColor: '#004aad',
  },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  navArrow: { fontSize: 24, fontWeight: '600', paddingHorizontal: 8, color: '#004aad' },
  navTitle: { fontSize: 16, fontWeight: '700', color: '#004aad' },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%` as any, alignItems: 'center', paddingVertical: 5 },
  cellSelected: { backgroundColor: '#004aad', borderRadius: 20 },
  dayName: { fontSize: 11, fontWeight: '600', color: '#004aad', opacity: 0.6 },
  dayNum: { fontSize: 14, fontWeight: '500', color: '#004aad' },
  dayNumSelected: { color: '#ffffff' },
  dayNumEmpty: { color: 'transparent' },
});
