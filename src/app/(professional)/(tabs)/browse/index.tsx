import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, Modal,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { Search } from 'lucide-react-native';
import { Screen } from '@components/layout/Screen';
import { useTheme } from '@core/hooks/useTheme';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
import { auth } from '@core/firebase/config';
import { CREW_CATEGORIES } from '@features/crew/data/categories';
import { useSearchProfessionals } from '@features/crew/hooks';
import type { ProfessionalResult } from '@features/crew/hooks/useSearchProfessionals';
import { ProfessionalCard } from '@features/crew/components';
import { getOrCreateDM } from '@features/chat/services/chatService';

const CATEGORIES = Object.keys(CREW_CATEGORIES).map((key) => ({
  key,
  label: key,
}));

export default function BrowseScreen() {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [modalQuery, setModalQuery] = useState('');
  const colors = useTheme();
  const language = useSettingsStore((s) => s.language);
  const font = useAppFont();
  const router = useRouter();
  const segments = useSegments();
  const rtl = language === 'he';

  const currentUid = auth.currentUser?.uid;

  function closeModal() {
    setSelectedCategory(null);
    setModalQuery('');
  }

  async function handleMessage(professionalId: string) {
    const currentUserId = auth.currentUser?.uid;
    if (!currentUserId) return;
    const chatId = await getOrCreateDM(currentUserId, professionalId);
    router.push(`/${segments[0]}/(tabs)/chats/${chatId}` as never);
  }

  const { results: modalResults, isLoading: modalLoading } = useSearchProfessionals(
    selectedCategory ?? ''
  );

  const filteredModalResults: ProfessionalResult[] = (
    modalQuery.trim()
      ? modalResults.filter((r) =>
          r.user.displayName.toLowerCase().includes(modalQuery.toLowerCase())
        )
      : modalResults
  ).filter((r) => r.user.id !== currentUid);

  const filteredCategories = query.trim()
    ? CATEGORIES.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()))
    : CATEGORIES;

  return (
    <Screen scrollable={false}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.heading, { color: colors.text, ...font.bold }]}>
            Browse Professionals
          </Text>
        </View>

        {/* Top search bar */}
        <View style={[styles.searchRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Search size={16} color={colors.placeholder} strokeWidth={2.5} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search by category…"
            placeholderTextColor={colors.placeholder}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} activeOpacity={0.7}>
              <Text style={[styles.clearBtn, { color: colors.textMuted }]}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Flat category list */}
        <FlatList
          data={filteredCategories}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item: cat }) => (
            <TouchableOpacity
              style={[styles.categoryRow, { borderBottomColor: colors.border }]}
              onPress={() => setSelectedCategory(cat.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.categoryLabel, { ...font.bold }]}>{cat.label}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 32, ...font.regular }}>
              No categories match "{query}"
            </Text>
          }
        />
      </View>

      {/* Category results modal */}
      <Modal
        visible={selectedCategory !== null}
        transparent
        animationType="slide"
        onRequestClose={closeModal}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={closeModal}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { ...font.bold, color: colors.text }]}>
                {selectedCategory}
              </Text>
              <TouchableOpacity onPress={closeModal} hitSlop={12} activeOpacity={0.7}>
                <Text style={[styles.modalClose, { color: colors.textMuted }]}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Pill search bar */}
            <View style={[styles.modalSearchRow, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
              <Search size={16} color={colors.placeholder} strokeWidth={2.5} />
              <TextInput
                style={[styles.modalSearchInput, { color: colors.text }]}
                placeholder="Search by name…"
                placeholderTextColor={colors.placeholder}
                value={modalQuery}
                onChangeText={setModalQuery}
              />
              {modalQuery.length > 0 && (
                <TouchableOpacity onPress={() => setModalQuery('')} activeOpacity={0.7}>
                  <Text style={{ color: colors.textMuted, fontSize: 14 }}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Results */}
            {modalLoading ? (
              <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
            ) : filteredModalResults.length === 0 ? (
              <View style={styles.emptyResults}>
                <Text style={styles.emptyIcon}>👤</Text>
                <Text style={[styles.emptyText, { color: colors.textSec }]}>No professionals yet</Text>
                <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>
                  Professionals in this category will appear here once they set up their profile.
                </Text>
              </View>
            ) : (
              <FlatList
                data={filteredModalResults}
                keyExtractor={(item) => item.user.id}
                contentContainerStyle={styles.resultsList}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <ProfessionalCard
                    item={item}
                    onMessage={() => handleMessage(item.user.id)}
                  />
                )}
              />
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 16 },

  header: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  heading: { fontSize: 22, fontWeight: '800' },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 14,
    height: 44,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15 },
  clearBtn: { fontSize: 14, paddingHorizontal: 4 },

  listContent: { paddingHorizontal: 16, paddingBottom: 100 },

  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
  },
  categoryLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: '#004aad',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingHorizontal: 16,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    flex: 1,
  },
  modalClose: {
    fontSize: 18,
    paddingHorizontal: 4,
  },
  modalSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    marginBottom: 16,
    paddingHorizontal: 14,
    height: 44,
    borderWidth: 1,
    gap: 8,
  },
  modalSearchInput: { flex: 1, fontSize: 15 },

  resultsList: { paddingBottom: 32 },

  emptyResults: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 40,
    paddingVertical: 40,
  },
  emptyIcon: { fontSize: 52, marginBottom: 4 },
  emptyText: { fontSize: 18, fontWeight: '700' },
  emptySubtext: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
