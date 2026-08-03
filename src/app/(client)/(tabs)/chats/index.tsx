import { View, Text, StyleSheet } from 'react-native';
import { ChatsScreen as ChatsList } from '@features/chat/screens/ChatsScreen';
import { Screen } from '@components/layout/Screen';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
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
  const tr = language === 'he' ? he : en;

  return (
    <Screen style={{ padding: 0, paddingBottom: 100 }}>
      <View style={styles.headerWrap}>
        <Text style={[styles.headerTitle, { fontFamily: font.bold }]}>
          {t(tr, 'chats_page.title')}
        </Text>
      </View>
      <ChatsList scrollable={false} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  headerTitle: {
    fontSize: 36,
    fontWeight: '800',
    textTransform: 'uppercase',
    color: '#004aad',
  },
});
