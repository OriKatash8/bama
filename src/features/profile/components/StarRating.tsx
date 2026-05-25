import { View, Text, StyleSheet } from 'react-native';

type StarRatingProps = {
  rating: number;
  reviewCount: number;
};

export function StarRating({ rating, reviewCount }: StarRatingProps) {
  return (
    <View style={styles.container}>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Text key={i} style={styles.star}>
            {rating >= i - 0.25 ? '★' : rating >= i - 0.75 ? '⯨' : '☆'}
          </Text>
        ))}
      </View>
      <Text style={styles.label}>
        {rating.toFixed(1)} ({reviewCount} {reviewCount === 1 ? 'review' : 'reviews'})
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 4 },
  stars: { flexDirection: 'row', gap: 2 },
  star: { fontSize: 24, color: '#F4C430' },
  label: { fontSize: 13, color: '#666' },
});
