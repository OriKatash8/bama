import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useAppFont } from '@core/hooks/useAppFont';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useCrewBuilder } from '../hooks/useCrewBuilder';
import { CategoryAccordion } from './CategoryAccordion';
import type { CrewRequestSlot } from '@core/types/project';
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
  onDismiss: () => void;
  onPost: (slots: CrewRequestSlot[]) => void;
  isPosting?: boolean;
};

export function RolePickerModal({ visible, onDismiss, onPost, isPosting = false }: Props) {
  const font = useAppFont();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';

  const { slots, addSlot, removeSlot, reset } = useCrewBuilder();

  function handleDismiss() {
    reset();
    onDismiss();
  }

  function handlePost() {
    if (slots.length === 0) return;
    onPost(slots);
    reset();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleDismiss}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={[styles.header, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
            <Text style={[styles.title, { ...font.bold, textAlign: rtl ? 'right' : 'left', flex: 1 }]}>
              {t('project_details.add_professional')}
            </Text>
            <TouchableOpacity onPress={handleDismiss} hitSlop={12} activeOpacity={0.7}>
              <Text style={[styles.closeBtn, { ...font.bold }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Category accordion */}
          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            <CategoryAccordion
              slots={slots}
              onSelectSubcategory={(cat, _sub) => addSlot(cat)}
              onRemoveSubcategory={(cat, _sub) => removeSlot(cat)}
            />
            <View style={{ height: 24 }} />
          </ScrollView>

          {/* Post button */}
          <TouchableOpacity
            style={[styles.postBtn, (slots.length === 0 || isPosting) && styles.postBtnDisabled]}
            onPress={handlePost}
            disabled={slots.length === 0 || isPosting}
            activeOpacity={0.8}
          >
            {isPosting
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={[styles.postBtnText, { ...font.bold }]}>
                  {t('project_details.post_roles')}
                </Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 32,
    maxHeight: '85%',
    flex: 1,
  },
  header: {
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#004aad',
  },
  closeBtn: {
    fontSize: 18,
    color: '#004aad99',
    paddingHorizontal: 4,
  },
  scroll: {
    flex: 1,
  },
  postBtn: {
    backgroundColor: '#004aad',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 12,
  },
  postBtnDisabled: { opacity: 0.5 },
  postBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
