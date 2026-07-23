import { View, Text, StyleSheet } from 'react-native';
import { ChatsScreen as ChatsList } from '@features/chat/screens/ChatsScreen';
import { Screen } from '@components/layout/Screen';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
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

export default function ChatsPage() {
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const font = useAppFont();

  return (
    <Screen scrollable={false}>
      <View style={styles.headerWrap}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { fontFamily: font.bold }]}>
            {t('chats_page.title')}
          </Text>
        </View>
      </View>
      <ChatsList />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    alignSelf: 'stretch',
    marginHorizontal: -16,
    marginTop: -16,
  },
  header: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  headerTitle: {
    fontSize: 36,
    fontWeight: '800',
    textAlign: 'center',
    textTransform: 'uppercase',
    color: '#ffffff',
    textShadowColor: '#004aad',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 1,
  },
});
