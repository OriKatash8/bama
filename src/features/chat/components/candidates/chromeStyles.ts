import { StyleSheet } from 'react-native';

/**
 * The strip under the chat header. It reads as part of the header, not as a card
 * in the message list: same white, flush edges, no radius or shadow, and one
 * hairline under it — the same divider the community channel bar uses.
 */
export const chromeStyles = StyleSheet.create({
  strip: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
});
