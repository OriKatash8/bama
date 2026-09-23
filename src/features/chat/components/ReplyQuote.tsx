import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { X } from 'lucide-react-native';
import { useAppFont } from '@core/hooks/useAppFont';
import { isolate } from '@utils/formatters';
import type { ReplyTo } from '../utils/replyTo';

/**
 * The quoted message — above the composer while you write, and inside the
 * bubble once you send.
 *
 * One component for both, because they are the same object rendered the same
 * way; the only real differences are a cancel button and whether tapping jumps.
 * Two components would be two places to forget the font trap.
 *
 * Rendered as plain <Text> rather than <AppText>: AppText picks Heebo vs
 * Montserrat by regex-testing extractString(children), which returns '' for
 * ELEMENT children, so a block built from nested runs silently renders every
 * Hebrew quote in the Latin face. The face is resolved here per string instead,
 * which is also why the name and the snippet each get their own — a Hebrew name
 * above a Latin snippet is an ordinary case in this app.
 *
 * Sides come from `rtl`, never from `start`/`end`: the app calls
 * I18nManager.forceRTL(false), so those are permanent aliases for left/right.
 */

/** What the quote says when the original had no text of its own. */
const KIND_LABEL: Record<ReplyTo['kind'], string> = {
  image: 'chats.reply_photo',
  video: 'chats.reply_video',
  audio: 'chats.reply_voice',
  text: 'chats.reply_message',
};

export function ReplyQuote({
  replyTo, rtl, accent, color, names, currentUserId, t, variant, onCancel, onPress,
}: {
  replyTo: ReplyTo;
  rtl: boolean;
  accent: string;
  color: string;
  names: Record<string, string>;
  currentUserId: string;
  t: (key: string) => string;
  variant: 'bubble' | 'composer';
  onCancel?: () => void;
  onPress?: (messageId: string) => void;
}) {
  const font = useAppFont();

  const who = replyTo.senderId === currentUserId
    ? t('chats.reply_to_you')
    : names[replyTo.senderId] ?? t('chats.reply_message');

  // A caption-less photo and every voice note arrive with '', which would
  // otherwise render as an empty strip under the name.
  const body = replyTo.snippet || t(KIND_LABEL[replyTo.kind]);

  const side = rtl
    ? { borderRightWidth: 3, borderRightColor: accent, paddingRight: 8 }
    : { borderLeftWidth: 3, borderLeftColor: accent, paddingLeft: 8 };

  return (
    <TouchableOpacity
      testID="reply-quote"
      accessibilityRole="button"
      activeOpacity={onPress && variant === 'bubble' ? 0.7 : 1}
      // The composer preview has nothing sent to jump to, so a press there is
      // inert rather than wired to a different action.
      onPress={variant === 'bubble' ? () => onPress?.(replyTo.messageId) : undefined}
      style={[
        styles.quote,
        side,
        { flexDirection: rtl ? 'row-reverse' : 'row' },
        variant === 'composer' ? styles.composer : styles.bubble,
      ]}
    >
      <View style={styles.body}>
        <Text
          testID="reply-quote-name"
          numberOfLines={1}
          style={[
            styles.name,
            { color: accent, textAlign: rtl ? 'right' : 'left', writingDirection: rtl ? 'rtl' : 'ltr' },
            font.forText(who, 'semiBold'),
          ]}
        >
          {/* A Latin name in a Hebrew line, or the reverse, drags the neutral
              characters around it without this. */}
          {isolate(who)}
        </Text>
        <Text
          testID="reply-quote-snippet"
          numberOfLines={2}
          style={[
            styles.snippet,
            { color, textAlign: rtl ? 'right' : 'left', writingDirection: rtl ? 'rtl' : 'ltr' },
            font.forText(body, 'regular'),
          ]}
        >
          {body}
        </Text>
      </View>
      {variant === 'composer' && (
        <TouchableOpacity
          testID="reply-quote-cancel"
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel={t('chats.cancel_reply')}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <X size={18} color={color} strokeWidth={2} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  quote: {
    alignItems: 'center',
    gap: 8,
    borderRadius: 6,
    paddingVertical: 4,
  },
  // Inside a bubble the quote sits on a wash of the bubble's own colour, so it
  // reads as part of the message rather than a second card.
  bubble: { backgroundColor: 'rgba(0,0,0,0.06)', marginBottom: 4, paddingHorizontal: 6 },
  composer: { backgroundColor: 'rgba(0,0,0,0.04)', marginHorizontal: 12, marginBottom: 6, paddingHorizontal: 8, paddingVertical: 6 },
  body: { flex: 1 },
  name: { fontSize: 12, marginBottom: 1 },
  snippet: { fontSize: 13, opacity: 0.8 },
});
