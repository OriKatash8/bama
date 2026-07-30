import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { Screen } from '@components/layout/Screen';
import { useTheme } from '@core/hooks/useTheme';
import { ProjectRequestCard } from '@features/crew/components';
import { useProjectRequests } from '@features/crew/hooks';
import { PriceOfferCard } from '@features/offers/components/PriceOfferCard';
import { BundleOfferCard } from '@features/offers/components/BundleOfferCard';
import { usePriceOffers } from '@features/offers/hooks/usePriceOffers';
import { useBundleOffers } from '@features/offers/hooks/useBundleOffers';
import { useAcceptOffer } from '@features/offers/hooks/useAcceptOffer';
import { useAcceptBundleOffer } from '@features/offers/hooks/useAcceptBundleOffer';
import { useUiStore } from '@core/stores/uiStore';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
import { getDocument } from '@core/firebase/firestore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import type { PriceOffer, BundleOffer, ProjectRequest } from '@core/types/project';
import type { User } from '@core/types/user';

type ProfessionalProfileSummary = { displayName: string; photoURL?: string };

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

export default function ProjectsPage() {
  const colors = useTheme();
  const router = useRouter();
  const segments = useSegments();
  const modeSegment = segments[0];
  const { showToast } = useUiStore();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const font = useAppFont();

  const { requests, isLoading: requestsLoading } = useProjectRequests();
  const { offers, isLoading: offersLoading } = usePriceOffers();
  const { bundles, isLoading: bundlesLoading } = useBundleOffers();
  const { accept, reject, isAccepting } = useAcceptOffer();
  const { acceptBundle, rejectBundle, isAccepting: isBundleAccepting } = useAcceptBundleOffer();

  const [professionalProfiles, setProfessionalProfiles] = useState<Record<string, ProfessionalProfileSummary>>({});
  const fetchedProfileIds = useRef<Set<string>>(new Set());

  const [projectTitles, setProjectTitles] = useState<Record<string, string>>({});
  const fetchedProjectIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const ids = new Set<string>();
    offers.forEach((o) => ids.add(o.professionalId));
    bundles.forEach((b) => ids.add(b.professionalId));

    const toFetch = Array.from(ids).filter((id) => !fetchedProfileIds.current.has(id));
    if (toFetch.length === 0) return;
    toFetch.forEach((id) => fetchedProfileIds.current.add(id));

    Promise.all(
      toFetch.map((id) => getDocument<User>(`users/${id}`).then((u) => [id, u] as const)),
    ).then((results) => {
      setProfessionalProfiles((prev) => {
        const next = { ...prev };
        for (const [id, u] of results) {
          if (u) next[id] = { displayName: u.displayName, photoURL: u.photoURL ?? undefined };
        }
        return next;
      });
    });
  }, [offers, bundles]);

  useEffect(() => {
    const ids = new Set<string>();
    offers.forEach((o) => ids.add(o.projectId));

    const toFetch = Array.from(ids).filter((id) => !fetchedProjectIds.current.has(id));
    if (toFetch.length === 0) return;
    toFetch.forEach((id) => fetchedProjectIds.current.add(id));

    Promise.all(
      toFetch.map((id) =>
        getDocument<Pick<ProjectRequest, 'title'>>(`projects/${id}`).then((p) => [id, p] as const),
      ),
    ).then((results) => {
      setProjectTitles((prev) => {
        const next = { ...prev };
        for (const [id, p] of results) {
          if (p) next[id] = p.title;
        }
        return next;
      });
    });
  }, [offers]);

  function goToProfessionalProfile(professionalId: string) {
    router.push(`/${modeSegment}/(tabs)/browse/profile/${professionalId}` as never);
  }

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

  async function handleAcceptBundle(bundle: BundleOffer) {
    try {
      await acceptBundle(bundle);
      showToast(t('chats_page.offer_accepted'), 'success');
    } catch {
      showToast(t('chats_page.failed_accept'), 'error');
    }
  }

  async function handleRejectBundle(bundleId: string) {
    try {
      await rejectBundle(bundleId);
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
        <View style={styles.headerWrap}>
          <View style={styles.header}>
            <Text style={[styles.headerTitle, { fontFamily: font.bold }]}>
              {t('chats_page.title_projects')}
            </Text>
          </View>
        </View>

        <View style={styles.content}>
          {bundles.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: '#004aad', fontFamily: font.bold, textAlign: rtl ? 'right' : 'left' }]}>
                {t('offers.bundle_section')}
              </Text>
              {bundlesLoading ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                bundles.map((bundle) => (
                  <BundleOfferCard
                    key={bundle.id}
                    bundle={bundle}
                    professionalProfile={professionalProfiles[bundle.professionalId]}
                    onPressProfile={() => goToProfessionalProfile(bundle.professionalId)}
                    onAccept={() => handleAcceptBundle(bundle)}
                    onReject={() => handleRejectBundle(bundle.id)}
                    isAccepting={isBundleAccepting === bundle.id}
                  />
                ))
              )}
            </View>
          )}

          {offers.length > 0 && (
            <View style={[styles.section, bundles.length > 0 && { marginTop: 24 }]}>
              <Text style={[styles.sectionTitle, { color: '#004aad', fontFamily: font.bold, textAlign: rtl ? 'right' : 'left' }]}>
                {t('chats_page.price_offers')}
              </Text>
              {offersLoading ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                offers.map((offer) => (
                  <PriceOfferCard
                    key={offer.id}
                    offer={offer}
                    professionalProfile={professionalProfiles[offer.professionalId]}
                    projectTitle={projectTitles[offer.projectId]}
                    onPressProfile={() => goToProfessionalProfile(offer.professionalId)}
                    onAccept={() => handleAccept(offer)}
                    onReject={() => handleReject(offer.id)}
                    isAccepting={isAccepting === offer.id}
                  />
                ))
              )}
            </View>
          )}

          <View style={[styles.section, { marginTop: 24 }]}>
            <Text style={[styles.sectionTitle, { color: '#004aad', fontFamily: font.bold, textAlign: rtl ? 'right' : 'left' }]}>
              {t('chats_page.my_projects')}
            </Text>
            {requestsLoading ? (
              <ActivityIndicator color={colors.accent} />
            ) : requests.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={[styles.emptyText, { color: colors.textMuted, fontFamily: font.regular, textAlign: rtl ? 'right' : 'left' }]}>
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
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { paddingBottom: 100 },
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
    color: '#ffffff',
    textShadowColor: '#004aad',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 1,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  content: { padding: 16, gap: 20 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 20, fontWeight: '800' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 15 },
});
