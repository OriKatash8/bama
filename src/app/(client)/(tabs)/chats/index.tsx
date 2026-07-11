import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Platform } from 'react-native';
import { ChatsScreen as ChatsList } from '@features/chat/screens/ChatsScreen';
import { Screen } from '@components/layout/Screen';
import { useTheme } from '@core/hooks/useTheme';
import { ProjectRequestCard } from '@features/crew/components';
import { useProjectRequests } from '@features/crew/hooks';
import { PriceOfferCard } from '@features/offers/components/PriceOfferCard';
import { usePriceOffers } from '@features/offers/hooks/usePriceOffers';
import { useAcceptOffer } from '@features/offers/hooks/useAcceptOffer';
import { useUiStore } from '@core/stores/uiStore';
import { useSettingsStore } from '@core/stores/settingsStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import type { PriceOffer } from '@core/types/project';

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

type TabKey = 'chats' | 'notifications';
const TAB_KEYS: TabKey[] = ['chats', 'notifications'];

const gradientStyle = Platform.OS === 'web' ? ({
  background: 'linear-gradient(to right, #004aad, #cb6ce6)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
} as object) : {};

export default function ChatsScreen() {
  const colors = useTheme();
  const { showToast } = useUiStore();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';

  const [active, setActive] = useState<TabKey>('chats');
  const { requests, isLoading: requestsLoading } = useProjectRequests();
  const { offers, isLoading: offersLoading } = usePriceOffers();
  const { accept, reject, isAccepting } = useAcceptOffer();

  const TAB_LABELS: Record<TabKey, string> = {
    chats:         t('chats_page.tab_chats'),
    notifications: t('chats_page.tab_notifications'),
  };

  async function handleAccept(offer: PriceOffer) {
    try {
      await accept(offer);
      showToast(t('chats_page.offer_accepted'), 'success');
    } catch {
      showToast(t('chats_page.failed_accept'), 'error');
    }
  }

  async function handleReject(offerId: string) {
    try {
      await reject(offerId);
    } catch {
      showToast(t('chats_page.failed_reject'), 'error');
    }
  }

  return (
    <Screen scrollable={false}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header — title + tabs */}
        <View style={styles.headerWrap}>
          <View style={styles.gradient}>
            <Text style={[styles.headerTitle, Platform.OS !== 'web' && { color: colors.accent }, gradientStyle]}>
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
                      <Text style={[styles.tabText, { color: colors.textSec, textAlign: rtl ? 'right' : 'left' }, isActive && styles.tabTextActive]}>
                        {TAB_LABELS[key]}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

        {/* Chats list */}
        {active === 'chats' && <ChatsList />}

        {/* Notifications */}
        {active === 'notifications' && (
          <View style={styles.notifContent}>
            {offers.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: '#004aad', textAlign: rtl ? 'right' : 'left' }]}>
                  {t('chats_page.price_offers')}
                </Text>
                {offersLoading ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  offers.map((offer) => (
                    <PriceOfferCard
                      key={offer.id}
                      offer={offer}
                      onAccept={() => handleAccept(offer)}
                      onReject={() => handleReject(offer.id)}
                      isAccepting={isAccepting === offer.id}
                    />
                  ))
                )}
              </View>
            )}

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: '#004aad', textAlign: rtl ? 'right' : 'left' }]}>
                {t('chats_page.my_projects')}
              </Text>
              {requestsLoading ? (
                <ActivityIndicator color={colors.accent} />
              ) : requests.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Text style={[styles.emptyText, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>
                    {t('chats_page.no_projects')}
                  </Text>
                </View>
              ) : (
                requests.map((item) => (
                  <ProjectRequestCard key={item.id} request={item} />
                ))
              )}
            </View>
          </View>
        )}
      </ScrollView>
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
    fontSize: 36,
    fontWeight: '800',
    fontFamily: 'Montserrat',
    textAlign: 'center',
    textTransform: 'uppercase',
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
  flex: { flex: 1 },
  scrollContent: { paddingBottom: 100 },
  notifContent: { padding: 16, gap: 20 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 20, fontWeight: '800' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 15 },
});
