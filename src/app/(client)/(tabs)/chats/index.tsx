import { useState } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { ChatsScreen as ChatsList } from '@features/chat/screens/ChatsScreen';
import { Screen } from '@components/layout/Screen';
import { useTheme } from '@core/hooks/useTheme';
import { ProjectRequestCard } from '@features/crew/components';
import { useProjectRequests } from '@features/crew/hooks';
import { PriceOfferCard } from '@features/offers/components/PriceOfferCard';
import { usePriceOffers } from '@features/offers/hooks/usePriceOffers';
import { useAcceptOffer } from '@features/offers/hooks/useAcceptOffer';
import { useUiStore } from '@core/stores/uiStore';
import type { PriceOffer } from '@core/types/project';

const TABS = ['Chats', 'Notifications'] as const;
type Tab = typeof TABS[number];

export default function ChatsScreen() {
  const colors = useTheme();
  const { showToast } = useUiStore();
  const [active, setActive] = useState<Tab>('Chats');
  const { requests, isLoading: requestsLoading } = useProjectRequests();
  const { offers, isLoading: offersLoading } = usePriceOffers();
  const { accept, reject, isAccepting } = useAcceptOffer();

  async function handleAccept(offer: PriceOffer) {
    try {
      await accept(offer);
      showToast('Offer accepted!', 'success');
    } catch {
      showToast('Failed to accept offer.', 'error');
    }
  }

  async function handleReject(offerId: string) {
    try {
      await reject(offerId);
    } catch {
      showToast('Failed to reject offer.', 'error');
    }
  }

  return (
    <Screen scrollable={false}>
      <Image
        source={require('../../../../../assets/images/bama-logo.png')}
        style={styles.logo}
        resizeMode="contain"
      />

      <View style={styles.tabBar}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, active === tab && { borderBottomColor: colors.accent, borderBottomWidth: 2 }]}
            onPress={() => setActive(tab)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, { color: active === tab ? colors.accent : colors.textMuted }]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      {active === 'Chats' && (
        <ChatsList />
      )}

      {active === 'Notifications' && (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {offers.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Price Offers</Text>
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
            <Text style={[styles.sectionTitle, { color: colors.text }]}>My Projects</Text>
            {requestsLoading ? (
              <ActivityIndicator color={colors.accent} />
            ) : requests.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>No projects yet</Text>
              </View>
            ) : (
              requests.map((item) => (
                <ProjectRequestCard key={item.id} request={item} />
              ))
            )}
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  logo: { width: '100%', height: 240, marginTop: 12 },
  tabBar: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 16 },
  tab: { flex: 1, alignItems: 'center', paddingBottom: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 15, fontWeight: '600' },
  divider: { height: 1 },
  content: { padding: 16, gap: 20, paddingBottom: 40 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 20, fontWeight: '800' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 15 },
});
