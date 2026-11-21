import { View, StyleSheet } from 'react-native';
import { Star } from 'lucide-react-native';
import { AdminText, TYPE, useAdminPalette, useScopedT } from '@features/admin/ui';

/** A client's review held back by a "didn't happen" dispute (see reviewHold.ts). */
export type HeldReview = { rating: number; text: string; authorName: string };

const clampStars = (n: number) => Math.max(0, Math.min(5, Math.round(n)));

/**
 * The held review on an admin dispute card: stars, text and author. Shared by
 * Reports → מחלוקות and Fees → needs review, so the admin weighs the dispute with the
 * review it is hiding in front of them. Renders nothing when no review is held.
 */
export function HeldReviewNote({ review, testID }: { review?: HeldReview | null; testID?: string }) {
  const p = useAdminPalette();
  const { t, textAlign, rowDir } = useScopedT('admin_reports');
  if (!review) return null;
  const stars = clampStars(review.rating);
  return (
    <View style={[styles.box, { backgroundColor: p.surface2, borderColor: p.border }]} testID={testID}>
      <AdminText weight="semiBold" style={[TYPE.rowMeta, { color: p.text3, textAlign }]}>
        {t('held_review_title')}
      </AdminText>
      {/* Icons, not ★/☆ glyphs: hardcoded glyphs are an Android font backlog (androidGlyphBaseline). */}
      <View
        style={[styles.stars, { flexDirection: rowDir }]}
        accessible
        accessibilityLabel={`${stars}/5`}
        testID={testID ? `${testID}-stars` : undefined}
      >
        {[1, 2, 3, 4, 5].map((i) => (
          <View key={i} testID={i <= stars ? 'star-filled' : 'star-empty'}>
            <Star size={16} strokeWidth={2} color={p.warn} fill={i <= stars ? p.warn : 'none'} />
          </View>
        ))}
      </View>
      <AdminText selectable style={[styles.text, { color: p.text2, textAlign }]} testID={testID ? `${testID}-text` : undefined}>
        {review.text || t('held_review_no_text')}
      </AdminText>
      {!!review.authorName && (
        <AdminText style={[TYPE.rowMeta, { color: p.text3, textAlign }]} testID={testID ? `${testID}-author` : undefined}>
          {t('held_review_author', { name: review.authorName })}
        </AdminText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 12, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 10, gap: 2 },
  stars: { gap: 2, alignSelf: 'flex-start' },
  text: { fontSize: 14, lineHeight: 21 },
});
