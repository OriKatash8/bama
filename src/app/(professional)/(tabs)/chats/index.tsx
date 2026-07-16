import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ChatsScreen as ChatsList } from '@features/chat/screens/ChatsScreen';
import { Screen } from '@components/layout/Screen';
import { useTheme } from '@core/hooks/useTheme';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

type Translations = typeof en;

function makeT(translations: Translations) {
  return (key: string, vars?: Record<string, string>): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    let str = typeof result === 'string' ? result : key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replace(`{{${k}}}`, v);
      }
    }
    return str;
  };
}

type TabKey = 'chats' | 'courses' | 'communities';
const TAB_KEYS: TabKey[] = ['chats', 'courses', 'communities'];

export default function ProfessionalChatsScreen() {
  const colors = useTheme();
  const font = useAppFont();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';

  const [active, setActive] = useState<TabKey>('chats');

  const TAB_LABELS: Record<TabKey, string> = {
    chats:       t('chats_page.tab_chats'),
    courses:     t('chats_page.tab_courses'),
    communities: t('chats_page.tab_communities'),
  };

  return (
    <Screen scrollable={false}>
      {/* Header — title + tabs */}
      <View style={styles.headerWrap}>
        <View style={styles.gradient}>
          <Text style={[styles.headerTitle, { color: '#004aad', fontFamily: font.bold, textAlign: rtl ? 'right' : 'left' }]}>
            {t('chats_page.title')}
          </Text>

          <View style={styles.tabBar}>
            {TAB_KEYS.map((key) => {
              const isActive = active === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={styles.tab}
                  onPress={() => setActive(key)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.tabPill, isActive && styles.tabPillActive]}>
                    <Text style={[styles.tabText, { color: colors.textSec, fontFamily: isActive ? font.bold : font.regular, textAlign: rtl ? 'right' : 'left' }, isActive && styles.tabTextActive]}>
                      {TAB_LABELS[key]}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

      {/* Content */}
      {active === 'chats' && <ChatsList />}
      {active !== 'chats' && (
        <View style={styles.comingSoon}>
          <Text style={[styles.comingSoonText, { color: colors.textMuted, fontFamily: font.regular, textAlign: rtl ? 'right' : 'left' }]}>
            {t('chats_page.coming_soon')}
          </Text>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    alignSelf: 'stretch',
    marginHorizontal: -16,
    marginTop: -16,
  },
  gradient: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
  },
  tabBar: {
    flexDirection: 'row',
    width: '100%',
    paddingHorizontal: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
  },
  tabPill: {
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  tabPillActive: {
    backgroundColor: 'rgba(0,74,173,0.12)',
  },
  tabText: {
    fontSize: 15,
  },
  tabTextActive: {
    color: '#004aad',
    fontWeight: '700',
  },
  comingSoon: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  comingSoonText: {
    fontSize: 15,
  },
});
