import { View, Text, StyleSheet } from 'react-native';
import type { Review } from '@core/types/project';

type ReviewsListProps = {
  reviews: Review[];
};

export function ReviewsList({ reviews }: ReviewsListProps) {
  if (reviews.length === 0) {
    return <Text style={styles.empty}>No reviews yet.</Text>;
  }
  return (
    <View style={styles.container}>
      {reviews.map((review) => (
        <View key={review.id} style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.author}>{review.authorName}</Text>
            <Text style={styles.stars}>
              {(() => {
                const clamped = Math.max(0, Math.min(5, Math.round(review.rating)));
                return '★'.repeat(clamped) + '☆'.repeat(5 - clamped);
              })()}
            </Text>
          </View>
          <Text style={styles.body}>{review.body}</Text>
          <Text style={styles.date}>
            {new Date(review.createdAt.seconds * 1000).toLocaleDateString()}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  empty: { fontSize: 14, color: 'rgba(0,74,173,0.4)', textAlign: 'center', paddingVertical: 16 },
  card: {
    backgroundColor: 'rgba(0,74,173,0.06)',
    borderRadius: 12,
    padding: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,74,173,0.15)',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  author: { fontSize: 14, fontWeight: '600', color: '#004aad' },
  stars: { fontSize: 14, color: '#F4C430' },
  body: { fontSize: 14, color: '#004aad', lineHeight: 20 },
  date: { fontSize: 12, color: 'rgba(0,74,173,0.5)' },
});
