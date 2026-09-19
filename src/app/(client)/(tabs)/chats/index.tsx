import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { Search, MessageCircle, Plus } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { ChatsScreen as ChatsList } from '@features/chat/screens/ChatsScreen';
import { useUserChats } from '@features/chat/hooks/useUserChats';
import { Screen } from '@components/layout/Screen';
import { PageTitle } from '@components/ui/PageTitle';
import { GradientBand } from '@components/ui/GradientBand';
import { EmptyState } from '@components/ui/EmptyState';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useUiStore } from '@core/stores/uiStore';
import { NotifSoftAskModal } from '@features/notifications/components/NotifSoftAskModal';
import { useNotifSoftAsk } from '@features/notifications/hooks/useNotifSoftAsk';
import { useAppFont } from '@core/hooks/useAppFont';
import { useTheme } from '@core/hooks/useTheme';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import { useTabBarClearance, CLIENT_TAB_ACTIVE } from '@core/navigation/floatingTabBar';

const PAGE_BG = '#FAFAFC';
/** Chrome draws `outline: auto` over the focus border; RN's types have no 'none'. */
const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null;

type Translations = typeof en;
function t(translations: Translations, key: string): string {
  const keys = key.split('.');
  let result: unknown = translations;
  for (const k of keys) result = (result as Record<string, unknown>)?.[k];
  return typeof result === 'string' ? result : key;
}

export default function ChatsPage() {
  const language = useSettingsStore((s) => s.language);
  const tabBarClearance = useTabBarClearance();
  const font = useAppFont();
  const colors = useTheme();
  const router = useRouter();
  const tr = language === 'he' ? he : en;
  const rtl = language === 'he';

  // The publish flow navigates straight here, so the soft-ask lands on arrival
  // rather than on the summary screen it would unmount with. Same nonce the Home
  // builder uses to clear its form.
  const softAsk = useNotifSoftAsk();
  const projectSubmittedNonce = useUiStore((s) => s.projectSubmittedNonce);
  const seenSubmitNonce = useRef(projectSubmittedNonce);
  useEffect(() => {
    if (projectSubmittedNonce === seenSubmitNonce.current) return;
    seenSubmitNonce.current = projectSubmittedNonce;
    softAsk.ask('client');
  }, [projectSubmittedNonce, softAsk]);
  const [searchQuery, setSearchQuery] = useState('');
  /** Visual only: the search field's focus border. */
  const [searchFocused, setSearchFocused] = useState(false);
  /** White on the band. PageTitle is shared, so the overrides ride its style
   *  prop; 800 has no useAppFont entry, so Hebrew names the ExtraBold face. */
  const titleType = {
    color: '#FFFFFF',
    fontSize: 25,
    lineHeight: 30,
    letterSpacing: -0.3,
    fontWeight: '800' as const,
    ...(rtl ? { fontFamily: 'Heebo-ExtraBold' } : null),
    marginTop: 0,
    marginBottom: 0,
    paddingHorizontal: 0,
  };

  const { chats, loading } = useUserChats();
  const realChats = chats.filter((c) => c.type !== 'community');
  const hasChats = realChats.length > 0;

  return (
    <Screen style={{ padding: 0, paddingBottom: tabBarClearance }} scrollable={hasChats} backgroundColor={PAGE_BG}>
      <GradientBand style={styles.band} flip>
        <PageTitle style={titleType}>{t(tr, 'chats_page.title')}</PageTitle>
      </GradientBand>

      <View style={styles.sheet}>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={CLIENT_TAB_ACTIVE} />
        </View>
      ) : !hasChats ? (
        <EmptyState
          icon={MessageCircle}
          title={t(tr, 'chats.empty_client_title')}
          description={t(tr, 'chats.empty_client_desc')}
          style={[styles.emptyBias, { paddingBottom: tabBarClearance }]}
          primaryAction={{
            label: t(tr, 'chats.empty_client_primary'),
            icon: Plus,
            onPress: () => router.push('/(client)/(tabs)/home'),
          }}
          secondaryAction={{
            label: t(tr, 'chats.empty_client_secondary'),
            onPress: () => router.push('/(client)/(tabs)/browse'),
          }}
        />
      ) : (
        <>
          <View style={[styles.searchRow, searchFocused && styles.searchRowFocused, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
            <Search size={18} color="#8B8898" strokeWidth={2.5} />
            <TextInput
              style={[styles.searchInput, webNoOutline, { ...font.regular, textAlign: rtl ? 'right' : 'left' }]}
              placeholder={t(tr, 'search.placeholder')}
              placeholderTextColor="#9C99AD"
              value={searchQuery}
              onChangeText={setSearchQuery}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} activeOpacity={0.7}>
                <Text style={{ color: colors.textMuted, fontSize: 14, paddingHorizontal: 4 }}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.listBleed}>
            <ChatsList
              scrollable={false}
              chats={chats}
              searchQuery={searchQuery}
              onClearSearch={() => setSearchQuery('')}
            />
          </View>
        </>
      )}
      </View>

      <NotifSoftAskModal context={softAsk.context} onClose={softAsk.close} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  centerFill: { flex: 1 },
  // Bias the empty block upward a little (matches the Projects empty position).
  emptyBias: {},
  band: { paddingTop: 22, paddingHorizontal: 20, paddingBottom: 40 },
  /** Overlaps the band's bottom edge; zIndex so it paints over the gradient.
   *  flexGrow so the loading and empty states still fill the page. */
  sheet: {
    flexGrow: 1,
    backgroundColor: PAGE_BG,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    marginTop: -22,
    zIndex: 1,
    paddingTop: 18,
    paddingHorizontal: 20,
    shadowColor: '#4C1D95',
    shadowOpacity: 0.09,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -6 },
    elevation: 6,
  },
  searchRow: {
    // Direction is set inline. Hardcoded 'row' left the magnifier on the visual
    // left in Hebrew while the input was right-aligned beside it.
    alignItems: 'center',
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EAE8F0',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    marginBottom: 8,
    gap: 8,
    shadowColor: '#4C1D95',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  searchRowFocused: { borderColor: '#8B5CF6' },
  /** Cancels the sheet's 20pt padding so the chat list runs edge to edge;
   *  ChatsScreen insets its chips and rows by 20 of its own. */
  listBleed: { marginHorizontal: -20 },
  searchInput: { flex: 1, fontSize: 14, color: '#1A1626' },
});
