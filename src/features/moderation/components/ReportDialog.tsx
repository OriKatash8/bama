import { useState } from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '@core/stores/authStore';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useUiStore } from '@core/stores/uiStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import { MAX_EVIDENCE, ReportSheet } from './ReportSheet';
import type { ReportTargetType } from '../services/reportService';

export type ReportTarget = {
  reportedUserId: string;
  reportedUserName: string;
  targetType: ReportTargetType;
  targetId?: string;
  chatId?: string;
  snippet?: string;
};

/**
 * A self-contained report pop-up: give it a target and it owns the reason,
 * screenshots and submit. Used wherever content can be reported (a message, a
 * listing, a review, a portfolio item, a user in a chat) so each screen only
 * decides WHAT is being reported, not how.
 */
export function ReportDialog({
  target,
  onClose,
}: {
  target: ReportTarget | null;
  onClose: () => void;
}) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const language = useSettingsStore((s) => s.language);
  const showToast = useUiStore((s) => s.showToast);
  const tr = language === 'he' ? he : en;
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function close() {
    setReason('');
    setEvidence([]);
    onClose();
  }

  async function pickEvidence() {
    if (evidence.length >= MAX_EVIDENCE) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setEvidence((prev) => [...prev, result.assets[0].uri]);
    }
  }

  async function submit() {
    if (!target || !currentUserId || reason.trim().length < 20) return;
    setSubmitting(true);
    try {
      // Loaded on submit, not at import: this dialog is mounted by many screens
      // (reviews, listings, portfolio…) and should not drag Firestore into each.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { submitReport } = require('../services/reportService') as typeof import('../services/reportService');
      await submitReport({ ...target, reporterId: currentUserId, reason, evidence });
      close();
      showToast(tr.report.success, 'success');
    } catch (e: any) {
      console.error('[report] submit failed — code:', e?.code, 'message:', e?.message);
      Alert.alert(tr.report.failed_title, tr.report.failed);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ReportSheet
      visible={!!target}
      name={target?.reportedUserName ?? ''}
      title={target ? (tr.report as Record<string, string>)[`title_${target.targetType}`] : undefined}
      reason={reason}
      onReason={setReason}
      evidence={evidence}
      onPickEvidence={pickEvidence}
      onRemoveEvidence={(idx) => setEvidence((prev) => prev.filter((_, i) => i !== idx))}
      submitting={submitting}
      onSubmit={submit}
      onClose={close}
    />
  );
}
