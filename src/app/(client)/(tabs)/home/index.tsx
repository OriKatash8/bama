import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import { Screen } from '@components/layout/Screen';
import { ProjectRequestCard } from '@features/crew/components';
import { useProjectRequests, useAiCrewSuggestion } from '@features/crew/hooks';
import { PriceOfferCard } from '@features/offers/components/PriceOfferCard';
import { usePriceOffers } from '@features/offers/hooks/usePriceOffers';
import { useAcceptOffer } from '@features/offers/hooks/useAcceptOffer';
import { useUiStore } from '@core/stores/uiStore';
import type { PriceOffer } from '@core/types/project';

export default function HomeScreen() {
  const { requests, isLoading } = useProjectRequests();
  const { suggest, suggestion, isLoading: aiLoading, error: aiError } = useAiCrewSuggestion();
  const [description, setDescription] = useState('');
  const { offers, isLoading: offersLoading } = usePriceOffers();
  const { accept, reject, isAccepting } = useAcceptOffer();
  const { showToast } = useUiStore();

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

  const apiKeyPresent = !!process.env.EXPO_PUBLIC_CLAUDE_API_KEY;

  const gradientText = Platform.OS === 'web' ? ({
    background: 'linear-gradient(to right, #004aad, #cb6ce6)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  } as any) : {};

  const gradientBtn = Platform.OS === 'web' ? ({
    background: 'linear-gradient(to right, #004aad, #cb6ce6)',
  } as any) : {};

  const cardGlow = Platform.OS === 'web' ? ({
    boxShadow: '0 0 40px #7b4fd466, 0 0 80px #004aad33',
  } as any) : {};

  return (
    <Screen scrollable={false} backgroundColor="#0f0f1f">
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
          <View style={styles.bamaWrap}>
            {Platform.OS === 'web' && (
              <View style={styles.bamaGlow as any}>
                <Text style={[styles.bamaText, { color: '#9b6ff5' }, { filter: 'blur(8px)', opacity: 0.55 } as any]}>BAMA</Text>
              </View>
            )}
            <Text
              style={[
                styles.bamaText,
                Platform.OS === 'web' && ({
                  background: 'linear-gradient(to right, #004aad, #cb6ce6)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                } as any),
              ]}
            >
              BAMA
            </Text>
          </View>

          <View style={[styles.hero, cardGlow]}>
            <Text style={[styles.heroTitle, gradientText]}>Build Your Crew</Text>

            {apiKeyPresent && (
              <>
                <Text style={styles.heroSubtitle}>
                  Describe your project for AI crew suggestions
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="E.g. I'm shooting a wedding in Dubai for 200 guests…"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  multiline
                  numberOfLines={3}
                  value={description}
                  onChangeText={setDescription}
                />
                {description.trim().length > 0 && (
                  <TouchableOpacity
                    style={[styles.suggestBtn, gradientBtn, aiLoading && styles.btnDisabled]}
                    onPress={() => suggest(description.trim())}
                    disabled={aiLoading}
                    activeOpacity={0.8}
                  >
                    {aiLoading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.suggestBtnText}>✦ Get Suggestions</Text>
                    )}
                  </TouchableOpacity>
                )}
                {aiError != null && (
                  <Text style={styles.aiError}>{aiError}</Text>
                )}
                {suggestion != null && (
                  <Text style={styles.suggestion}>{suggestion}</Text>
                )}
              </>
            )}

            <TouchableOpacity
              style={[styles.buildBtn, gradientBtn]}
              onPress={() => router.push('/(client)/(tabs)/home/builder')}
              activeOpacity={0.8}
            >
              <Text style={styles.buildBtnText}>Start Building →</Text>
            </TouchableOpacity>
          </View>

          {offers.length > 0 && (
            <View style={styles.offersSection}>
              <Text style={[styles.sectionTitle, gradientText]}>Price Offers</Text>
              {offersLoading ? (
                <ActivityIndicator style={styles.loader} color="#cb6ce6" />
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

          <View style={styles.projectsSection}>
            <Text style={[styles.sectionTitle, gradientText]}>My Projects</Text>
            {isLoading ? (
              <ActivityIndicator style={styles.loader} color="#cb6ce6" />
            ) : requests.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No projects yet.</Text>
                <Text style={styles.emptyHint}>
                  Tap "Start Building" to create your first request.
                </Text>
              </View>
            ) : (
              requests.map((item) => (
                <ProjectRequestCard key={item.id} request={item} />
              ))
            )}
          </View>
        </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: 16, paddingBottom: 40, gap: 20 },
  bamaWrap: { alignItems: 'center', width: '100%' },
  bamaGlow: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' },
  bamaText: { fontSize: 80, fontWeight: '900', color: '#004aad', textAlign: 'center', fontFamily: 'PeaceSans' },
  hero: {
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    padding: 20,
    gap: 12,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: '#ffffff18',
  },
  heroTitle: { fontSize: 26, fontWeight: '800', color: '#fff' },
  heroSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.6)' },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ffffff22',
    padding: 12,
    color: '#fff',
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  suggestBtn: {
    backgroundColor: '#004aad',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  suggestBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  aiError: { color: '#ff6b6b', fontSize: 13 },
  suggestion: { color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: 20 },
  buildBtn: {
    backgroundColor: '#004aad',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buildBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  offersSection: { gap: 8, marginHorizontal: 16 },
  projectsSection: { gap: 8, marginHorizontal: 16 },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 2 },
  loader: { marginTop: 40 },
  empty: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  emptyText: { fontSize: 18, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  emptyHint: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
