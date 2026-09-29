import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { AppText } from '@components/ui/AppText';
import { useTheme } from '@core/hooks/useTheme';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAuthStore } from '@core/stores/authStore';
import { useChatJumpStore } from '@core/stores/chatJumpStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import { ChatSearchPanel } from '../components/ChatSearchPanel';
import type { SearchResult } from '../search/searchMessages';
import { chatGroupOf } from '../utils/chatGroup';

type Translations = typeof en;
function makeT(translations: Translations) {
  return (key: string, vars?: Record<string, string>): string => {
    let result: unknown = translations;
    for (const k of key.split('.')) result = (result as Record<string, unknown>)?.[k];
    let str = typeof result === 'string' ? result : key;
    if (vars) for (const [k, v] of Object.entries(vars)) str = str.replace(`{{${k}}}`, v);
    return str;
  };
}

/**
 * Search inside a community, as a page — opened from its details page. (Inside
 * the chat room the same search is a sheet: ChatSearchSheet.) The search box
 * and results are ChatSearchPanel. Tapping a result leaves a request in
 * chatJumpStore and pops back to the chat room underneath, which opens that
 * channel at that message (useSearchJump). The pop is `dismissTo` in the
 * viewer's own stack: search and details both sit on top of the room there, so
 * it lands on the room itself.
 */
export function CommunitySearchScreen({ chatId }: { chatId: string }) {
  const router = useRouter();
  const colors = useTheme();
  const language = useSettingsStore((s) => s.language);
  const rtl = language === 'he';
  const t = makeT(rtl ? he : en);
  const chatGroup = chatGroupOf(useAuthStore((s) => s.activeMode));

  function open(r: SearchResult) {
    useChatJumpStore.getState().request({ chatId, channelId: r.message.channelId, messageId: r.message.id });
    router.dismissTo(`/${chatGroup}/chat/${chatId}` as never);
  }

  return (
    <LinearGradient colors={colors.bgGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.container}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: true, fullScreenGestureEnabled: true }} />

      {/* Header: back on the left pointing left, title centred — as on details. */}
      <View style={styles.header}>
        <TouchableOpacity
          testID="search-back"
          onPress={() => router.back()}
          style={styles.headerBack}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('community_search.back')}
        >
          <ChevronLeft size={28} color={colors.primary} strokeWidth={2.2} />
        </TouchableOpacity>
        <AppText weight="semiBold" style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {t('community_search.title')}
        </AppText>
        <View style={styles.headerBack} />
      </View>

      <ChatSearchPanel chatId={chatId} kind="community" onPick={open} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 52, paddingBottom: 12, paddingHorizontal: 8 },
  headerBack: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 20, lineHeight: 26, textAlign: 'center' },
});
