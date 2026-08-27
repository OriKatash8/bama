import { useMemo, useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback,
  FlatList, StyleSheet,
} from 'react-native';
import { X, MapPin } from 'lucide-react-native';
import { AppText } from '@components/ui/AppText';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAppFont } from '@core/hooks/useAppFont';
import { ISRAEL_LOCATIONS_HE, ISRAEL_LOCATIONS_EN } from '@core/constants/israelLocations';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

type Translations = typeof en;
function makeT(translations: Translations) {
  return (key: string): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
}

type Props = {
  visible: boolean;
  value: string;
  onSelect: (city: string) => void;
  onClose: () => void;
};

/**
 * Searchable Israeli-city picker, mirroring the client home builder's location
 * picker. Allows selecting from the list or adding a free-typed city.
 */
export function CityPickerModal({ visible, value, onSelect, onClose }: Props) {
  const language = useSettingsStore((s) => s.language);
  const rtl = language === 'he';
  const font = useAppFont();
  const t = makeT(language === 'he' ? he : en);

  const [search, setSearch] = useState('');

  const list = language === 'he' ? ISRAEL_LOCATIONS_HE : ISRAEL_LOCATIONS_EN;
  const cities = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) => c.toLowerCase().includes(q));
  }, [search, list]);
  const showAdd =
    search.trim().length > 0 &&
    !cities.some((c) => c.toLowerCase() === search.trim().toLowerCase());

  function pick(city: string) {
    onSelect(city);
    onClose();
    setSearch('');
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.box}>
              <View style={styles.nav}>
                <Text style={[styles.navTitle, { ...font.bold }]}>{t('marketplace.location_city')}</Text>
                <TouchableOpacity onPress={onClose} hitSlop={12} activeOpacity={0.7}>
                  <X size={18} color="#004aad" strokeWidth={2.5} />
                </TouchableOpacity>
              </View>

              <TextInput
                style={[styles.searchInput, { ...font.regular, textAlign: rtl ? 'right' : 'left' }]}
                value={search}
                onChangeText={setSearch}
                placeholder={t('builder.search_city')}
                placeholderTextColor="#004aad80"
                autoFocus
                returnKeyType="search"
                clearButtonMode="while-editing"
              />

              <FlatList
                data={cities}
                keyExtractor={(item) => item}
                keyboardShouldPersistTaps="handled"
                initialNumToRender={15}
                maxToRenderPerBatch={15}
                windowSize={3}
                style={styles.list}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
                ListFooterComponent={showAdd ? (
                  <TouchableOpacity
                    style={[styles.row, styles.addRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}
                    onPress={() => pick(search.trim())}
                    activeOpacity={0.7}
                  >
                    <MapPin size={14} color="#004aad" strokeWidth={1.8} />
                    <Text style={[styles.addText, { ...font.semiBold, textAlign: rtl ? 'right' : 'left' }]}>
                      {rtl ? `+ הוסף "${search.trim()}"` : `+ Add "${search.trim()}"`}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.row, { flexDirection: rtl ? 'row-reverse' : 'row' }]}
                    onPress={() => pick(item)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                  >
                    <MapPin size={14} color="#004aad" strokeWidth={1.8} />
                    <Text style={[styles.rowText, { ...font.regular, textAlign: rtl ? 'right' : 'left' }, item === value && styles.rowTextSelected]}>
                      {item}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  box: { width: 300, maxHeight: 420, borderRadius: 16, borderWidth: 2, padding: 12, backgroundColor: '#ffffff', borderColor: '#004aad' },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  navTitle: { fontSize: 16, fontWeight: '700', color: '#004aad' },
  searchInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 14, marginBottom: 6, color: '#004aad', borderColor: '#004aad' },
  list: { maxHeight: 280 },
  row: { alignItems: 'center', gap: 8, paddingVertical: 7 },
  rowText: { fontSize: 14, fontWeight: '500', flex: 1, color: '#004aad' },
  rowTextSelected: { fontWeight: '800' },
  separator: { height: 1, backgroundColor: '#004aad', opacity: 0.15 },
  addRow: { borderTopWidth: 1, borderTopColor: 'rgba(0,74,173,0.15)', marginTop: 4, paddingTop: 10 },
  addText: { fontSize: 14, flex: 1, color: '#004aad' },
});
