import { useEffect, useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Screen } from '@components/layout/Screen';
import { AppText } from '@components/ui/AppText';
import { useTheme } from '@core/hooks/useTheme';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAuthStore } from '@core/stores/authStore';
import { useUiStore } from '@core/stores/uiStore';
import { useBlockStore } from '@core/stores/blockStore';
import { getDocument } from '@core/firebase/firestore';
import { useModeAccent } from '@core/navigation/floatingTabBar';
import { unblockUser } from '@features/blocking/services/blockService';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

type Translations = typeof en;
function makeT(translations: Translations) {
  return (key: string): string => {
    let result: unknown = translations;
    for (const k of key.split('.')) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
}

/**
 * Settings → Blocked users: who I blocked, and the way back. Guideline 1.2 asks
 * for blocking to be reachable and reversible; the list is the live block store,
 * so an unblock here is reflected everywhere at once.
 */
export default function BlockedUsersSettings() {
  const router = useRouter();
  const colors = useTheme();
  const { accent } = useModeAccent();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const rowDir = rtl ? 'row-reverse' : ('row' as const);
  const align = rtl ? 'right' : ('left' as const);
  const userId = useAuthStore((s) => s.user?.id);
  const showToast = useUiStore((s) => s.showToast);
  const blocked = useBlockStore((s) => s.blocked);
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const missing = blocked.filter((id) => !(id in names));
    missing.forEach((id) => {
      getDocument<{ displayName?: string }>(`users/${id}`)
        .then((d) => { if (active) setNames((n) => ({ ...n, [id]: d?.displayName ?? '' })); })
        .catch(() => { if (active) setNames((n) => ({ ...n, [id]: '' })); });
    });
    return () => { active = false; };
    // names is read to skip already-fetched ids; it is deliberately not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocked]);

  async function onUnblock(id: string) {
    if (!userId) return;
    setBusy(id);
    try {
      await unblockUser(userId, id);
      showToast(t('blocking.unblocked_toast'), 'success');
    } catch {
      showToast(t('blocking.failed'), 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen style={styles.content} scrollable>
      <TouchableOpacity
        style={[styles.backRow, { flexDirection: rowDir }]}
        onPress={() => router.back()}
        activeOpacity={0.7}
        accessibilityRole="button"
        hitSlop={10}
      >
        {rtl ? <ChevronRight size={22} color={accent} strokeWidth={2} /> : <ChevronLeft size={22} color={accent} strokeWidth={2} />}
        <AppText weight="bold" style={[styles.title, { color: '#000000' }]}>{t('blocking.list_title')}</AppText>
      </TouchableOpacity>

      <AppText weight="regular" style={[styles.hint, { color: '#000000', textAlign: align }]}>
        {t('blocking.list_hint')}
      </AppText>

      {blocked.length === 0 ? (
        <AppText weight="regular" testID="blocked-empty" style={[styles.empty, { color: '#000000' }]}>
          {t('blocking.list_empty')}
        </AppText>
      ) : (
        blocked.map((id) => (
          <View key={id} testID={`blocked-row-${id}`} style={[styles.row, { flexDirection: rowDir, borderBottomColor: colors.border }]}>
            <AppText weight="regular" style={[styles.name, { color: '#000000', textAlign: align }]} numberOfLines={1}>
              {names[id] || t('blocking.unknown_user')}
            </AppText>
            <TouchableOpacity
              onPress={() => onUnblock(id)}
              disabled={busy === id}
              style={[styles.unblock, { borderColor: accent, opacity: busy === id ? 0.5 : 1 }]}
              accessibilityRole="button"
              testID={`unblock-${id}`}
            >
              <AppText weight="semiBold" style={{ color: '#000000', fontSize: 14 }}>{t('blocking.unblock')}</AppText>
            </TouchableOpacity>
          </View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 12 },
  backRow: { alignItems: 'center', gap: 4, marginBottom: 8 },
  title: { fontSize: 22 },
  hint: { fontSize: 13, lineHeight: 19 },
  empty: { textAlign: 'center', paddingVertical: 32, fontSize: 15 },
  row: { alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  name: { flex: 1, fontSize: 16 },
  unblock: { borderWidth: 1, borderRadius: 12, paddingVertical: 6, paddingHorizontal: 14 },
});
