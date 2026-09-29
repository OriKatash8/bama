import { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Search } from 'lucide-react-native';
import { AppText } from '@components/ui/AppText';
import { getDocument } from '@core/firebase/firestore';
import { useTheme } from '@core/hooks/useTheme';
import { useAppFont } from '@core/hooks/useAppFont';
import { useSettingsStore } from '@core/stores/settingsStore';
import { formatShortDay, isoDayFromSeconds, rtlSafe } from '@utils/formatters';
import type { User } from '@core/types/user';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import { useCommunitySearchIndex, type SearchKind } from '../hooks/useCommunitySearchIndex';
import { MIN_QUERY_LENGTH, normalizeForSearch, searchMessages, type SearchResult } from '../search/searchMessages';

type Translations = typeof en;
function makeT(translations: Translations) {
  return (key: string, vars?: Record<string, string>): string => {
    let result: unknown = translations;
    for (const k of key.split('.')) result = (result as Record<string, unknown>)?.[k];
    let str = typeof result === 'string' ? result : key;
    if (vars) for (const [k, v] of Object.entries(vars)) str = str.replace(`{{${k}}}`, v);
    return str;
  };
}

/**
 * The search box and its results — one body for the sheet over the chat room
 * (ChatSearchSheet) and the community search page (CommunitySearchScreen).
 *
 * The chat's messages — a community's from every channel — are loaded once
 * (useCommunitySearchIndex) and filtered on the device as the user types
 * (searchMessages): Firestore has no text search. Newest first, with the
 * channel (communities only), the sender, and the match in bold. What a tapped
 * result does is the caller's: `onPick`.
 */
export function ChatSearchPanel({ chatId, kind, onPick, inset = 16 }: {
  chatId: string;
  kind: SearchKind;
  onPick: (r: SearchResult) => void;
  /** Side margin: the page has none of its own, the sheet already pads. */
  inset?: number;
}) {
  const colors = useTheme();
  const font = useAppFont();
  const language = useSettingsStore((s) => s.language);
  const rtl = language === 'he';
  const t = makeT(rtl ? he : en);
  const align = rtl ? 'right' : 'left';
  const rowDir = rtl ? 'row-reverse' : 'row';

  const index = useCommunitySearchIndex(chatId, kind);
  const [query, setQuery] = useState('');
  const [names, setNames] = useState<Record<string, string>>({});

  const results = useMemo(() => searchMessages(index.messages, query), [index.messages, query]);
  const queryTooShort = normalizeForSearch(query).length < MIN_QUERY_LENGTH;

  // Sender names, fetched once per sender as results bring them in.
  const senderKey = [...new Set(results.map((r) => r.message.senderId))].sort().join('|');
  useEffect(() => {
    const missing = senderKey.split('|').filter((id) => id && !(id in names));
    if (missing.length === 0) return;
    let active = true;
    Promise.all(missing.map(async (id) => [id, (await getDocument<User>(`users/${id}`))?.displayName ?? ''] as const))
      .then((pairs) => { if (active) setNames((prev) => ({ ...prev, ...Object.fromEntries(pairs) })); })
      .catch((err) => console.warn('[chat-search] sender names failed:', err));
    return () => { active = false; };
    // `names` is read only to skip what is already known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [senderKey]);

  let status: string | null = null;
  if (index.status === 'loading') status = t('community_search.loading');
  else if (index.status === 'error') status = t('community_search.error');
  else if (queryTooShort) status = t('community_search.min_chars');
  else if (results.length === 0) status = t('community_search.no_results');

  return (
    <View style={styles.container}>
      <View style={[styles.searchBox, { flexDirection: rowDir, marginHorizontal: inset }]}>
        <Search size={18} color={colors.primary} strokeWidth={2} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={rtlSafe(t('community_search.placeholder'), rtl)}
          placeholderTextColor="#9C99AD"
          autoFocus
          returnKeyType="search"
          clearButtonMode="while-editing"
          style={[styles.searchInput, { textAlign: align, ...font.regular }]}
        />
      </View>

      {status ? (
        <AppText style={[styles.status, { textAlign: 'center' }]}>{status}</AppText>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(r) => `${r.message.channelId}/${r.message.id}`}
          keyboardShouldPersistTaps="handled"
          // The sheet has no keyboard handling of its own; the list keeps its
          // last rows above the keyboard.
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={[styles.list, { paddingHorizontal: inset }]}
          ListHeaderComponent={
            <AppText style={[styles.count, { textAlign: align }]}>
              {t('community_search.results_count', { n: String(results.length) })}
            </AppText>
          }
          renderItem={({ item: r }) => (
            <TouchableOpacity
              testID={`search-result-${r.message.id}`}
              style={styles.row}
              onPress={() => onPick(r)}
              activeOpacity={0.75}
              accessibilityRole="button"
            >
              <View style={[styles.rowTop, { flexDirection: rowDir }]}>
                {/* Only a community's messages have a channel to name. */}
                {r.message.channelName ? (
                  <View testID="search-channel-chip" style={styles.channelChip}>
                    <AppText weight="semiBold" style={styles.channelChipText} numberOfLines={1}>
                      {r.message.channelName}
                    </AppText>
                  </View>
                ) : null}
                <AppText weight="semiBold" style={[styles.sender, { color: colors.text, textAlign: align }]} numberOfLines={1}>
                  {names[r.message.senderId] ?? ''}
                </AppText>
                {r.message.timestamp && (
                  <AppText style={styles.date}>
                    {formatShortDay(isoDayFromSeconds(r.message.timestamp.seconds), rtl ? 'he' : 'en')}
                  </AppText>
                )}
              </View>
              <Text style={[styles.snippet, { textAlign: align, ...font.regular }]} numberOfLines={2}>
                {r.snippet.slice(0, r.matchStart)}
                <Text testID="search-match" style={[styles.match, font.bold]}>
                  {r.snippet.slice(r.matchStart, r.matchEnd)}
                </Text>
                {r.snippet.slice(r.matchEnd)}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchBox: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(30,79,163,0.1)',
  },
  searchInput: { flex: 1, fontSize: 15, color: '#0f0f1f', height: '100%' },
  status: { marginTop: 32, fontSize: 14, color: 'rgba(15,15,31,0.5)', paddingHorizontal: 24 },
  list: { paddingVertical: 16, gap: 10, paddingBottom: 60 },
  count: { fontSize: 13, color: 'rgba(15,15,31,0.5)', marginBottom: 2 },
  row: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(30,79,163,0.07)',
  },
  rowTop: { alignItems: 'center', gap: 8 },
  channelChip: { backgroundColor: 'rgba(30,79,163,0.08)', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, maxWidth: 110 },
  channelChipText: { fontSize: 11.5, color: '#1e4fa3' },
  sender: { flex: 1, fontSize: 13.5 },
  date: { fontSize: 12, color: 'rgba(15,15,31,0.45)' },
  snippet: { fontSize: 14, lineHeight: 20, color: '#3a3a4f' },
  match: { fontWeight: '700', color: '#0f0f1f' },
});
