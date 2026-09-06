import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { BellOff, X } from 'lucide-react-native';
import { AppText } from '@components/ui/AppText';
import { useSettingsStore } from '@core/stores/settingsStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

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
  /** What the user is currently waiting on, so the copy names a real loss. */
  context: 'chats' | 'offers';
  onDismiss: () => void;
};

/**
 * Shown when the OS permission is denied, at a moment where the loss is concrete.
 *
 * A banner rather than a dialog: confirmDialog's buttons are hardcoded English
 * "Cancel"/"OK" and its confirm is styled destructive — both wrong here — and
 * Alert.alert no-ops on web, which is what that constraint exists to avoid.
 *
 * Visibility and dismissal are decided by useNotifPermissionPrompt, not here, so
 * every surface shares one predicate and one cooldown.
 */
export function NotifPermissionBanner({ context, onDismiss }: Props) {
  const language = useSettingsStore((s) => s.language);
  const rtl = language === 'he';
  const t = makeT(rtl ? he : en);
  const rowDir = rtl ? 'row-reverse' : ('row' as const);
  const align = rtl ? 'right' : 'left' as const;

  return (
    <View style={styles.banner}>
      <View style={[styles.header, { flexDirection: rowDir }]}>
        <BellOff size={16} color="#004aad99" strokeWidth={2.2} />
        <AppText weight="semiBold" style={[styles.title, { textAlign: align }]}>
          {t('notif_prompt.banner_title')}
        </AppText>
        <TouchableOpacity
          onPress={onDismiss}
          hitSlop={8}
          activeOpacity={0.7}
          style={styles.dismissBtn}
          accessibilityRole="button"
          accessibilityLabel={t('notif_prompt.dismiss')}
        >
          <X size={16} color="#004aad99" strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      <Text style={[styles.body, { textAlign: align }]}>
        {t(context === 'offers' ? 'notif_prompt.banner_body_offers' : 'notif_prompt.banner_body_chats')}
      </Text>

      <TouchableOpacity
        style={styles.cta}
        onPress={() => Linking.openSettings()}
        activeOpacity={0.85}
        accessibilityRole="button"
      >
        <AppText weight="bold" style={styles.ctaText}>
          {t('settings.notif_perm_open_settings')}
        </AppText>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  // The PurchaseBanner card idiom.
  banner: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,74,173,0.15)',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    padding: 14,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  header: { alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 13, color: '#004aad' },
  dismissBtn: { padding: 4 },
  body: { fontSize: 13, lineHeight: 18, color: '#5c6180' },
  cta: {
    backgroundColor: '#004aad',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 2,
  },
  ctaText: { color: '#ffffff', fontSize: 14 },
});
