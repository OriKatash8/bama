import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { AppText } from '@components/ui/AppText';

export const SENDER_AVATAR_SIZE = 28;

/**
 * The sender's picture beside someone else's bubble in the chat room: their
 * photo, or their initial on their colour (the colour of their name above the
 * bubble). Tappable where their name is — it opens their profile.
 */
export function SenderAvatar({ photoURL, name, color, onPress }: {
  photoURL: string | null | undefined;
  name: string;
  color: string;
  onPress?: () => void;
}) {
  const body = photoURL ? (
    // expo-image, cached in memory and on disk like the chat list's pictures:
    // the same sender's photo repeats down the list, and React Native's Image
    // fetched and decoded it again for every row.
    <Image testID="sender-avatar-photo" source={{ uri: photoURL }} style={styles.photo} contentFit="cover" cachePolicy="memory-disk" recyclingKey={photoURL} transition={120} />
  ) : (
    <AppText weight="bold" style={styles.initial}>{name.trim().charAt(0).toUpperCase()}</AppText>
  );
  const style = [styles.circle, { backgroundColor: photoURL ? '#eef0fa' : color }];
  if (!onPress) return <View testID="sender-avatar" style={style}>{body}</View>;
  return (
    <TouchableOpacity testID="sender-avatar" style={style} onPress={onPress} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={name}>
      {body}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // Sits at the bubble's bottom, like every chat app.
  circle: {
    width: SENDER_AVATAR_SIZE,
    height: SENDER_AVATAR_SIZE,
    borderRadius: SENDER_AVATAR_SIZE / 2,
    alignSelf: 'flex-end',
    marginHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photo: { width: SENDER_AVATAR_SIZE, height: SENDER_AVATAR_SIZE },
  initial: { fontSize: 13, lineHeight: 19, color: '#ffffff' },
});
