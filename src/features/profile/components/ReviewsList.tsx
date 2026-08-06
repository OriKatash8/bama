import { View, Text, StyleSheet } from 'react-native';
import type { Review } from '@core/types/project';

type ReviewsListProps = {
  reviews: Review[];
};

function initials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0] ?? '')
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function ReviewsList({ reviews }: ReviewsListProps) {
  if (reviews.length === 0) {
    return <Text style={styles.empty}>No reviews yet.</Text>;
  }
  return (
    <View style={styles.container}>
      {reviews.map((review) => {
        const clamped = Math.max(0, Math.min(5, Math.round(review.rating)));
        const stars = '★'.repeat(clamped) + '☆'.repeat(5 - clamped);
        const date = new Date(review.createdAt.seconds * 1000).toLocaleDateString();

        return (
          <View key={review.id} style={styles.card}>
            {/* Date — top right */}
            <Text style={styles.date}>{date}</Text>

            {/* Avatar (left) + name (right of avatar) */}
            <View style={styles.nameAvatarRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials(review.authorName)}</Text>
              </View>
              <Text style={styles.author}>{review.authorName}</Text>
            </View>

            {/* Stars — right aligned */}
            <Text style={styles.stars}>{stars}</Text>

            {/* Review body — right aligned */}
            <Text style={styles.body}>{review.body}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  empty: { fontSize: 14, color: 'rgba(0,74,173,0.4)', textAlign: 'center', paddingVertical: 16 },

  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,74,173,0.1)',
  },

  date: {
    fontSize: 11,
    color: 'rgba(0,74,173,0.4)',
    alignSelf: 'flex-start',
    textAlign: 'left',
  },

  nameAvatarRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },

  author: {
    fontSize: 14,
    fontWeight: '700',
    color: '#004aad',
    textAlign: 'right',
    flex: 1,
  },

  stars: {
    fontSize: 15,
    color: '#cb6ce6',
    textAlign: 'right',
  },

  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,74,173,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#004aad',
  },

  body: {
    fontSize: 14,
    color: '#004aad',
    lineHeight: 20,
    textAlign: 'right',
  },
});
