import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CalendarClock, X } from 'lucide-react-native';
import { useAppFont } from '@core/hooks/useAppFont';
import { useSettingsStore } from '@core/stores/settingsStore';
import { formatShortDay } from '@utils/formatters';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

interface Props {
  /** The day the project auto-closes, as an ISO day. */
  closesOn: string;
  /** The project's client gets a shortcut to change the end date. */
  isClient: boolean;
  onEdit: () => void;
  onDismiss: () => void;
}

/**
 * Pinned at the top of a project chat near the end date: the project closes
 * 2 days after its end date (and then shows as finished — fee, team phones,
 * read-only), and until then the client can still move the date.
 * Visibility is decided by endDateNotice.
 */
export function EndDateBanner({ closesOn, isClient, onEdit, onDismiss }: Props) {
  const language = useSettingsStore((s) => s.language);
  const lang = language === 'he' ? 'he' : 'en';
  const t = (lang === 'he' ? he : en).chats;
  const rtl = lang === 'he';
  const rowDir = rtl ? 'row-reverse' : 'row';
  const font = useAppFont();

  return (
    <View style={styles.banner}>
      <View style={[styles.row, { flexDirection: rowDir }]}>
        <CalendarClock size={18} color="#004aad" strokeWidth={2.2} />
        <Text style={[styles.text, { ...font.regular, textAlign: rtl ? 'right' : 'left' }]}>
          {t.end_date_notice.replace('{{date}}', formatShortDay(closesOn, lang))}
        </Text>
        <TouchableOpacity
          onPress={onDismiss}
          hitSlop={8}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t.end_date_dismiss}
        >
          <X size={16} color="#004aad99" strokeWidth={2.5} />
        </TouchableOpacity>
      </View>
      {isClient && (
        <TouchableOpacity
          style={[styles.editBtn, { alignSelf: rtl ? 'flex-end' : 'flex-start' }]}
          onPress={onEdit}
          activeOpacity={0.8}
          accessibilityRole="button"
        >
          <Text style={[styles.editText, font.semiBold]}>{t.end_date_edit}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// Same card as PurchaseBanner, so the pinned chrome reads as one family.
const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,74,173,0.15)',
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    padding: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  row: { alignItems: 'flex-start', gap: 10 },
  // lineHeight ≥ 1.47× fontSize: Heebo clips glyph tops below that on iOS.
  text: { flex: 1, fontSize: 14, lineHeight: 21, color: '#004aad' },
  editBtn: {
    backgroundColor: '#004aad',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  editText: { fontSize: 13, lineHeight: 20, color: '#ffffff' },
});
