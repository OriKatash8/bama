import { create } from 'zustand';
import { updateDocument } from '@core/firebase/firestore';
import { useAuthStore } from '@core/stores/authStore';

/** A notice to surface to the affected user. Lives in its own store so it
 *  survives authStore.clear() (a suspension signs the user out). `actionId` is
 *  the admin action behind it (users/{uid}.moderation.actionId). */
export type ModerationNotice = {
  status: 'warned' | 'suspended';
  reason: string;
  actionId?: string;
};

type ModerationState = {
  notice: ModerationNotice | null;
  setNotice: (notice: ModerationNotice | null) => void;
  clearNotice: () => void;
  /**
   * The user tapped the notice's button. For a warning, remember that this
   * warning was seen (users/{uid}.moderationAckId), so signing in again — later
   * or on another device — does not show it again. A suspension saves nothing.
   * The notice closes either way; if saving fails it simply shows next time.
   */
  acknowledge: () => Promise<void>;
};

export const useModerationStore = create<ModerationState>((set, get) => ({
  notice: null,
  setNotice: (notice) => set({ notice }),
  clearNotice: () => set({ notice: null }),
  acknowledge: async () => {
    const { notice } = get();
    const uid = useAuthStore.getState().user?.id;
    set({ notice: null });
    if (notice?.status !== 'warned' || !notice.actionId || !uid) return;
    try {
      await updateDocument(`users/${uid}`, { moderationAckId: notice.actionId });
    } catch (e) {
      console.warn('[moderation] could not save the acknowledgement:', e);
    }
  },
}));
