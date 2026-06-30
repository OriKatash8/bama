import { useState } from 'react';
import { View, Text, Image, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useTheme } from '@core/hooks/useTheme';
import type { ProfessionalResult } from '../hooks/useSearchProfessionals';

const AVAILABILITY_COLOR: Record<string, string> = {
  available: '#22c55e',
  busy: '#f59e0b',
  unavailable: '#ef4444',
};

type Props = { item: ProfessionalResult; onMessage?: () => Promise<void> };

export function ProfessionalCard({ item, onMessage }: Props) {
  const colors = useTheme();
  const { user, profile } = item;
  const [isMessaging, setIsMessaging] = useState(false);

  async function handleMessagePress() {
    if (!onMessage) return;
    setIsMessaging(true);
    try {
      await onMessage();
    } finally {
      setIsMessaging(false);
    }
  }
  const availColor = AVAILABILITY_COLOR[profile.availability] ?? colors.textMuted;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.row}>
        {user.photoURL ? (
          <Image source={{ uri: user.photoURL }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.accent + '33' }]}>
            <Text style={[styles.avatarInitial, { color: colors.accent }]}>
              {user.displayName?.charAt(0)?.toUpperCase() ?? '?'}
            </Text>
          </View>
        )}

        <View style={styles.info}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {user.displayName}
          </Text>
          {profile.bio ? (
            <Text style={[styles.bio, { color: colors.textSec }]} numberOfLines={2}>
              {profile.bio}
            </Text>
          ) : null}
          <View style={styles.badgeRow}>
            <View style={[styles.availBadge, { backgroundColor: availColor + '22', borderColor: availColor }]}>
              <View style={[styles.availDot, { backgroundColor: availColor }]} />
              <Text style={[styles.availText, { color: availColor }]}>
                {profile.availability}
              </Text>
            </View>
            {profile.rating > 0 && (
              <Text style={[styles.rating, { color: colors.textMuted }]}>
                ★ {profile.rating.toFixed(1)} ({profile.reviewCount})
              </Text>
            )}
          </View>
        </View>
      </View>

      {profile.skills && profile.skills.length > 0 && (
        <View style={styles.skillsRow}>
          {profile.skills.slice(0, 4).map((s, i) => (
            <View key={i} style={[styles.skillChip, { backgroundColor: colors.accent + '18', borderColor: colors.accent + '44' }]}>
              <Text style={[styles.skillText, { color: colors.accent }]} numberOfLines={1}>
                {s.subcategory}
              </Text>
            </View>
          ))}
          {profile.skills.length > 4 && (
            <Text style={[styles.moreSkills, { color: colors.textMuted }]}>+{profile.skills.length - 4}</Text>
          )}
        </View>
      )}

      {onMessage && (
        <TouchableOpacity
          style={[styles.messageBtn, { backgroundColor: colors.accent }]}
          onPress={handleMessagePress}
          disabled={isMessaging}
          activeOpacity={0.8}
        >
          {isMessaging
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.messageBtnText}>Message</Text>
          }
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 22, fontWeight: '700' },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  bio: { fontSize: 13, lineHeight: 18, marginBottom: 6 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  availBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  availDot: { width: 6, height: 6, borderRadius: 3 },
  availText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  rating: { fontSize: 12, fontWeight: '600' },
  skillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  skillChip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  skillText: { fontSize: 11, fontWeight: '600' },
  moreSkills: { fontSize: 12, alignSelf: 'center' },
  messageBtn: {
    marginTop: 12,
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
  },
  messageBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
