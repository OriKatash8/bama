import { useState, useEffect } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, MessageCircle, Star, User as UserIcon } from 'lucide-react-native';
import { Screen } from '@components/layout/Screen';
import { BioSection } from '@features/profile/components/BioSection';
import { RoleChips } from '@features/profile/components/RoleChips';
import { ContentTabs } from '@features/profile/components/ContentTabs';
import { PortfolioGrid } from '@features/profile/components/PortfolioGrid';
import { getDocument, queryDocuments, queryByField } from '@core/firebase/firestore';
import { useTheme } from '@core/hooks/useTheme';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
import { useStartChat } from '@features/chat/hooks/useStartChat';
import type { User, ProfessionalProfile } from '@core/types/user';
import type { MediaAsset } from '@core/types/media';
import type { Review } from '@core/types/project';

export default function PublicProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();
  const colors = useTheme();
  const language = useSettingsStore((s) => s.language);
  const font = useAppFont();
  const { startChat, isLoading: isStarting } = useStartChat();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfessionalProfile | null>(null);
  const [portfolio, setPortfolio] = useState<MediaAsset[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;

    void (async () => {
      try {
        const [userData, profileData, portfolioData, reviewData] = await Promise.all([
          getDocument<User>(`users/${userId}`),
          getDocument<ProfessionalProfile>(`users/${userId}/profile/data`),
          queryDocuments<MediaAsset>(`users/${userId}/portfolio`),
          queryByField<Review>('reviews', 'professionalId', userId),
        ]);

        setUser(userData);
        setProfile(profileData);
        setPortfolio(
          portfolioData.sort((a, b) => b.uploadedAt.seconds - a.uploadedAt.seconds)
        );
        setReviews(reviewData);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [userId]);

  if (isLoading) {
    return (
      <Screen scrollable={false}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#cb6ce6" />
        </View>
      </Screen>
    );
  }

  if (!user || !profile) {
    return (
      <Screen scrollable={false}>
        <View style={styles.center}>
          <Text style={[styles.errorText, { color: colors.textMuted }]}>Profile not found</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backFallback} activeOpacity={0.7}>
            <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '600' }}>← Go back</Text>
          </TouchableOpacity>
        </View>
      </Screen>
    );
  }

  const skills = profile.skills ?? [];

  return (
    <Screen scrollable style={styles.screenContent}>
      {/* ── Hero gradient ── */}
      <LinearGradient
        colors={['#cb6ce6', '#004aad']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.hero}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.heroBack}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ChevronLeft size={20} color="#fff" strokeWidth={2.5} />
          <Text style={styles.heroBackText}>Back</Text>
        </TouchableOpacity>

        <View style={styles.heroBody}>
          {user.photoURL ? (
            <Image source={{ uri: user.photoURL }} style={styles.heroAvatar} />
          ) : (
            <View style={[styles.heroAvatar, styles.heroAvatarFallback]}>
              <UserIcon size={44} color="#fff" strokeWidth={1.5} />
            </View>
          )}
          <Text style={[styles.heroName, { fontFamily: font.bold }]}>{user.displayName}</Text>
          {profile.rating > 0 && (
            <View style={styles.heroRatingRow}>
              <Star size={13} color="#FFD700" fill="#FFD700" />
              <Text style={styles.heroRatingText}>
                {profile.rating.toFixed(1)} · {profile.reviewCount} review{profile.reviewCount !== 1 ? 's' : ''}
              </Text>
            </View>
          )}
        </View>
      </LinearGradient>

      {/* ── Bio ── */}
      <BioSection bio={profile.bio} isEditing={false} />

      {/* ── Skills ── */}
      {skills.length > 0 && (
        <RoleChips selected={skills} isEditing={false} />
      )}

      {/* ── Equipment / Price List / Reviews ── */}
      <ContentTabs
        equipment={profile.equipment}
        priceList={profile.priceList}
        reviews={reviews}
        isEditing={false}
      />

      {/* ── Portfolio ── */}
      {portfolio.length > 0 && (
        <View style={styles.portfolioSection}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>PORTFOLIO</Text>
          <PortfolioGrid assets={portfolio} isEditing={false} />
        </View>
      )}

      {/* ── Send Message ── */}
      <TouchableOpacity
        style={[styles.messageBtn, isStarting && styles.disabled]}
        onPress={() => void startChat(userId)}
        disabled={isStarting}
        activeOpacity={0.8}
      >
        <MessageCircle size={20} color="#fff" strokeWidth={2} />
        <Text style={[styles.messageBtnText, { fontFamily: font.bold }]}>
          {isStarting ? 'Opening chat…' : 'Send Message'}
        </Text>
      </TouchableOpacity>

      <View style={styles.bottomPad} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContent: { paddingBottom: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  errorText: { fontSize: 16, fontWeight: '500' },
  backFallback: { paddingVertical: 8 },

  hero: {
    marginHorizontal: -16,
    marginTop: -16,
    paddingBottom: 28,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  heroBack: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 2,
    alignSelf: 'flex-start',
  },
  heroBackText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  heroBody: { alignItems: 'center', paddingTop: 4 },
  heroAvatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.4)',
    marginBottom: 12,
  },
  heroAvatarFallback: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroName: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    fontFamily: 'Montserrat-Regular',
    marginBottom: 6,
  },
  heroRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  heroRatingText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontWeight: '500',
  },

  portfolioSection: { marginTop: 8 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.5,
    marginBottom: 8,
    marginTop: 16,
  },

  messageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#004aad',
    borderRadius: 14,
    height: 54,
    marginTop: 24,
  },
  messageBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Montserrat-Regular',
  },
  disabled: { opacity: 0.55 },

  bottomPad: { height: 40 },
});
