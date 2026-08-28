import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Search, MessageCircle } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { ChatsScreen as ChatsList } from '@features/chat/screens/ChatsScreen';
import { useUserChats } from '@features/chat/hooks/useUserChats';
import { Screen } from '@components/layout/Screen';
import { PageTitle } from '@components/ui/PageTitle';
import { EmptyState } from '@components/ui/EmptyState';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
import { useTheme } from '@core/hooks/useTheme';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

type Translations = typeof en;
function t(translations: Translations, key: string): string {
  const keys = key.split('.');
  let result: unknown = translations;
  for (const k of keys) result = (result as Record<string, unknown>)?.[k];
  return typeof result === 'string' ? result : key;
}

export default function ChatsPage() {
  const language = useSettingsStore((s) => s.language);
  const font = useAppFont();
  const colors = useTheme();
  const router = useRouter();
  const tr = language === 'he' ? he : en;
  const rtl = language === 'he';
  const [searchQuery, setSearchQuery] = useState('');

  const { chats, loading } = useUserChats();
  const realChats = chats.filter((c) => c.type !== 'community');
  const hasChats = realChats.length > 0;

  return (
    <Screen style={{ padding: 0, paddingBottom: 100 }} scrollable={hasChats}>
      <PageTitle>{t(tr, 'chats_page.title')}</PageTitle>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : !hasChats ? (
        <EmptyState
          icon={MessageCircle}
          title={t(tr, 'chats.empty_client_title')}
          description={t(tr, 'chats.empty_client_desc')}
          primaryAction={{
            label: t(tr, 'chats.empty_client_primary'),
            onPress: () => router.push('/(client)/(tabs)/browse'),
          }}
          secondaryAction={{
            label: t(tr, 'chats.empty_client_secondary'),
            onPress: () => router.push('/(client)/(tabs)/home'),
          }}
        />
      ) : (
        <>
          <View style={[styles.searchRow, { backgroundColor: '#ffffff', borderColor: colors.border }]}>
            <Search size={18} color={colors.placeholder} strokeWidth={2.5} />
            <TextInput
              style={[styles.searchInput, { ...font.regular, color: colors.text, textAlign: rtl ? 'right' : 'left' }]}
              placeholder={t(tr, 'search.placeholder')}
              placeholderTextColor={colors.placeholder}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} activeOpacity={0.7}>
                <Text style={{ color: colors.textMuted, fontSize: 14, paddingHorizontal: 4 }}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          <ChatsList
            scrollable={false}
            chats={chats}
            searchQuery={searchQuery}
            onClearSearch={() => setSearchQuery('')}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  centerFill: { flex: 1 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    height: 44,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15 },
});
