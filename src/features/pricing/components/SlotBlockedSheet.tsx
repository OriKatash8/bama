import { Modal, View, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { AppText } from '@components/ui/AppText';
import { useSettingsStore } from '@core/stores/settingsStore';
import { usePricingConfig } from '../hooks/usePricingConfig';
import type { ProjectRequest, ProjectFee } from '@core/types/project';
import { slotReason } from '../utils/balance';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

type Translations = typeof en;
function makeT(translations: Translations) {
  return (key: string, vars?: Record<string, string | number>): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    if (typeof result !== 'string') return key;
    if (!vars) return result;
    return result.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ''));
  };
}

/**
 * Shown when a professional at the open-project cap taps a noticeboard notice —
 * BEFORE the price offer is composed, so they never fill in a price only to be
 * rejected by `hireProfessional` with `slot-cap-reached`.
 *
 * An EXPLAINER, with no way to buy past it. It used to offer two: settle the fee
 * on an occupied project, or take a subscription that lifted the cap. Both are
 * gone — a slot is freed by finishing or cancelling the work, and by nothing
 * else. The sheet's job is now to say which projects hold the slots.
 *
 * Every number comes from the runtime config; none is written into a string.
 *
 * ONE OF THE SLOTS MAY NOT BE HIS TO FREE. A contested engagement keeps holding
 * its slot on purpose — releasing it would make contesting a way to buy capacity
 * — but it is waiting on a BAMA decision, so this sheet must not list it beside
 * the others under "a slot frees when a project is completed or cancelled". It is
 * named as under review, with nothing asked of him.
 */
export function SlotBlockedSheet({
  visible,
  targetProject,
  occupied,
  myFees,
  onClose,
}: {
  visible: boolean;
  /** The notice they just tapped — named, so the sheet is about a decision
   *  rather than an abstract limit. */
  targetProject: ProjectRequest | null;
  /** The projects currently holding their slots, from `slotHolders`. */
  occupied: ProjectRequest[];
  /** THIS professional's own engagements, keyed by project — the only thing that
   *  can say why a given slot is held. The project's `adminReviewPending` cannot:
   *  it is true when anyone's engagement is in review, including engagements that
   *  are none of this professional's business. */
  myFees?: Map<string, ProjectFee>;
  onClose: () => void;
}) {
  const router = useRouter();
  const pricing = usePricingConfig();
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const rtl = language === 'he';
  const rowDir = rtl ? 'row-reverse' : ('row' as const);
  const align = rtl ? 'right' : 'left';
  const Chevron = rtl ? ChevronLeft : ChevronRight;

  /** Each slot opens the project holding it: the sheet says what to go and do,
   *  so it also takes you there. Closing first leaves no modal over the screen
   *  that is being pushed. */
  const openProject = (p: ProjectRequest) => {
    onClose();
    router.push(
      `/(client)/chat/project-details?projectId=${p.id}${p.chatId ? `&chatId=${p.chatId}` : ''}` as never,
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <AppText weight="bold" style={[styles.title, { textAlign: align }]}>
              {t('noticeboard.blocked_title')}
            </AppText>
            <AppText weight="regular" style={[styles.body, { textAlign: align }]}>
              {t('noticeboard.blocked_body', { project: targetProject?.title ?? '' })}
            </AppText>
            <AppText weight="semiBold" style={[styles.slotCount, { textAlign: align }]}>
              {t('noticeboard.blocked_slots', { used: occupied.length, cap: pricing.maxOpenProjects })}
            </AppText>

            {/* Which projects hold the slots, and what state each is in. No
                action button: nothing on this sheet frees a slot, because
                nothing a professional can buy does. */}
            {occupied.map((p) => {
              const reason = slotReason(p, myFees?.get(p.id));
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.slotRow, { flexDirection: rowDir }]}
                  onPress={() => openProject(p)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  testID={`slot-open-${p.id}`}
                >
                  <View style={styles.slotInfo}>
                    <AppText weight="semiBold" style={[styles.slotTitle, { textAlign: align }]} numberOfLines={1}>
                      {p.title}
                    </AppText>
                    <AppText
                      weight={reason === 'under_review' ? 'semiBold' : 'regular'}
                      style={[
                        styles.slotStatus,
                        reason === 'under_review' && { color: UNDER_REVIEW },
                        { textAlign: align },
                      ]}
                    >
                      {reason === 'under_review'
                        ? t('noticeboard.blocked_status_under_review')
                        : reason === 'completed'
                        ? t('noticeboard.blocked_status_completed')
                        : t('noticeboard.blocked_status_active')}
                    </AppText>
                  </View>
                  <View style={styles.slotGo}>
                    <Chevron size={16} color={BLUE} strokeWidth={2.4} />
                  </View>
                </TouchableOpacity>
              );
            })}

            <AppText weight="regular" style={[styles.howBody, { textAlign: align }]}>
              {t('noticeboard.blocked_how')}
            </AppText>
            {/* Only when one actually is. The general rule above stays true for
                the others, and this says plainly that the exception needs nothing
                from him — the sheet offers no action on it because there is none. */}
            {occupied.some((p) => slotReason(p, myFees?.get(p.id)) === 'under_review') && (
              <AppText weight="regular" style={[styles.howBody, { color: UNDER_REVIEW, textAlign: align }]}>
                {t('noticeboard.blocked_under_review_note')}
              </AppText>
            )}

            <TouchableOpacity style={styles.notNow} onPress={onClose} activeOpacity={0.7}>
              <AppText weight="regular" style={styles.notNowText}>
                {t('noticeboard.blocked_not_now')}
              </AppText>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** Professional mode's own colour — this sheet is only ever shown there. */
const BLUE = '#1D4ED8';
/** Everything the sheet says, except the dispute line. */
const INK = '#000000';
/** The contest palette, as project-details uses it — a slot held by a dispute is
 *  the same fact in a different place, and should look like it. */
const UNDER_REVIEW = '#b4453c';
const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '85%',
  },
  title: { fontSize: 19, marginBottom: 6, color: INK },
  body: { fontSize: 14, marginBottom: 10, lineHeight: 20, color: INK },
  slotCount: { fontSize: 12, marginBottom: 12, color: INK },
  slotRow: {
    alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 16,
    borderColor: BLUE,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
  },
  slotInfo: { flex: 1, gap: 2 },
  slotTitle: { fontSize: 14, color: INK },
  slotStatus: { fontSize: 12, color: INK },
  // The arrow that says the row goes somewhere. 28 + 8 either side = 44.
  slotGo: {
    width: 28, height: 28, borderRadius: 999,
    backgroundColor: '#E6EDFC', alignItems: 'center', justifyContent: 'center',
  },
  howBody: { fontSize: 13, lineHeight: 19, marginTop: 10, color: INK },
  notNow: { alignItems: 'center', paddingVertical: 16 },
  notNowText: { fontSize: 14, color: INK },
});
