import { useCallback, useEffect, useState } from 'react';
import { View, Switch, TouchableOpacity, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { ChevronLeft, ChevronRight, Check, Bell } from 'lucide-react-native';
import { Screen } from '@components/layout/Screen';
import { AppText } from '@components/ui/AppText';
import { useTheme } from '@core/hooks/useTheme';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAuthStore } from '@core/stores/authStore';
import { useUiStore } from '@core/stores/uiStore';
import { getDocument, updateDocument } from '@core/firebase/firestore';
import {
  getNotificationPermissionState,
  requestNotificationPermission,
  type NotifPermissionState,
} from '@core/notifications/registerForPushNotifications';
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

const ESSENTIAL_TYPES = ['offer', 'offer_accepted', 'purchase'] as const;
const OPTIONAL_TYPES = ['message', 'project', 'mission', 'meeting'] as const;
type OptionalType = (typeof OPTIONAL_TYPES)[number];

export default function NotificationsSettings() {
  const router = useRouter();
  const colors = useTheme();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const rowDir = rtl ? 'row-reverse' : ('row' as const);
  const userId = useAuthStore((s) => s.user?.id);
  const showToast = useUiStore((s) => s.showToast);

  const [perm, setPerm] = useState<NotifPermissionState | null>(null);
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [requesting, setRequesting] = useState(false);

  // Re-check OS permission every time the screen gains focus — the user may
  // have changed it in the device Settings app and returned.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      getNotificationPermissionState().then((s) => { if (active) setPerm(s); });
      return () => { active = false; };
    }, []),
  );

  useEffect(() => {
    if (!userId) { setLoadingPrefs(false); return; }
    let active = true;
    getDocument<{ notifPrefs?: Record<string, boolean> }>(`users/${userId}`)
      .then((d) => { if (active) { setPrefs(d?.notifPrefs ?? {}); setLoadingPrefs(false); } })
      .catch(() => { if (active) setLoadingPrefs(false); });
    return () => { active = false; };
  }, [userId]);

  const enabled = perm?.granted === true;

  async function onRequest() {
    setRequesting(true);
    const next = await requestNotificationPermission();
    setPerm(next);
    setRequesting(false);
  }

  async function toggleOptional(type: OptionalType, next: boolean) {
    if (!userId) return;
    const prev = prefs[type] !== false; // undefined = enabled
    setPrefs((p) => ({ ...p, [type]: next })); // optimistic
    try {
      await updateDocument(`users/${userId}`, { [`notifPrefs.${type}`]: next } as never);
    } catch {
      setPrefs((p) => ({ ...p, [type]: prev })); // revert
      showToast(t('settings.notif_save_error'), 'error');
    }
  }

  const sectionHeader = (label: string) => (
    <AppText weight="bold" style={[styles.sectionHeader, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
      {label}
    </AppText>
  );

  const prefRow = (type: string, value: boolean, disabled: boolean, onChange?: (v: boolean) => void) => (
    <View key={type} style={[styles.row, { flexDirection: rowDir, borderBottomColor: colors.border }]}>
      <AppText weight="regular" style={[styles.rowLabel, { color: disabled ? colors.textMuted : colors.text, textAlign: rtl ? 'right' : 'left' }]}>
        {t(`settings.notif_type_${type}`)}
      </AppText>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: colors.primary, false: colors.borderMuted }}
      />
    </View>
  );

  return (
    <Screen style={styles.content} scrollable>
      {/* Header */}
      <TouchableOpacity
        style={[styles.backRow, { flexDirection: rowDir }]}
        onPress={() => router.back()}
        activeOpacity={0.7}
        accessibilityRole="button"
        hitSlop={10}
      >
        {rtl ? <ChevronRight size={22} color={colors.primary} strokeWidth={2} /> : <ChevronLeft size={22} color={colors.primary} strokeWidth={2} />}
        <AppText weight="bold" style={[styles.title, { color: colors.primary }]}>{t('settings.notifications')}</AppText>
      </TouchableOpacity>

      {/* Section 1 — OS permission */}
      <View style={[styles.permCard, { backgroundColor: colors.card }]}>
        {perm == null ? (
          <ActivityIndicator color={colors.primary} />
        ) : perm.granted ? (
          <View style={[styles.permRow, { flexDirection: rowDir }]}>
            <View style={[styles.permIconOk, { backgroundColor: colors.primary }]}>
              <Check size={15} color="#ffffff" strokeWidth={3} />
            </View>
            <AppText weight="semiBold" style={[styles.permText, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}>
              {t('settings.notif_perm_on')}
            </AppText>
          </View>
        ) : perm.status === 'denied' ? (
          <>
            <AppText weight="regular" style={[styles.permText, { color: colors.textSec, textAlign: rtl ? 'right' : 'left' }]}>
              {t('settings.notif_perm_denied_text')}
            </AppText>
            <TouchableOpacity style={[styles.permBtn, { backgroundColor: colors.primary }]} onPress={() => Linking.openSettings()} activeOpacity={0.85} accessibilityRole="button">
              <AppText weight="bold" style={styles.permBtnText}>{t('settings.notif_perm_open_settings')}</AppText>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={[styles.permRow, { flexDirection: rowDir }]}>
              <Bell size={18} color={colors.textMuted} strokeWidth={1.8} />
              <AppText weight="regular" style={[styles.permText, { color: colors.textSec, textAlign: rtl ? 'right' : 'left' }]}>
                {t('settings.notif_perm_enable_text')}
              </AppText>
            </View>
            <TouchableOpacity style={[styles.permBtn, { backgroundColor: colors.primary }]} onPress={onRequest} disabled={requesting} activeOpacity={0.85} accessibilityRole="button">
              {requesting ? <ActivityIndicator size="small" color="#fff" /> : <AppText weight="bold" style={styles.permBtnText}>{t('settings.notif_perm_enable')}</AppText>}
            </TouchableOpacity>
          </>
        )}
      </View>

      {loadingPrefs ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
      ) : (
        <View style={[styles.sections, !enabled && styles.dimmed]}>
          {/* Section 2 — Essential (always on, disabled) */}
          {sectionHeader(t('settings.notif_essential_title'))}
          {ESSENTIAL_TYPES.map((type) => prefRow(type, true, true))}
          <AppText weight="regular" style={[styles.groupNote, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
            {t('settings.notif_essential_desc')}
          </AppText>

          {/* Section 3 — Optional (writes notifPrefs) */}
          {sectionHeader(t('settings.notif_optional_title'))}
          {OPTIONAL_TYPES.map((type) =>
            prefRow(type, prefs[type] !== false, !enabled, (v) => toggleOptional(type, v)),
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 8, gap: 4 },
  backRow: { alignItems: 'center', gap: 6, paddingVertical: 8 },
  title: { fontSize: 22 },
  permCard: { borderRadius: 16, padding: 16, gap: 12, marginTop: 8, marginBottom: 8, alignItems: 'stretch' },
  permRow: { alignItems: 'center', gap: 10 },
  permIconOk: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  permText: { flex: 1, fontSize: 13, lineHeight: 19 },
  permBtn: { borderRadius: 14, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  permBtnText: { color: '#ffffff', fontSize: 14 },
  sections: { marginTop: 8 },
  dimmed: { opacity: 0.5 },
  sectionHeader: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 16, marginBottom: 4 },
  row: { alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  rowLabel: { flex: 1, fontSize: 14 },
  groupNote: { fontSize: 12, lineHeight: 17, marginTop: 8 },
});
