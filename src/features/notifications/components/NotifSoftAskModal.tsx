import { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Bell } from 'lucide-react-native';
import { AppText } from '@components/ui/AppText';
import { useSettingsStore } from '@core/stores/settingsStore';
import { requestNotificationPermission } from '@core/notifications/registerForPushNotifications';
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

export type SoftAskContext = 'offers' | 'client';

type Props = {
  context: SoftAskContext | null;
  onClose: () => void;
};

/**
 * The explanation shown BEFORE the OS dialog.
 *
 * iOS shows its permission dialog exactly once per install, so the answer given to
 * it is final. This exists to make that one answer an informed one, at a moment the
 * user has just done something expecting a reply.
 *
 * "Not now" deliberately does NOT call requestPermissionsAsync — declining here
 * leaves the OS prompt unspent, so we can ask again at the next such moment. Only
 * "Turn on" spends it.
 *
 * Not confirmDialog: its buttons are hardcoded English "Cancel"/"OK" and its confirm
 * is styled destructive — both wrong for an opt-in in a Hebrew-default app.
 */
export function NotifSoftAskModal({ context, onClose }: Props) {
  const language = useSettingsStore((s) => s.language);
  const rtl = language === 'he';
  const t = makeT(rtl ? he : en);
  const align = rtl ? 'right' : 'left' as const;
  const [busy, setBusy] = useState(false);

  if (!context) return null;

  async function allow() {
    setBusy(true);
    try {
      await requestNotificationPermission();
    } finally {
      setBusy(false);
      onClose();
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      {/* Overlay is a plain View with the dismiss layer BEHIND the card — nesting
          the card inside a touchable makes its width:'100%' resolve against a
          content-sized parent and collapse. */}
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Bell size={24} color="#004aad" strokeWidth={2} />
          </View>
          <AppText weight="bold" style={[styles.title, { textAlign: align }]}>
            {t(context === 'offers' ? 'notif_prompt.softask_title_offers' : 'notif_prompt.softask_title_client')}
          </AppText>
          <Text style={[styles.body, { textAlign: align }]}>
            {t(context === 'offers' ? 'notif_prompt.softask_body_offers' : 'notif_prompt.softask_body_client')}
          </Text>

          <TouchableOpacity
            style={[styles.allowBtn, busy && styles.allowBtnDisabled]}
            onPress={allow}
            disabled={busy}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <AppText weight="bold" style={styles.allowText}>{t('notif_prompt.softask_allow')}</AppText>
          </TouchableOpacity>

          <TouchableOpacity style={styles.laterBtn} onPress={onClose} activeOpacity={0.7} accessibilityRole="button">
            <AppText weight="semiBold" style={styles.laterText}>{t('notif_prompt.softask_not_now')}</AppText>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Same shell as the marketplace filter popup.
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 20,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 20,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,74,173,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 2,
  },
  title: { fontSize: 18, color: '#004aad' },
  body: { fontSize: 14, lineHeight: 20, color: '#5c6180' },
  allowBtn: {
    backgroundColor: '#004aad',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  allowBtnDisabled: { opacity: 0.6 },
  allowText: { color: '#ffffff', fontSize: 15 },
  laterBtn: { alignItems: 'center', paddingVertical: 10 },
  laterText: { fontSize: 14, color: '#8890b0' },
});
