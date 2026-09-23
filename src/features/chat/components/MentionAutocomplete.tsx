import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppText } from '@components/ui/AppText';
import type { MentionAutocompleteState, MentionRow } from '../hooks/useMentionAutocomplete';

/** Taller than this and it starts eating the conversation. */
const MAX_HEIGHT = 240;

type Props = {
  state: MentionAutocompleteState;
  rtl: boolean;
  accent: string;
  /** Wash behind the selected-looking @everyone row. */
  tint: string;
  onPick: (row: MentionRow) => void;
  /** Called on pointerdown/up around a row, so the composer's blur cannot
   *  cancel a press that has already begun. */
  onPressStart: () => void;
  onPressEnd: () => void;
  /** "No one left to mention" / "Up to 10 people" — passed in so the component
   *  holds no translation table of its own. */
  labels: { loading: string; empty: string; atLimit: string; everyone: string };
};

/**
 * The @-picker, anchored above the composer.
 *
 * FULL WIDTH, deliberately, so horizontal overflow is impossible by
 * construction rather than clamped at an edge. That is the right shape here
 * because the composer row's own `flexDirection` is the literal 'row' and never
 * flips — `+` is always visually left and Send always right in both languages,
 * so there is no input edge that moves between languages to anchor to. Direction
 * lives in the ROWS instead: flexDirection, textAlign and writingDirection.
 *
 * `start`/`end` are unusable app-wide: I18nManager.allowRTL(false) makes them
 * permanent aliases for left/right. Sides are chosen explicitly from `rtl`, the
 * same way the scroll-down button already does it.
 */
export function MentionAutocomplete({ state, rtl, accent, tint, onPick, onPressStart, onPressEnd, labels }: Props) {
  if (!state.open) return null;

  const rowDir = rtl ? 'row-reverse' : 'row';
  const align = rtl ? ('right' as const) : ('left' as const);
  const dir = rtl ? ('rtl' as const) : ('ltr' as const);

  return (
    <View style={styles.anchor} testID="mention-autocomplete" pointerEvents="box-none">
      <View style={styles.sheet}>
        {state.loading ? (
          // NOT "no results". The members are known but their names are still
          // resolving, and showing an empty list here is the failure that looks
          // identical on iOS and web.
          <View style={[styles.row, { flexDirection: rowDir }]} testID="mention-loading">
            <ActivityIndicator size="small" color={accent} />
            <AppText weight="regular" style={[styles.rowName, { textAlign: align, writingDirection: dir }]}>
              {labels.loading}
            </AppText>
          </View>
        ) : state.rows.length === 0 ? (
          <View style={[styles.row, { flexDirection: rowDir }]} testID="mention-empty">
            <AppText weight="regular" style={[styles.rowMuted, { textAlign: align, writingDirection: dir }]}>
              {state.atLimit ? labels.atLimit : labels.empty}
            </AppText>
          </View>
        ) : (
          <ScrollView keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}>
            {state.rows.map((row) => (
              <TouchableOpacity
                key={row.id}
                testID={`mention-row-${row.id}`}
                style={[styles.row, { flexDirection: rowDir }, row.everyone && { backgroundColor: tint }]}
                onPressIn={onPressStart}
                onPressOut={onPressEnd}
                onPress={() => { onPressEnd(); onPick(row); }}
                activeOpacity={0.7}
              >
                <View style={[styles.avatar, { backgroundColor: accent }]}>
                  <Text style={styles.avatarInitial}>
                    {row.everyone ? '@' : (row.name[0] ?? '?').toUpperCase()}
                  </Text>
                </View>
                <AppText
                  weight={row.everyone ? 'semiBold' : 'regular'}
                  numberOfLines={1}
                  style={[styles.rowName, { textAlign: align, writingDirection: dir }]}
                >
                  {row.everyone ? labels.everyone : row.name}
                </AppText>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // bottom:'100%' pins it to the top edge of the composer, which the
  // KeyboardAvoidingView has already lifted above the keyboard.
  anchor: {
    position: 'absolute',
    bottom: '100%',
    left: 12,
    right: 12,
    // The composer row carries neither today; Android needs elevation to paint
    // over the message list.
    zIndex: 10,
    elevation: 10,
  },
  sheet: {
    maxHeight: MAX_HEIGHT,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 4,
    marginBottom: 6,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  row: { alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 9 },
  avatar: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  rowName: { flex: 1, fontSize: 14.5, color: '#1A1626' },
  rowMuted: { flex: 1, fontSize: 13.5, color: '#8B8898' },
});
