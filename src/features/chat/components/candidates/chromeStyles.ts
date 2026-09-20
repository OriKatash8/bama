import { StyleSheet } from 'react-native';

/**
 * The candidate panels' shell. A card in the conversation now, not a second
 * header: inset from the screen's sides, white on the chat's own background,
 * with a hairline border and a shadow the same violet as the rest of the app.
 *
 * `card` is the shell only. The client's panel divides itself into sections
 * with their own padding, so a panel that is one block of content (the
 * professional's) adds `cardBody` for the padding the strip used to carry.
 */
export const chromeStyles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EBE7F4',
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#4C1D95',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardBody: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  /** Between the panel's sections. A true hairline is invisible at this
   *  contrast on a phone, so the divider is a full pixel. */
  divider: {
    height: 1,
    backgroundColor: '#F0EDF6',
  },
});
