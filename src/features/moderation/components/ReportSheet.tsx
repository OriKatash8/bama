import { ActivityIndicator, Image, Modal, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { X } from 'lucide-react-native';
import { AppText } from '@components/ui/AppText';
import { useAppFont } from '@core/hooks/useAppFont';
import { useModeAccent } from '@core/navigation/floatingTabBar';
import { useSettingsStore } from '@core/stores/settingsStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

export const MAX_EVIDENCE = 3;
const MIN_REASON = 20;

function makeT(tr: typeof en) {
  return (key: string, vars?: Record<string, string>): string => {
    let r: unknown = tr;
    for (const k of key.split('.')) r = (r as Record<string, unknown>)?.[k];
    let s = typeof r === 'string' ? r : key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{{${k}}}`, v);
    return s;
  };
}

/**
 * The report pop-up: a white card centred on a dimmed backdrop, with the reason,
 * optional screenshots and a submit button in the viewer's mode colour. Project
 * details and both browse profiles show this one card; each screen keeps its
 * own state and its own submit.
 */
export function ReportSheet({
  visible,
  name,
  reason,
  onReason,
  evidence,
  onPickEvidence,
  onRemoveEvidence,
  submitting,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  /** Who is being reported. */
  name: string;
  reason: string;
  onReason: (v: string) => void;
  evidence: string[];
  onPickEvidence: () => void;
  onRemoveEvidence: (idx: number) => void;
  submitting: boolean;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const font = useAppFont();
  const { accent } = useModeAccent();
  const rtl = useSettingsStore((s) => s.language) === 'he';
  const t = makeT(rtl ? he : en);
  const rowDirection = rtl ? 'row-reverse' : 'row';
  const textAlign = rtl ? 'right' : 'left';
  const canSubmit = reason.trim().length >= MIN_REASON && !submitting;
  const full = evidence.length >= MAX_EVIDENCE;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Plain overlay View, absolute-fill dismiss layer BEHIND a centred white
          card. The card must not be nested inside a touchable — `width: '100%'`
          would resolve against a content-sized parent and collapse. */}
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} testID="report-backdrop" />
        <View style={styles.sheet}>
          <View style={[styles.header, { flexDirection: rowDirection }]} testID="report-header">
            <AppText weight="bold" style={[styles.title, { textAlign }]}>{t('report.title')}</AppText>
            <TouchableOpacity onPress={onClose} hitSlop={8} activeOpacity={0.7} testID="report-close" accessibilityRole="button">
              <X size={22} color="#000000" strokeWidth={2.2} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <AppText weight="regular" style={[styles.subtitle, { textAlign }]}>
              {t('report.reporting', { name })}
            </AppText>
            <AppText weight="semiBold" style={[styles.label, { textAlign }]}>
              {t('report.reason_label')}
            </AppText>
            <TextInput
              style={[styles.input, { ...font.regular, textAlign }]}
              multiline
              value={reason}
              onChangeText={onReason}
              placeholder={t('report.reason_placeholder')}
              placeholderTextColor="#00000066"
              textAlignVertical="top"
            />
            {reason.length > 0 && reason.length < MIN_REASON && (
              <AppText weight="regular" style={[styles.hint, { textAlign }]}>
                {t('report.min_chars')}
              </AppText>
            )}

            {/* Evidence screenshots (optional) */}
            <TouchableOpacity
              style={[styles.evidenceBtn, { flexDirection: rowDirection, opacity: full ? 0.4 : 1 }]}
              onPress={onPickEvidence}
              disabled={full}
              activeOpacity={0.7}
            >
              <AppText weight="semiBold" style={styles.evidenceBtnText}>{t('report.add_evidence')}</AppText>
            </TouchableOpacity>
            {evidence.length > 0 && (
              <View style={styles.thumbRow}>
                {evidence.map((uri, idx) => (
                  <View key={idx} style={styles.thumbWrap}>
                    <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
                    <TouchableOpacity
                      style={styles.thumbRemove}
                      onPress={() => onRemoveEvidence(idx)}
                      hitSlop={4}
                      activeOpacity={0.8}
                      testID={`report-evidence-remove-${idx}`}
                    >
                      <X size={12} color="#ffffff" strokeWidth={3} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: accent, opacity: canSubmit ? 1 : 0.45 }]}
            onPress={onSubmit}
            disabled={!canSubmit}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSubmit }}
            testID="report-submit"
          >
            {submitting
              ? <ActivityIndicator size="small" color="#ffffff" />
              : <AppText weight="bold" style={styles.submitText}>{t('report.submit')}</AppText>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '85%',
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 20,
  },
  /** flexShrink, not flex:1 — the card is auto-height capped at maxHeight. */
  scroll: { flexShrink: 1 },
  header: { alignItems: 'center', justifyContent: 'space-between' },
  title: { flex: 1, color: '#000000', fontSize: 18 },
  subtitle: { color: '#000000', fontSize: 14 },
  label: { color: '#000000', fontSize: 14 },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(0,74,173,0.15)',
    borderRadius: 10,
    padding: 12,
    color: '#000000',
    height: 120,
    textAlignVertical: 'top',
  },
  hint: { color: '#000000', fontSize: 12 },
  submitBtn: { borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  submitText: { color: '#ffffff', fontSize: 15 },
  evidenceBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,74,173,0.2)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
    gap: 6,
  },
  evidenceBtnText: { color: '#000000', fontSize: 14 },
  thumbRow: { flexDirection: 'row', gap: 10, marginBottom: 16, flexWrap: 'wrap' },
  thumbWrap: { position: 'relative' },
  thumb: { width: 72, height: 72, borderRadius: 8 },
  thumbRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#ff4d6d',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
