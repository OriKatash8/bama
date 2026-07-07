import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
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
      {/* Header — title + tabs */}
      <View style={styles.headerWrap}>
        <View style={styles.gradient}>
          <Text style={[styles.headerTitle, { color: '#004aad' }]}>Chats</Text>

          <View style={styles.tabBar}>
            {TABS.map((tab) => {
              const isActive = active === tab;
              return (
                <TouchableOpacity
                  key={tab}
                  style={styles.tab}
                  onPress={() => setActive(tab)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.tabPill, isActive && styles.tabPillActive]}>
                    <Text style={[styles.tabText, { color: colors.textSec }, isActive && styles.tabTextActive]}>
                      {tab}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

      {/* Content */}
      {active === 'Chats' && <ChatsList />}

      {active === 'Notifications' && (
        <ScrollView contentContainerStyle={styles.notifContent} showsVerticalScrollIndicator={false}>
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
  notifContent: { padding: 16, gap: 20, paddingBottom: 40 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 20, fontWeight: '800' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 15 },
});
