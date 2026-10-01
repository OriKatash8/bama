import { View, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, Mail, MessageCircle } from 'lucide-react-native';
import { Screen } from '@components/layout/Screen';
import { AppText } from '@components/ui/AppText';
import { useTheme } from '@core/hooks/useTheme';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useModeAccent } from '@core/navigation/floatingTabBar';
import { BAMA_CONTACT_EMAIL, BAMA_WHATSAPP_NUMBER } from '@core/constants/contact';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

/** +972529710467 → "+972 52-971-0467", for reading. */
function formatIsraeliNumber(e164: string): string {
  const m = /^\+972(\d{2})(\d{3})(\d{4})$/.exec(e164);
  return m ? `+972 ${m[1]}-${m[2]}-${m[3]}` : e164;
}

/**
 * "Contact us", from the settings menu: BAMA's email and WhatsApp, and a
 * promise to answer as fast as we can. Each row opens the matching app.
 */
export default function ContactScreen() {
  const router = useRouter();
  const colors = useTheme();
  const { accent } = useModeAccent();
  const language = useSettingsStore((s) => s.language);
  const tr = (language === 'he' ? he : en).contact;
  const rtl = language === 'he';
  const rowDir = rtl ? 'row-reverse' : ('row' as const);
  const align = rtl ? ('right' as const) : ('left' as const);

  const rows = [
    {
      key: 'email',
      Icon: Mail,
      label: tr.email_label,
      value: BAMA_CONTACT_EMAIL,
      url: `mailto:${BAMA_CONTACT_EMAIL}`,
    },
    {
      key: 'whatsapp',
      Icon: MessageCircle,
      label: tr.whatsapp_label,
      value: formatIsraeliNumber(BAMA_WHATSAPP_NUMBER),
      url: `https://wa.me/${BAMA_WHATSAPP_NUMBER.replace(/^\+/, '')}`,
    },
  ];

  return (
    <Screen style={styles.content} scrollable>
      <TouchableOpacity
        style={[styles.backRow, { flexDirection: rowDir }]}
        onPress={() => router.back()}
        activeOpacity={0.7}
        accessibilityRole="button"
        hitSlop={10}
      >
        {rtl
          ? <ChevronRight size={22} color={accent} strokeWidth={2} />
          : <ChevronLeft size={22} color={accent} strokeWidth={2} />}
        <AppText weight="bold" style={styles.title}>{tr.title}</AppText>
      </TouchableOpacity>

      <View style={styles.card}>
        <AppText weight="regular" style={[styles.body, { color: colors.text, textAlign: align }]}>
          {tr.reply_note}
        </AppText>
      </View>

      <View style={styles.card}>
        {rows.map(({ key, Icon, label, value, url }, i) => (
          <TouchableOpacity
            key={key}
            style={[styles.row, { flexDirection: rowDir }, i > 0 && styles.rowDivider]}
            onPress={() => void Linking.openURL(url)}
            activeOpacity={0.7}
            accessibilityRole="link"
          >
            <View style={[styles.iconTile, { backgroundColor: `${accent}1A` }]}>
              <Icon size={18} color={accent} strokeWidth={2} />
            </View>
            <View style={styles.rowText}>
              <AppText weight="regular" style={[styles.label, { color: colors.textMuted, textAlign: align }]}>
                {label}
              </AppText>
              {/* An address or a number reads left-to-right in Hebrew too. */}
              <AppText
                weight="semiBold"
                style={[styles.value, { color: colors.text, textAlign: align, writingDirection: 'ltr' }]}
              >
                {value}
              </AppText>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </Screen>
  );
}

const CARD_SHADOW = {
  shadowColor: '#1e4fa3',
  shadowOpacity: 0.06,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};

// lineHeight ≥ 1.47× fontSize throughout: Heebo clips glyph tops below that on iOS.
const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 8 },
  backRow: { alignItems: 'center', gap: 6, paddingVertical: 12 },
  title: { fontSize: 20, lineHeight: 30 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    ...CARD_SHADOW,
  },
  body: { fontSize: 15, lineHeight: 23 },
  row: { alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowDivider: { borderTopWidth: 1, borderTopColor: '#EFEDF5' },
  iconTile: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1 },
  label: { fontSize: 12, lineHeight: 18 },
  value: { fontSize: 15, lineHeight: 23 },
});
