import { Linking, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Flag, Mail, Phone } from 'lucide-react-native';
import { AppText } from '@components/ui/AppText';
import { useSettingsStore } from '@core/stores/settingsStore';
import { categoryLabel } from '@features/crew/data/categories';
import { formatPhoneForDisplay } from '@features/auth/utils/phone';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import type { ClosingMember } from '../types';

type Translations = typeof en;
function makeT(translations: Translations) {
  return (key: string): string => {
    let result: unknown = translations;
    for (const k of key.split('.')) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
}

/**
 * The closing message in a project chat (onProjectClosed): every member — the
 * client first — with their role(s) and phone number, then BAMA's email. A
 * number or the email opens the dialler / mail app. Everyone in the chat sees the
 * same list: the project is over, and the team may reach each other.
 */
export function ClosingTeamCard({ team, closedAs, contactEmail }: {
  team: ClosingMember[];
  closedAs: 'completed' | 'cancelled';
  contactEmail: string;
}) {
  const language = useSettingsStore((s) => s.language);
  const rtl = language === 'he';
  const lang: 'he' | 'en' = rtl ? 'he' : 'en';
  const t = makeT(rtl ? he : en);
  const rowDir = rtl ? 'row-reverse' : 'row';
  const textAlign = rtl ? 'right' : 'left';

  return (
    <View style={styles.card}>
      <View style={[styles.header, { flexDirection: rowDir }]}>
        <Flag size={16} color="#000000" strokeWidth={2} />
        <AppText weight="bold" style={[styles.title, { textAlign }]}>
          {t(closedAs === 'cancelled' ? 'chats.cancelled_title' : 'chats.closed_title')}
        </AppText>
      </View>

      {team.map((m) => (
        <View key={m.uid} testID={`closing-member-${m.uid}`} style={[styles.row, { flexDirection: rowDir }]}>
          <View style={styles.who}>
            <AppText weight="semiBold" style={[styles.name, { textAlign }]} numberOfLines={1}>
              {m.name || '—'}
            </AppText>
            <AppText weight="regular" style={[styles.roles, { textAlign }]}>
              {m.isClient ? t('chats.closing_client') : m.roles.map((r) => categoryLabel(r, lang)).join(' · ')}
            </AppText>
          </View>
          {m.phone ? (
            <TouchableOpacity
              testID={`closing-phone-${m.uid}`}
              style={[styles.phone, { flexDirection: rowDir }]}
              onPress={() => void Linking.openURL(`tel:${m.phone}`)}
              activeOpacity={0.7}
              accessibilityRole="button"
            >
              <Phone size={14} color="#1e4fa3" strokeWidth={2} />
              <AppText weight="semiBold" style={styles.phoneText}>{formatPhoneForDisplay(m.phone)}</AppText>
            </TouchableOpacity>
          ) : (
            <AppText weight="regular" style={styles.noPhone}>—</AppText>
          )}
        </View>
      ))}

      <View style={[styles.footer, { flexDirection: rowDir }]}>
        <Mail size={14} color="#6b6b80" strokeWidth={2} />
        <AppText weight="regular" style={styles.footerLabel}>{t('chats.closing_contact')}</AppText>
        <TouchableOpacity onPress={() => void Linking.openURL(`mailto:${contactEmail}`)} activeOpacity={0.7} accessibilityRole="link">
          <AppText weight="semiBold" style={styles.email}>{contactEmail}</AppText>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    marginHorizontal: 12,
    marginVertical: 8,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(30,79,163,0.1)',
    padding: 14,
    gap: 10,
  },
  header: { alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 15, color: '#000000' },
  row: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(15,15,31,0.12)',
  },
  who: { flex: 1, gap: 2 },
  name: { fontSize: 14.5, color: '#0f0f1f' },
  roles: { fontSize: 12.5, color: 'rgba(15,15,31,0.55)' },
  phone: { alignItems: 'center', gap: 5 },
  phoneText: { fontSize: 14, color: '#1e4fa3' },
  noPhone: { fontSize: 14, color: 'rgba(15,15,31,0.4)' },
  footer: {
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(15,15,31,0.12)',
  },
  footerLabel: { fontSize: 13, color: '#6b6b80' },
  email: { fontSize: 13, color: '#1e4fa3' },
});
