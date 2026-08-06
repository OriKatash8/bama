import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
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
  const [index, setIndex] = useState(0);

  if (reviews.length === 0) {
    return <Text style={styles.empty}>No reviews yet.</Text>;
  }

  const review = reviews[index];
  const clamped = Math.max(0, Math.min(5, Math.round(review.rating)));
  const stars = '★'.repeat(clamped) + '☆'.repeat(5 - clamped);
  const date = new Date(review.createdAt.seconds * 1000).toLocaleDateString();

  function prev() { setIndex((i) => (i - 1 + reviews.length) % reviews.length); }
  function next() { setIndex((i) => (i + 1) % reviews.length); }

  return (
    <View style={styles.container}>
      {/* Review card — tap to go to next */}
      <TouchableOpacity activeOpacity={0.85} onPress={next} style={styles.card}>
        {/* Date (left) + name (middle) + avatar (right) */}
        <View style={styles.nameAvatarRow}>
          <Text style={styles.date}>{date}</Text>
          <Text style={styles.author}>{review.authorName}</Text>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(review.authorName)}</Text>
          </View>
        </View>

        {/* Stars */}
        <Text style={styles.stars}>{stars}</Text>

        {/* Body */}
        <Text style={styles.body}>{review.body}</Text>
      </TouchableOpacity>

      {/* Navigation row */}
      {reviews.length > 1 && (
        <View style={styles.navRow}>
          <TouchableOpacity onPress={prev} style={styles.navBtn} activeOpacity={0.7}>
            <ChevronLeft size={20} color="#004aad" strokeWidth={2.5} />
          </TouchableOpacity>

          <Text style={styles.counter}>{index + 1} / {reviews.length}</Text>

          <TouchableOpacity onPress={next} style={styles.navBtn} activeOpacity={0.7}>
            <ChevronRight size={20} color="#004aad" strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
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
  },

  nameAvatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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

  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },

  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,74,173,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  counter: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(0,74,173,0.5)',
    minWidth: 40,
    textAlign: 'center',
  },
});
