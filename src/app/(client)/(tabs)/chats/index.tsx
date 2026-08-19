import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Search } from 'lucide-react-native';
import { ChatsScreen as ChatsList } from '@features/chat/screens/ChatsScreen';
import { Screen } from '@components/layout/Screen';
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
  const tr = language === 'he' ? he : en;
  const rtl = language === 'he';
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <Screen style={{ padding: 0, paddingBottom: 100 }}>
      <View style={[styles.headerWrap, { alignItems: rtl ? 'flex-end' : 'flex-start' }]}>
        <Text style={[styles.headerTitle, { ...font.bold }]}>
          {t(tr, 'chats_page.title')}
        </Text>
      </View>

      <View style={[styles.searchRow, { backgroundColor: '#ffffff', borderColor: colors.border }]}>
        <Search size={18} color={colors.placeholder} strokeWidth={2.5} />
        <TextInput
          style={[styles.searchInput, { color: colors.text, textAlign: rtl ? 'right' : 'left' }]}
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

      <ChatsList scrollable={false} searchQuery={searchQuery} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    textTransform: 'uppercase',
    color: '#004aad',
  },
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
