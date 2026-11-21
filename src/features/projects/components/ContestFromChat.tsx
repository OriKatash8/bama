import { useState } from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { AppText } from '@components/ui/AppText';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useUiStore } from '@core/stores/uiStore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import type { ProjectFee } from '@core/types/project';
import { canDispute, contestEngagement } from '../services/completionService';
import { contestWindowEndsAt } from '../utils/completion';
import { contestErrorKey } from '../utils/contestErrors';
import { ContestEngagementSheet, type ContestReason } from './ContestEngagementSheet';

const DISPUTE_RED = '#b4453c';

type Translations = typeof en;
function makeT(translations: Translations) {
  return (key: string, vars?: Record<string, string | number>): string => {
    let value: unknown = translations;
    for (const k of key.split('.')) value = (value as Record<string, unknown> | undefined)?.[k];
    let out = typeof value === 'string' ? value : key;
    for (const [k, v] of Object.entries(vars ?? {})) out = out.replace(`{{${k}}}`, String(v));
    return out;
  };
}

/**
 * The professional's "there is a problem" action, in the chat of a FINISHED project,
 * beside the pay-fee (balance) button. It used to be a pill on the engagement card in
 * project details; the chat is where the fee is, so the way to challenge it sits there.
 *
 * Renders nothing unless THIS professional's own engagement can still be contested
 * (canDispute: completed, unpaid, inside the charge window) — the same predicate the
 * server enforces. The fee comes from the chat's own live listener, so after a contest
 * the button disappears by itself.
 */
export function ContestFromChat({
  projectId, projectTitle, fee,
}: {
  projectId: string;
  projectTitle: string;
  fee: ProjectFee | null | undefined;
}) {
  const language = useSettingsStore((s) => s.language);
  const showToast = useUiStore((s) => s.showToast);
  const t = makeT(language === 'he' ? he : en);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!canDispute(fee)) return null;

  async function onConfirm(reason: ContestReason, note: string) {
    if (busy) return;
    setBusy(true);
    try {
      await contestEngagement({ projectId, reason, ...(note ? { note } : {}) });
      setOpen(false);
      showToast(t('engagement.contest_sent'), 'success');
    } catch (err) {
      console.error('[completion] contestEngagement failed:', err);
      showToast(t(contestErrorKey(err)), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TouchableOpacity
        style={styles.pill}
        onPress={() => setOpen(true)}
        activeOpacity={0.85}
        accessibilityRole="button"
        testID="chat-contest-button"
      >
        <AppText weight="semiBold" style={styles.pillText}>{t('engagement.contest')}</AppText>
      </TouchableOpacity>
      <ContestEngagementSheet
        visible={open}
        projectTitle={projectTitle}
        submitting={busy}
        onConfirm={onConfirm}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

/** "You can raise an issue until <date>", or null when there is nothing to contest. */
export function contestWindowNote(
  fee: ProjectFee | null | undefined, language: 'he' | 'en',
): string | null {
  if (!canDispute(fee)) return null;
  const endsAt = contestWindowEndsAt(fee);
  if (endsAt === null) return null;
  const t = makeT(language === 'he' ? he : en);
  return t('engagement.contest_window', {
    date: new Date(endsAt).toLocaleDateString(language === 'he' ? 'he-IL' : 'en-US', { day: 'numeric', month: 'short' }),
  });
}

const styles = StyleSheet.create({
  // Outlined, not filled: raising an issue is quieter than paying, and must not compete
  // with the filled pay button beside it.
  pill: {
    borderWidth: 1, borderColor: DISPUTE_RED, borderRadius: 999,
    paddingHorizontal: 20, paddingVertical: 8,
  },
  pillText: { fontSize: 14, color: DISPUTE_RED },
});
